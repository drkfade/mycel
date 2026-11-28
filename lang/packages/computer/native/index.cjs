"use strict";

const commandBuilders = require("./command-builders.cjs");
const png = require("./png.cjs");
const backends = require("./backends.cjs");
const { createHelperClient } = require("./helper-worker.cjs");

const N = (x) => Number(x);
const PANIC_MSG = "panic key triggered: Escape held for 1s";

function selectBackend(opts) {
  if (opts?.backend) return opts.backend;
  const mode = (process.env.MYCEL_COMPUTER_BACKEND || "live").trim().toLowerCase();
  if (mode === "dry-run" || mode === "dryrun") return backends.createDryRunBackend();
  if (mode === "mock") return backends.createMockBackend();
  return backends.createLiveBackend();
}

function createNatives(rt, helpers, opts = {}) {
  const caps = helpers.capabilities ?? {};
  const backend = selectBackend(opts);
  const panicPollMs = opts.panicPollMs ?? 100;
  let noticed = false;
  let panicTimer = null;
  let aborted = false;

  const checkPanic = () => {
    if (aborted) throw new helpers.Panic(PANIC_MSG, "abort");
    if (backend.checkPanic()) {
      aborted = true;
      stopPanicWatcher();
      backend.close();
      helpers.abort(PANIC_MSG);
      throw new helpers.Panic(PANIC_MSG, "abort");
    }
  };

  const stopPanicWatcher = () => {
    if (panicTimer) {
      clearInterval(panicTimer);
      panicTimer = null;
    }
  };

  const armInputSafety = () => {
    if (!noticed) {
      noticed = true;
      helpers.notice("[computer] safety: program is controlling input — hold Escape for 1s to abort");
    }
    if (!panicTimer && (backend.kind === "live" || opts.enablePanicWatcher)) {
      panicTimer = setInterval(() => {
        try {
          if (backend.checkPanic()) {
            aborted = true;
            stopPanicWatcher();
            backend.close();
            helpers.abort(PANIC_MSG);
          }
        } catch { /* ignore */ }
      }, panicPollMs);
      if (typeof panicTimer.unref === "function") panicTimer.unref();
    }
  };

  helpers.onCleanup(() => {
    stopPanicWatcher();
    backend.close();
  });

  const requireControl = () => {
    if (!caps.control) {
      return helpers.denied(
        "computer control",
        'this run was not granted control access — run with --allow-control or add "capabilities": { "control": true } to ply.json'
      );
    }
    return null;
  };
  const requireScreen = () => {
    if (!caps.screen) {
      return helpers.denied(
        "screen access",
        'this run was not granted screen access — run with --allow-screen or add "capabilities": { "screen": true } to ply.json'
      );
    }
    return null;
  };
  const requireClipboard = () => {
    if (!caps.clipboard) {
      return helpers.denied(
        "clipboard access",
        'this run was not granted clipboard access — run with --allow-clipboard or add "capabilities": { "clipboard": true } to ply.json'
      );
    }
    return null;
  };

  const runOp = (gate, isInputControl, op, args, mapVal = (v) => v) => {
    const denied = gate();
    if (denied) return denied;
    if (isInputControl) {
      armInputSafety();
      checkPanic();
    }
    try {
      const val = backend.call(op, args);
      if (isInputControl) checkPanic();
      return helpers.ok(mapVal(val));
    } catch (e) {
      if (e instanceof helpers.Panic) throw e;
      return helpers.err("Error", String(e?.message ?? e));
    }
  };

  const mkPoint = (p) => new (rt.ctx.M["computer.mouse"].Point)().$init(BigInt(Math.round(p.x)), BigInt(Math.round(p.y)));
  const mkSize = (s) => new (rt.ctx.M["computer.screen"].Size)().$init(BigInt(Math.round(s.width)), BigInt(Math.round(s.height)));
  const mkColor = (c) => new (rt.ctx.M["computer.screen"].Color)().$init(BigInt(c.r), BigInt(c.g), BigInt(c.b), BigInt(c.a));
  const mkBattery = (b) => new (rt.ctx.M["computer.system"].Battery)().$init(b.percent === null || b.percent === undefined ? null : BigInt(b.percent), Boolean(b.charging));

  return {
    // ----- computer.mouse -----
    "computer.mouse.position": () => runOp(requireControl, true, "mouse.position", {}, mkPoint),
    "computer.mouse.moveTo": (x, y) => runOp(requireControl, true, "mouse.moveTo", { x: N(x), y: N(y) }, () => undefined),
    "computer.mouse.click": (button = "left") => runOp(requireControl, true, "mouse.click", { button }, () => undefined),
    "computer.mouse.doubleClick": (button = "left") => runOp(requireControl, true, "mouse.doubleClick", { button }, () => undefined),
    "computer.mouse.scroll": (dx = 0n, dy = 0n) => runOp(requireControl, true, "mouse.scroll", { dx: N(dx), dy: N(dy) }, () => undefined),
    "computer.mouse.drag": (fromX, fromY, toX, toY, button = "left") =>
      runOp(requireControl, true, "mouse.drag", { fromX: N(fromX), fromY: N(fromY), toX: N(toX), toY: N(toY), button }, () => undefined),

    // ----- computer.keyboard -----
    "computer.keyboard.typeText": (text) => runOp(requireControl, true, "keyboard.typeText", { text }, () => undefined),
    "computer.keyboard.press": (key) => runOp(requireControl, true, "keyboard.press", { key }, () => undefined),
    "computer.keyboard.hotkey": (...keys) => runOp(requireControl, true, "keyboard.hotkey", { keys }, () => undefined),
    "computer.keyboard.isDown": (key) => runOp(requireControl, true, "keyboard.isDown", { key }, Boolean),

    // ----- computer.screen -----
    "computer.screen.size": () => runOp(requireScreen, false, "screen.size", {}, mkSize),
    "computer.screen.screenshot": () => runOp(requireScreen, false, "screen.screenshot", {}, (img) => img),
    "computer.screen.pixel": (x, y) => runOp(requireScreen, false, "screen.pixel", { x: N(x), y: N(y) }, mkColor),
    "computer.screen.Image.get_width": (img) => BigInt(img.width),
    "computer.screen.Image.get_height": (img) => BigInt(img.height),
    "computer.screen.Image.pixel": (img, x, y) => {
      const denied = requireScreen();
      if (denied) return denied;
      try { return helpers.ok(mkColor(png.readPixel(img, N(x), N(y)))); }
      catch (e) { return helpers.err("Error", String(e?.message ?? e)); }
    },
    "computer.screen.Image.save": (img, filePath) => {
      const denied = requireScreen();
      if (denied) return denied;
      const fsCheck = helpers.checkFsWrite(filePath);
      if ("why" in fsCheck) return helpers.denied(`fs.write of ${JSON.stringify(filePath)}`, fsCheck.why);
      try {
        backend.saveImage(img, fsCheck.path);
        return helpers.ok(undefined);
      } catch (e) {
        return helpers.err("IoError", String(e?.message ?? e));
      }
    },

    // ----- computer.clipboard -----
    "computer.clipboard.get": () => runOp(requireClipboard, false, "clipboard.get", {}, String),
    "computer.clipboard.set": (text) => runOp(requireClipboard, false, "clipboard.set", { text }, () => undefined),

    // ----- computer.apps -----
    "computer.apps.open": (name) => runOp(requireControl, false, "apps.open", { name }, () => undefined),
    "computer.apps.openFile": (filePath) => runOp(requireControl, false, "apps.openFile", { path: filePath }, () => undefined),
    "computer.apps.openUrl": (url) => runOp(requireControl, false, "apps.openUrl", { url }, () => undefined),
    "computer.apps.running": () => runOp(requireControl, false, "apps.running", {}, (xs) => Array.isArray(xs) ? xs.map(String) : []),
    "computer.apps.quit": (name) => runOp(requireControl, false, "apps.quit", { name }, () => undefined),

    // ----- computer.notify -----
    "computer.notify.show": (title, message) => runOp(requireControl, false, "notify.show", { title, message }, () => undefined),

    // ----- computer.system -----
    "computer.system.os": () => runOp(requireControl, false, "system.os", {}, String),
    "computer.system.user": () => runOp(requireControl, false, "system.user", {}, String),
    "computer.system.battery": () => runOp(requireControl, false, "system.battery", {}, mkBattery),
    "computer.system.idle": () => runOp(requireControl, false, "system.idle", {}, Number),
  };
}

module.exports = createNatives;
module.exports.createNatives = createNatives;
module.exports.commandBuilders = commandBuilders;
module.exports.png = png;
module.exports.createHelperClient = createHelperClient;
module.exports.createDryRunBackend = backends.createDryRunBackend;
module.exports.createMockBackend = backends.createMockBackend;
module.exports.createLiveBackend = backends.createLiveBackend;
