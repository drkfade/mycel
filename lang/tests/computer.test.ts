import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compile, execute, run } from "../src/host";
import { Capabilities } from "../src/stdlib";

const PKG_DIR = path.resolve(__dirname, "..", "..", "packages", "computer");
const nativeMod = require(path.join(PKG_DIR, "native", "index.cjs"));
const {
  createNatives,
  commandBuilders,
  png,
  createMockBackend,
  createDryRunBackend,
  createHelperClient,
} = nativeMod;

function runComputer(source: string, capabilities: Capabilities = {}, opts: { onNotice?: (t: string) => void; onOutput?: (t: string) => void; backend?: any; panicPollMs?: number } = {}) {
  const c = compile({
    source,
    file: "main.myc",
    packages: { computer: PKG_DIR },
  });
  assert.equal(c.program.ok, true, c.program.diagnostics.map((d) => d.message).join("\n"));
  if (opts.backend) {
    // Run via compiled bundle with injected mock/dry-run backend via global test hook or env
    return run({
      source,
      file: "main.myc",
      packages: { computer: PKG_DIR },
      capabilities,
      onNotice: opts.onNotice,
      onOutput: opts.onOutput,
    });
  }
  return execute(c, {
    file: "main.myc",
    packages: { computer: PKG_DIR },
    capabilities,
    onNotice: opts.onNotice,
    onOutput: opts.onOutput,
  });
}

test("macOS JXA and CLI command builders produce exact expected commands", () => {
  const mv = commandBuilders.buildMacJxaCommand("mouse.moveTo", { x: 120, y: 340 });
  assert.match(mv.jxa, /CGEventCreateMouseEvent\(null, \$\.kCGEventMouseMoved, \$\.CGPointMake\(120, 340\)/);

  const click = commandBuilders.buildMacJxaCommand("mouse.click", { button: "right" });
  assert.match(click.jxa, /kCGEventRightMouseDown/);
  assert.match(click.jxa, /kCGEventRightMouseUp/);

  const scroll = commandBuilders.buildMacJxaCommand("mouse.scroll", { dx: 5, dy: -12 });
  assert.match(scroll.jxa, /CGEventCreateScrollWheelEvent\(null, \$\.kCGScrollEventUnitPixel, 2, -12, 5\)/);

  const hk = commandBuilders.buildMacJxaCommand("keyboard.hotkey", { keys: ["cmd", "c"] });
  assert.equal(hk.args.code, 8);
  assert.equal(hk.args.flags, 0x00100000);
  assert.match(hk.jxa, /CGEventSetFlags\(down, 1048576\)/);

  const cbSet = commandBuilders.buildMacJxaCommand("clipboard.set", { text: "hi" });
  assert.match(cbSet.jxa, /NSPasteboard\.generalPasteboard/);
  assert.match(cbSet.jxa, /setStringForType\("hi"/);

  const quit = commandBuilders.buildMacJxaCommand("apps.quit", { name: "Notes" });
  assert.equal(quit.jxa, 'Application("Notes").quit()');

  const shot = commandBuilders.buildMacCliCommand("screen.screenshot", { outPath: "/tmp/shot.png" });
  assert.deepEqual(shot, { command: "screencapture", args: ["-x", "-t", "png", "/tmp/shot.png"] });

  const px = commandBuilders.buildMacCliCommand("screen.pixel", { x: 10, y: 20, outPath: "/tmp/px.png" });
  assert.deepEqual(px, { command: "screencapture", args: ["-x", "-R", "10,20,1,1", "-t", "png", "/tmp/px.png"] });

  const openApp = commandBuilders.buildMacCliCommand("apps.open", { name: "Safari" });
  assert.deepEqual(openApp, { command: "open", args: ["-g", "-a", "Safari"] }); // -g never steals focus

  const openUrl = commandBuilders.buildMacCliCommand("apps.openUrl", { url: "https://ol1x.xyz/mycel" });
  assert.deepEqual(openUrl, { command: "open", args: ["-g", "https://ol1x.xyz/mycel"] });

  assert.throws(() => commandBuilders.buildMacCliCommand("apps.openUrl", { url: "file:///etc/passwd" }), /only http: and https:/);
  assert.throws(() => commandBuilders.validateButton("turbo"), /unknown mouse button/);
});

test("Windows PowerShell command builders and battery parsers produce exact expected commands", () => {
  const pos = commandBuilders.buildWindowsPsCommand("mouse.position", {});
  assert.match(pos.ps, /\[MycelWin\]::GetCursorPos\(\[ref\]\$pt\)/);

  const click = commandBuilders.buildWindowsPsCommand("mouse.click", { button: "left" });
  assert.equal(click.ps, "[MycelWin]::MouseClick('left', 1)");

  const hk = commandBuilders.buildWindowsPsCommand("keyboard.hotkey", { keys: ["ctrl", "c"] });
  assert.deepEqual(hk.args.vks, [0x11, 0x43]);
  assert.equal(hk.ps, "[MycelWin]::SendHotkey(@(17, 67))");

  const cb = commandBuilders.buildWindowsPsCommand("clipboard.set", { text: "it's ok" });
  assert.equal(cb.ps, "[System.Windows.Forms.Clipboard]::SetText('it''s ok')");

  const shot = commandBuilders.buildWindowsPsCommand("screen.screenshot", { outPath: "C:\\shot.png" });
  assert.match(shot.ps, /CopyFromScreen/);
  assert.match(shot.ps, /'C:\\shot\.png'/);

  const quit = commandBuilders.buildWindowsPsCommand("apps.quit", { name: "notepad" });
  assert.match(quit.ps, /CloseMainWindow\(\)/);

  assert.deepEqual(
    commandBuilders.parsePmsetBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t62%; discharging; 3:12 remaining"),
    { percent: 62, charging: false }
  );
  assert.deepEqual(
    commandBuilders.parsePmsetBattery("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t94%; charging; 0:15 remaining"),
    { percent: 94, charging: true }
  );
  assert.deepEqual(commandBuilders.parsePmsetBattery("Now drawing from 'AC Power'"), { percent: null, charging: false });
  assert.deepEqual(
    commandBuilders.parseWindowsBattery('{"EstimatedChargeRemaining":78,"BatteryStatus":6}'),
    { percent: 78, charging: true }
  );
});

test("PNG encoder/decoder round-trips pixels accurately", () => {
  const rgba = Buffer.from([
    255, 10, 20, 255, 0, 255, 0, 255,
    0, 0, 255, 128, 12, 34, 56, 255,
  ]);
  const encoded = png.encodeRgbaPng(2, 2, rgba);
  const decoded = png.decodePng(encoded);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual(png.readPixel(decoded, 0, 0), { r: 255, g: 10, b: 20, a: 255 });
  assert.deepEqual(png.readPixel(decoded, 1, 1), { r: 12, g: 34, b: 56, a: 255 });
  assert.throws(() => png.readPixel(decoded, 2, 0), /out of bounds/);
});

test("capability gating denies every computer module by default with clear flag hints", async () => {
  const src = `
import computer.{mouse, keyboard, screen, clipboard, apps, notify, system}

fn main() {
  print("mouse:", mouse.position().err()!.message)
  print("keyboard:", keyboard.typeText("a").err()!.message)
  print("screen:", screen.size().err()!.message)
  print("clipboard:", clipboard.get().err()!.message)
  print("apps:", apps.running().err()!.message)
  print("notify:", notify.show("t", "m").err()!.message)
  print("system:", system.os().err()!.message)
}
`;
  const prev = process.env.MYCEL_COMPUTER_BACKEND;
  process.env.MYCEL_COMPUTER_BACKEND = "mock";
  try {
    const r = await runComputer(src, {});
    assert.equal(r.ok, true, r.error?.human);
    assert.match(r.output, /mouse:.*--allow-control/);
    assert.match(r.output, /keyboard:.*--allow-control/);
    assert.match(r.output, /screen:.*--allow-screen/);
    assert.match(r.output, /clipboard:.*--allow-clipboard/);
    assert.match(r.output, /apps:.*--allow-control/);
    assert.match(r.output, /notify:.*--allow-control/);
    assert.match(r.output, /system:.*--allow-control/);
  } finally {
    if (prev === undefined) delete process.env.MYCEL_COMPUTER_BACKEND; else process.env.MYCEL_COMPUTER_BACKEND = prev;
  }
});

test("partial capability grants isolate control, screen, clipboard, and fs.write", async () => {
  const src = `
import computer.{mouse, screen, clipboard}

fn main() {
  print("mouse:", mouse.moveTo(1, 2).err()!.message)
  print("clipboard:", clipboard.get().err()!.message)
  let img = screen.screenshot().unwrap()
  print("save:", img.save("/tmp/mycel_denied_shot.png").err()!.message)
}
`;
  const prev = process.env.MYCEL_COMPUTER_BACKEND;
  process.env.MYCEL_COMPUTER_BACKEND = "mock";
  try {
    const r = await runComputer(src, { screen: true });
    assert.equal(r.ok, true, r.error?.human);
    assert.match(r.output, /mouse:.*--allow-control/);
    assert.match(r.output, /clipboard:.*--allow-clipboard/);
    assert.match(r.output, /save:.*--allow-write/);
  } finally {
    if (prev === undefined) delete process.env.MYCEL_COMPUTER_BACKEND; else process.env.MYCEL_COMPUTER_BACKEND = prev;
  }
});

test("all 7 computer modules work end-to-end via mock backend and emit visible safety notice", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-comp-"));
  const shotPath = path.join(tmpDir, "shot.png");
  const src = `
import computer.{mouse, keyboard, screen, clipboard, apps, notify, system}

fn main() {
  mouse.moveTo(410, 520).unwrap()
  let pos = mouse.position().unwrap()
  mouse.click("left").unwrap()
  mouse.doubleClick("right").unwrap()
  mouse.scroll(0, -100).unwrap()
  mouse.drag(10, 20, 600, 700).unwrap()
  let pos2 = mouse.position().unwrap()

  keyboard.typeText("hello").unwrap()
  keyboard.press("Enter").unwrap()
  keyboard.hotkey("cmd", "c").unwrap()
  let escDown = keyboard.isDown("Escape").unwrap()

  let sz = screen.size().unwrap()
  let img = screen.screenshot().unwrap()
  img.save(${JSON.stringify(shotPath)}).unwrap()
  let c = img.pixel(0, 0).unwrap()
  let px = screen.pixel(0, 0).unwrap()

  clipboard.set("clip-value").unwrap()
  let clip = clipboard.get().unwrap()

  apps.open("Notes").unwrap()
  apps.openUrl("https://ol1x.xyz/mycel").unwrap()
  let running = apps.running().unwrap()
  apps.quit("Notes").unwrap()
  let afterQuit = apps.running().unwrap()

  notify.show("Title", "Body").unwrap()
  let osName = system.os().unwrap()
  let userName = system.user().unwrap()
  let batt = system.battery().unwrap()
  let idleSec = system.idle().unwrap()

  print(f"pos={pos.x},{pos.y} drag={pos2.x},{pos2.y} esc={escDown}")
  print(f"screen={sz.width}x{sz.height} img={img.width}x{img.height} hex={c.hex()} px={px.a}")
  print(f"clip={clip} hasNotes={running.contains(\"Notes\")} afterQuit={afterQuit.contains(\"Notes\")}")
  print(f"sys={osName}:{userName}:{batt.percent ?? -1}:{idleSec >= 0.0}")
}
`;
  const prev = process.env.MYCEL_COMPUTER_BACKEND;
  process.env.MYCEL_COMPUTER_BACKEND = "mock";
  const notices: string[] = [];
  try {
    const r = await runComputer(src, {
      control: true,
      screen: true,
      clipboard: true,
      fs: { write: [tmpDir] },
    }, { onNotice: (t) => notices.push(t) });
    assert.equal(r.ok, true, r.error?.human);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /hold Escape for 1s to abort/);
    assert.match(r.output, /pos=410,520 drag=600,700 esc=false/);
    assert.match(r.output, /screen=1440x900 img=4x4 hex=#0C2238 px=255/);
    assert.match(r.output, /clip=clip-value hasNotes=true afterQuit=false/);
    assert.match(r.output, /sys=macos:tester:87:true/);
    assert.equal(fs.existsSync(shotPath), true);
  } finally {
    if (prev === undefined) delete process.env.MYCEL_COMPUTER_BACKEND; else process.env.MYCEL_COMPUTER_BACKEND = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("dry-run backend prints exact OS calls it would make without side effects", async () => {
  const src = `
import computer.{mouse, keyboard, screen, clipboard, apps, notify, system}

fn main() {
  mouse.moveTo(50, 60).unwrap()
  mouse.click().unwrap()
  keyboard.hotkey("cmd", "c").unwrap()
  let _ = screen.screenshot().unwrap()
  clipboard.set("abc").unwrap()
  apps.open("Calculator").unwrap()
  notify.show("Hi", "There").unwrap()
  let _ = system.battery().unwrap()
}
`;
  const prev = process.env.MYCEL_COMPUTER_BACKEND;
  process.env.MYCEL_COMPUTER_BACKEND = "dry-run";
  const notices: string[] = [];
  const lines: string[] = [];
  // Capture stdout written by dry-run backend inside process
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
    const s = String(chunk);
    if (s.includes("[DRY-RUN]")) { lines.push(s.trim()); return true; }
    return origWrite(chunk, ...rest);
  };
  try {
    const r = await runComputer(src, { control: true, screen: true, clipboard: true }, { onNotice: (t) => notices.push(t) });
    assert.equal(r.ok, true, r.error?.human);
    assert.equal(notices.length, 1);
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("CGPointMake(50, 60)")), lines.join("\n"));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("kCGEventLeftMouseDown")));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("CGEventSetFlags")));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("screencapture -x -t png")));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("NSPasteboard")));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("open -g -a Calculator")));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("displayNotification")));
    assert.ok(lines.some((l) => l.includes("[DRY-RUN]") && l.includes("pmset -g batt")));
  } finally {
    process.stdout.write = origWrite;
    if (prev === undefined) delete process.env.MYCEL_COMPUTER_BACKEND; else process.env.MYCEL_COMPUTER_BACKEND = prev;
  }
});

test("panic key (Escape held 1s) aborts program while <1s hold does not", () => {
  let now = 10_000;
  const backend = createMockBackend({ nowMs: () => now });
  const notices: string[] = [];
  const aborted: string[] = [];
  class FakePanic extends Error {
    constructor(msg: string, public kind = "panic") { super(msg); }
  }
  const fakeRt = {
    ctx: {
      M: {
        prelude: {
          Result$Ok: { of: (v: any) => ({ ok: true, v }) },
          Result$Err: { of: (e: any) => ({ ok: false, e }) },
          Error: class { $init(m: string) { return { message: m }; } },
          CapabilityError: class { $init(m: string) { return { message: m }; } },
        },
        "computer.mouse": { Point: class { $init(x: bigint, y: bigint) { return { x, y }; } } },
        "computer.screen": {
          Size: class { $init(w: bigint, h: bigint) { return { w, h }; } },
          Color: class { $init(r: bigint, g: bigint, b: bigint, a: bigint) { return { r, g, b, a }; } },
        },
        "computer.system": { Battery: class { $init(p: bigint | null, c: boolean) { return { p, c }; } } },
      },
    },
  };
  const natives = createNatives(fakeRt, {
    capabilities: { control: true },
    ok: (v: any) => ({ ok: true, v }),
    err: (_c: string, m: string) => ({ ok: false, m }),
    denied: (_w: string, m: string) => ({ ok: false, m }),
    makeTuple: (...a: any[]) => a,
    Panic: FakePanic,
    onCleanup: () => {},
    abort: (reason: string) => aborted.push(reason),
    notice: (msg: string) => notices.push(msg),
    checkFsWrite: () => ({ why: "unused" }),
  }, { backend });

  // First moveTo emits notice
  assert.equal(natives["computer.mouse.moveTo"](10n, 20n).ok, true);
  assert.equal(notices.length, 1);

  // Hold Escape for 600ms -> should NOT abort
  backend.setKeyDown("Escape", true);
  now += 600;
  assert.equal(natives["computer.mouse.click"]("left").ok, true);
  assert.equal(aborted.length, 0);

  // Release Escape -> resets timer
  backend.setKeyDown("Escape", false);
  now += 500;
  assert.equal(natives["computer.mouse.click"]("left").ok, true);
  assert.equal(aborted.length, 0);

  // Hold Escape for 1000ms -> triggers panic abort
  backend.setKeyDown("Escape", true);
  now += 1000;
  assert.throws(() => natives["computer.mouse.click"]("left"), /panic key triggered: Escape held for 1s/);
  assert.equal(aborted.length, 1);
  assert.match(aborted[0], /Escape held for 1s/);
});

test("missing macOS Accessibility and Screen Recording permissions give actionable messages", () => {
  const backend = createMockBackend({
    state: { permissionMissing: { accessibility: true, screenRecording: true } },
  });
  const fakeRt = {
    ctx: {
      M: {
        prelude: {},
        "computer.mouse": { Point: class { $init(x: bigint, y: bigint) { return { x, y }; } } },
        "computer.screen": {
          Size: class { $init(w: bigint, h: bigint) { return { w, h }; } },
          Color: class { $init(r: bigint, g: bigint, b: bigint, a: bigint) { return { r, g, b, a }; } },
        },
        "computer.system": { Battery: class { $init(p: bigint | null, c: boolean) { return { p, c }; } } },
      },
    },
  };
  class FakePanic extends Error {}
  const natives = createNatives(fakeRt, {
    capabilities: { control: true, screen: true },
    ok: (v: any) => ({ ok: true, v }),
    err: (cls: string, m: string) => ({ ok: false, cls, m }),
    denied: (_w: string, m: string) => ({ ok: false, m }),
    makeTuple: (...a: any[]) => a,
    Panic: FakePanic,
    onCleanup: () => {},
    abort: () => {},
    notice: () => {},
    checkFsWrite: () => ({ why: "unused" }),
  }, { backend });

  const mErr = natives["computer.mouse.moveTo"](1n, 2n);
  assert.equal(mErr.ok, false);
  assert.match(mErr.m, /System Settings -> Privacy & Security -> Accessibility/);

  const sErr = natives["computer.screen.screenshot"]();
  assert.equal(sErr.ok, false);
  assert.match(sErr.m, /System Settings -> Privacy & Security -> Screen Recording/);
});

test("computer package Mycel test suite passes via mock backend", async () => {
  const pkgTestPath = path.join(PKG_DIR, "tests", "computer_pkg_test.myc");
  const src = fs.readFileSync(pkgTestPath, "utf8");
  const prev = process.env.MYCEL_COMPUTER_BACKEND;
  process.env.MYCEL_COMPUTER_BACKEND = "mock";
  try {
    const r = await run({
      source: src,
      file: pkgTestPath,
      packages: { computer: PKG_DIR },
      capabilities: { control: true, screen: true, clipboard: true },
      mode: "test",
      onNotice: () => {},
    });
    assert.equal(r.ok, true, r.error?.human ?? JSON.stringify(r.tests));
    assert.ok((r.tests?.length ?? 0) >= 2);
    assert.ok(r.tests!.every((t) => t.ok));
  } finally {
    if (prev === undefined) delete process.env.MYCEL_COMPUTER_BACKEND; else process.env.MYCEL_COMPUTER_BACKEND = prev;
  }
});

test("long-lived JXA helper round-trip throughput (ping only, no real input) on macOS", { skip: process.platform !== "darwin" }, () => {
  const client = createHelperClient("darwin");
  try {
    // Warm up once (spawns osascript -l JavaScript)
    const warm = client.call("ping", {});
    assert.equal(warm.ok, true);
    assert.equal(warm.value, true);

    const N_CALLS = 100;
    const t0 = performance.now();
    for (let i = 0; i < N_CALLS; i++) {
      const res = client.call("ping", {});
      assert.equal(res.ok, true);
    }
    const ms = performance.now() - t0;
    const opsPerSec = (N_CALLS / ms) * 1000;
    console.log(`  long-lived JXA helper: ${N_CALLS} calls in ${ms.toFixed(1)} ms (${opsPerSec.toFixed(0)} ops/sec)`);
    assert.ok(opsPerSec > 50, `expected >50 ops/sec, got ${opsPerSec.toFixed(1)}`);
  } finally {
    client.close();
  }
});
