"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const builders = require("./command-builders.cjs");
const png = require("./png.cjs");
const { createHelperClient } = require("./helper-worker.cjs");

function osNameOf(platform) {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return platform;
}

/**
 * Dry-run backend: validates arguments, prints the exact OS commands it would run,
 * and returns deterministic synthetic values without touching the host OS.
 */
function createDryRunBackend(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const log = opts.log ?? ((line) => process.stdout.write(line + "\n"));
  const calls = [];
  const emit = (op, args) => {
    const line = builders.buildDryRunLine(platform, op, args);
    calls.push({ op, args, line });
    log(line);
  };

  const makeSyntheticImage = () => {
    const width = 2, height = 2;
    const rgba = Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    return { width, height, rgba, pngBuffer: png.encodeRgbaPng(width, height, rgba) };
  };

  return {
    kind: "dry-run",
    calls,
    call(op, args = {}) {
      switch (op) {
        case "mouse.position": emit(op, args); return { x: 0, y: 0 };
        case "mouse.moveTo":
          emit(op, { x: Number(args.x), y: Number(args.y) });
          return null;
        case "mouse.click":
        case "mouse.doubleClick":
          emit(op, { button: builders.validateButton(args.button) });
          return null;
        case "mouse.scroll":
          emit(op, { dx: Number(args.dx ?? 0), dy: Number(args.dy ?? 0) });
          return null;
        case "mouse.drag":
          emit(op, {
            fromX: Number(args.fromX), fromY: Number(args.fromY),
            toX: Number(args.toX), toY: Number(args.toY),
            button: builders.validateButton(args.button),
          });
          return null;
        case "keyboard.typeText":
          emit(op, { text: String(args.text ?? "") });
          return null;
        case "keyboard.press":
          emit(op, { key: String(args.key ?? "") });
          return null;
        case "keyboard.hotkey":
          emit(op, { keys: Array.isArray(args.keys) ? args.keys : [] });
          return null;
        case "keyboard.isDown":
          emit(op, { key: String(args.key ?? "") });
          return false;
        case "screen.size":
          emit(op, {});
          return { width: 1920, height: 1080 };
        case "screen.screenshot":
          emit(op, { outPath: "<temp-screenshot.png>" });
          return makeSyntheticImage();
        case "screen.pixel":
          emit(op, { x: Number(args.x), y: Number(args.y), outPath: "<temp-pixel.png>" });
          return { r: 0, g: 0, b: 0, a: 255 };
        case "clipboard.get":
          emit(op, {});
          return "";
        case "clipboard.set":
          emit(op, { text: String(args.text ?? "") });
          return null;
        case "apps.open":
          emit(op, { name: String(args.name ?? "") });
          return null;
        case "apps.openFile":
          emit(op, { path: String(args.path ?? "") });
          return null;
        case "apps.openUrl":
          emit(op, { url: builders.validateHttpUrl(args.url) });
          return null;
        case "apps.running":
          emit(op, {});
          return [platform === "win32" ? "explorer" : "Finder"];
        case "apps.quit":
          emit(op, { name: String(args.name ?? "") });
          return null;
        case "notify.show":
          emit(op, { title: String(args.title ?? ""), message: String(args.message ?? "") });
          return null;
        case "system.os":
          emit(op, {});
          return osNameOf(platform);
        case "system.user":
          emit(op, {});
          return os.userInfo().username;
        case "system.battery":
          emit(op, {});
          return { percent: 100, charging: true };
        case "system.idle":
          emit(op, {});
          return 0.0;
        default:
          throw new Error(`unknown op: ${op}`);
      }
    },
    saveImage(img, safePath) {
      const line = `[DRY-RUN] write PNG (${img.width}x${img.height}) -> ${safePath}`;
      calls.push({ op: "screen.Image.save", args: { path: safePath }, line });
      log(line);
    },
    checkPanic() { return false; },
    close() {},
  };
}

/**
 * In-memory mock backend for deterministic unit and integration tests.
 * Never touches the real mouse, keyboard, clipboard, screen, or OS apps.
 */
function createMockBackend(opts = {}) {
  const platform = opts.platform ?? "darwin";
  const nowMs = opts.nowMs ?? (() => Date.now());
  const state = {
    cursor: { x: 100, y: 200 },
    clipboard: "",
    screenSize: { width: 1440, height: 900 },
    pixels: new Map(), // "x,y" -> { r, g, b, a }
    keysDown: new Set(),
    escHeldSince: 0,
    apps: ["Finder", "Terminal"],
    notifications: [],
    user: "tester",
    battery: { percent: 87, charging: false },
    idle: 1.5,
    permissionMissing: { accessibility: false, screenRecording: false },
    ...(opts.state ?? {}),
  };
  const calls = [];

  const checkAcc = () => {
    if (state.permissionMissing?.accessibility) {
      const err = new Error("macOS Accessibility permission is required: open System Settings -> Privacy & Security -> Accessibility and enable your terminal or Mycel runner.");
      err.isPermission = true;
      throw err;
    }
  };
  const checkScr = () => {
    if (state.permissionMissing?.screenRecording) {
      const err = new Error("macOS Screen Recording permission is required: open System Settings -> Privacy & Security -> Screen Recording and enable your terminal or Mycel runner.");
      err.isPermission = true;
      throw err;
    }
  };

  const checkPanic = () => {
    const down = state.keysDown.has("escape") || state.keysDown.has("esc");
    const t = nowMs();
    if (down) {
      if (!state.escHeldSince) state.escHeldSince = t;
      return (t - state.escHeldSince) >= 1000;
    }
    state.escHeldSince = 0;
    return false;
  };

  return {
    kind: "mock",
    state,
    calls,
    setKeyDown(key, down) {
      const nk = builders.normalizeKey(key);
      if (down) {
        state.keysDown.add(nk);
        if ((nk === "escape" || nk === "esc") && !state.escHeldSince) state.escHeldSince = nowMs();
      } else {
        state.keysDown.delete(nk);
        if (nk === "escape" || nk === "esc") state.escHeldSince = 0;
      }
    },
    call(op, args = {}) {
      calls.push({ op, args });
      switch (op) {
        case "mouse.position": return { ...state.cursor };
        case "mouse.moveTo":
          checkAcc();
          state.cursor = { x: Number(args.x), y: Number(args.y) };
          return null;
        case "mouse.click":
        case "mouse.doubleClick":
          checkAcc();
          builders.validateButton(args.button);
          return null;
        case "mouse.scroll":
          checkAcc();
          return null;
        case "mouse.drag":
          checkAcc();
          builders.validateButton(args.button);
          state.cursor = { x: Number(args.toX), y: Number(args.toY) };
          return null;
        case "keyboard.typeText":
          checkAcc();
          return null;
        case "keyboard.press":
          checkAcc();
          if (platform === "win32") builders.winVkCode(args.key); else builders.macKeyCode(args.key);
          return null;
        case "keyboard.hotkey": {
          checkAcc();
          const keys = Array.isArray(args.keys) ? args.keys : [];
          if (!keys.length) throw new Error("hotkey requires at least one key");
          for (const k of keys) { if (platform === "win32") builders.winVkCode(k); else builders.macKeyCode(k); }
          return null;
        }
        case "keyboard.isDown":
          if (platform === "win32") builders.winVkCode(args.key); else builders.macKeyCode(args.key);
          return state.keysDown.has(builders.normalizeKey(args.key));
        case "screen.size":
          return { ...state.screenSize };
        case "screen.screenshot": {
          checkScr();
          const width = 4, height = 4;
          const rgba = Buffer.alloc(width * height * 4, 255);
          const p0 = state.pixels.get("0,0") ?? { r: 12, g: 34, b: 56, a: 255 };
          rgba[0] = p0.r; rgba[1] = p0.g; rgba[2] = p0.b; rgba[3] = p0.a;
          return { width, height, rgba, pngBuffer: png.encodeRgbaPng(width, height, rgba) };
        }
        case "screen.pixel": {
          checkScr();
          const key = `${Number(args.x)},${Number(args.y)}`;
          return state.pixels.get(key) ?? { r: 0, g: 0, b: 0, a: 255 };
        }
        case "clipboard.get":
          return String(state.clipboard);
        case "clipboard.set":
          state.clipboard = String(args.text ?? "");
          return null;
        case "apps.open":
          if (!state.apps.includes(args.name)) state.apps.push(String(args.name));
          return null;
        case "apps.openFile":
          return null;
        case "apps.openUrl":
          builders.validateHttpUrl(args.url);
          return null;
        case "apps.running":
          return [...state.apps];
        case "apps.quit":
          state.apps = state.apps.filter((a) => a !== args.name);
          return null;
        case "notify.show":
          state.notifications.push({ title: String(args.title ?? ""), message: String(args.message ?? "") });
          return null;
        case "system.os":
          return osNameOf(platform);
        case "system.user":
          return state.user;
        case "system.battery":
          return { ...state.battery };
        case "system.idle":
          return state.idle;
        default:
          throw new Error(`unknown op: ${op}`);
      }
    },
    saveImage(img, safePath) {
      calls.push({ op: "screen.Image.save", args: { path: safePath } });
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, img.pngBuffer);
    },
    checkPanic,
    close() {},
  };
}

/**
 * Real OS backend using a single long-lived helper (`osascript -l JavaScript` on macOS,
 * `powershell.exe` on Windows) plus native OS tools (`screencapture`, `open -g`, `pmset`).
 */
function createLiveBackend(opts = {}) {
  const platform = opts.platform ?? process.platform;
  let client = null;
  let panicHit = false;

  const ensureClient = () => {
    if (platform !== "darwin" && platform !== "win32") {
      throw new Error(`computer package Linux backend is planned (currently supported on macOS and Windows; use MYCEL_COMPUTER_BACKEND=dry-run or mock on ${platform})`);
    }
    if (!client) client = createHelperClient(platform);
    return client;
  };

  const runHelper = (op, args = {}) => {
    const res = ensureClient().call(op, args);
    if (res.panic) panicHit = true;
    if (!res.ok) {
      const msg = res.error?.message ?? `helper failed on ${op}`;
      throw new Error(msg);
    }
    return res.value;
  };

  const runCli = (cmd, args) => {
    const r = cp.spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 15000 });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      const errText = (r.stderr || r.stdout || "").trim();
      if (platform === "darwin" && cmd === "screencapture") {
        throw new Error(
          `macOS Screen Recording permission is required (or screencapture failed${errText ? ": " + errText : ""}): open System Settings -> Privacy & Security -> Screen Recording and enable your terminal or Mycel runner.`
        );
      }
      throw new Error(`${cmd} exited with status ${r.status}${errText ? ": " + errText : ""}`);
    }
    return r.stdout ?? "";
  };

  return {
    kind: "live",
    call(op, args = {}) {
      if (op === "system.os") return osNameOf(platform);
      if (op === "system.user") return os.userInfo().username;

      if (platform === "darwin") {
        if (op === "apps.open" || op === "apps.openFile" || op === "apps.openUrl") {
          const cli = builders.buildMacCliCommand(op, args);
          runCli(cli.command, cli.args);
          return null;
        }
        if (op === "system.battery") {
          const cli = builders.buildMacCliCommand(op, {});
          return builders.parsePmsetBattery(runCli(cli.command, cli.args));
        }
        if (op === "screen.screenshot" || op === "screen.pixel") {
          const tmp = path.join(os.tmpdir(), `mycel-shot-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
          try {
            const cli = builders.buildMacCliCommand(op, { ...args, outPath: tmp });
            runCli(cli.command, cli.args);
            if (!fs.existsSync(tmp)) {
              throw new Error("macOS Screen Recording permission is required: open System Settings -> Privacy & Security -> Screen Recording and enable your terminal or Mycel runner.");
            }
            const buf = fs.readFileSync(tmp);
            const decoded = png.decodePng(buf);
            if (op === "screen.pixel") return png.readPixel(decoded, 0, 0);
            return { ...decoded, pngBuffer: buf };
          } finally {
            try { fs.unlinkSync(tmp); } catch { /* ignore */ }
          }
        }
        const built = builders.buildMacJxaCommand(op, args);
        return runHelper(built.op, built.args);
      }

      if (platform === "win32") {
        if (op === "screen.screenshot") {
          const tmp = path.join(os.tmpdir(), `mycel-shot-${process.pid}-${Date.now()}.png`);
          try {
            runHelper("screen.screenshot", { outPath: tmp });
            const buf = fs.readFileSync(tmp);
            const decoded = png.decodePng(buf);
            return { ...decoded, pngBuffer: buf };
          } finally {
            try { fs.unlinkSync(tmp); } catch { /* ignore */ }
          }
        }
        if (op === "apps.open" || op === "apps.openFile" || op === "apps.openUrl") {
          const built = builders.buildWindowsPsCommand(op, args);
          runCli("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", built.ps]);
          return null;
        }
        if (op === "system.battery") {
          const built = builders.buildWindowsPsCommand(op, {});
          return builders.parseWindowsBattery(runCli("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", built.ps]));
        }
        const built = builders.buildWindowsPsCommand(op, args);
        return runHelper(built.op, built.args);
      }

      throw new Error(`computer package Linux backend is planned (currently supported on macOS and Windows; use MYCEL_COMPUTER_BACKEND=dry-run or mock on ${platform})`);
    },
    saveImage(img, safePath) {
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, img.pngBuffer);
    },
    checkPanic() {
      if (panicHit) return true;
      if (!client || !client.isRunning()) return false;
      try {
        const res = client.call("panic.check", {});
        if (res.panic || res.value?.triggered) {
          panicHit = true;
          return true;
        }
      } catch { /* helper closed */ }
      return false;
    },
    close() {
      if (client) { client.close(); client = null; }
    },
  };
}

module.exports = {
  createDryRunBackend,
  createMockBackend,
  createLiveBackend,
};
