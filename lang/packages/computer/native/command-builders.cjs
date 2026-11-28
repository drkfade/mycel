"use strict";

// Pure, side-effect-free OS command builders & parsers for macOS and Windows.
// Exported separately so unit tests can assert exact generated commands on any OS
// without executing real input, clipboard, or screen operations.

const MAC_KEY_CODES = Object.freeze({
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9,
  b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25,
  "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, o: 31, u: 32, "[": 33,
  i: 34, p: 35, enter: 36, return: 36, l: 37, j: 38, "'": 39, k: 40,
  ";": 41, "\\": 42, ",": 43, "/": 44, n: 45, m: 46, ".": 47,
  tab: 48, space: 49, "`": 50, backspace: 51, delete: 51, escape: 53, esc: 53,
  cmd: 55, command: 55, shift: 56, capslock: 57, alt: 58, option: 58,
  ctrl: 59, control: 59, fn: 63,
  f17: 64, f18: 79, f19: 80, f20: 90,
  f5: 96, f6: 97, f7: 98, f3: 99, f8: 100, f9: 101, f11: 103, f13: 105,
  f16: 106, f14: 107, f10: 109, f12: 111, f15: 113, home: 115, pageup: 116,
  forwarddelete: 117, del: 117, f4: 118, end: 119, f2: 120, pagedown: 121,
  f1: 122, left: 123, right: 124, down: 125, up: 126,
});

const MAC_MODIFIER_FLAGS = Object.freeze({
  cmd: 0x00100000, // kCGEventFlagMaskCommand
  command: 0x00100000,
  shift: 0x00020000, // kCGEventFlagMaskShift
  alt: 0x00080000, // kCGEventFlagMaskAlternate
  option: 0x00080000,
  ctrl: 0x00040000, // kCGEventFlagMaskControl
  control: 0x00040000,
});

const WIN_VK_CODES = Object.freeze({
  backspace: 0x08, tab: 0x09, enter: 0x0D, return: 0x0D,
  shift: 0x10, ctrl: 0x11, control: 0x11, alt: 0x12, option: 0x12,
  capslock: 0x14, escape: 0x1B, esc: 0x1B, space: 0x20,
  pageup: 0x21, pagedown: 0x22, end: 0x23, home: 0x24,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  delete: 0x2E, del: 0x2E, forwarddelete: 0x2E,
  "0": 0x30, "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34,
  "5": 0x35, "6": 0x36, "7": 0x37, "8": 0x38, "9": 0x39,
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47,
  h: 0x48, i: 0x49, j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E,
  o: 0x4F, p: 0x50, q: 0x51, r: 0x52, s: 0x53, t: 0x54, u: 0x55,
  v: 0x56, w: 0x57, x: 0x58, y: 0x59, z: 0x5A,
  cmd: 0x5B, command: 0x5B, win: 0x5B, super: 0x5B,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  ";": 0xBA, "=": 0xBB, ",": 0xBC, "-": 0xBD, ".": 0xBE, "/": 0xBF,
  "`": 0xC0, "[": 0xDB, "\\": 0xDC, "]": 0xDD, "'": 0xDE,
});

function normalizeKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function macKeyCode(key) {
  const k = normalizeKey(key);
  if (!(k in MAC_KEY_CODES)) throw new Error(`unknown key "${key}" for macOS`);
  return MAC_KEY_CODES[k];
}

function winVkCode(key) {
  const k = normalizeKey(key);
  if (!(k in WIN_VK_CODES)) throw new Error(`unknown key "${key}" for Windows`);
  return WIN_VK_CODES[k];
}

function validateButton(button) {
  const b = String(button ?? "left").trim().toLowerCase();
  if (b !== "left" && b !== "right" && b !== "middle") {
    throw new Error(`unknown mouse button "${button}" (expected "left", "right", or "middle")`);
  }
  return b;
}

function validateHttpUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch {
    throw new Error(`invalid URL ${JSON.stringify(rawUrl)}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`unsupported URL scheme ${u.protocol} (only http: and https: are allowed)`);
  }
  return u.href;
}

/** Escape a string for single-quoted PowerShell literal `'...'`. */
function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * Build the exact macOS JXA CoreGraphics / AppKit / ApplicationServices expression
 * and structured helper request for an operation.
 */
function buildMacJxaCommand(op, args = {}) {
  switch (op) {
    case "mouse.position":
      return {
        op,
        args: {},
        jxa: "ObjC.import('CoreGraphics'); $.CGEventGetLocation($.CGEventCreate(null))",
      };
    case "mouse.moveTo": {
      const x = Number(args.x), y = Number(args.y);
      return {
        op,
        args: { x, y },
        jxa: `ObjC.import('CoreGraphics'); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, $.CGPointMake(${x}, ${y}), $.kCGMouseButtonLeft))`,
      };
    }
    case "mouse.click": {
      const button = validateButton(args.button);
      const btnMap = { left: "kCGMouseButtonLeft", right: "kCGMouseButtonRight", middle: "kCGMouseButtonCenter" };
      const downMap = { left: "kCGEventLeftMouseDown", right: "kCGEventRightMouseDown", middle: "kCGEventOtherMouseDown" };
      const upMap = { left: "kCGEventLeftMouseUp", right: "kCGEventRightMouseUp", middle: "kCGEventOtherMouseUp" };
      return {
        op,
        args: { button },
        jxa: `ObjC.import('CoreGraphics'); var p = $.CGEventGetLocation($.CGEventCreate(null)); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.${downMap[button]}, p, $.${btnMap[button]})); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.${upMap[button]}, p, $.${btnMap[button]}))`,
      };
    }
    case "mouse.doubleClick": {
      const button = validateButton(args.button);
      return {
        op,
        args: { button },
        jxa: `ObjC.import('CoreGraphics'); // CGEventCreateMouseEvent + kCGMouseEventClickState = 2 (${button}) posted to kCGHIDEventTap`,
      };
    }
    case "mouse.scroll": {
      const dx = Number(args.dx ?? 0), dy = Number(args.dy ?? 0);
      return {
        op,
        args: { dx, dy },
        jxa: `ObjC.import('CoreGraphics'); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitPixel, 2, ${dy}, ${dx}))`,
      };
    }
    case "mouse.drag": {
      const fromX = Number(args.fromX), fromY = Number(args.fromY), toX = Number(args.toX), toY = Number(args.toY);
      const button = validateButton(args.button);
      return {
        op,
        args: { fromX, fromY, toX, toY, button },
        jxa: `ObjC.import('CoreGraphics'); // drag (${fromX},${fromY}) -> (${toX},${toY}) button=${button} via CGEventCreateMouseEvent`,
      };
    }
    case "keyboard.typeText": {
      const text = String(args.text ?? "");
      return {
        op,
        args: { text },
        jxa: `ObjC.import('CoreGraphics'); // CGEventKeyboardSetUnicodeString(${JSON.stringify(text)}) posted to kCGHIDEventTap`,
      };
    }
    case "keyboard.press": {
      const key = String(args.key ?? "");
      const code = macKeyCode(key);
      return {
        op,
        args: { key, code },
        jxa: `ObjC.import('CoreGraphics'); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateKeyboardEvent(null, ${code}, true)); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateKeyboardEvent(null, ${code}, false))`,
      };
    }
    case "keyboard.hotkey": {
      const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
      if (!keys.length) throw new Error("hotkey requires at least one key");
      const mainKey = keys[keys.length - 1];
      const mods = keys.slice(0, -1);
      let flags = 0;
      for (const m of mods) {
        const nk = normalizeKey(m);
        if (!(nk in MAC_MODIFIER_FLAGS)) throw new Error(`unknown modifier key "${m}" in hotkey`);
        flags |= MAC_MODIFIER_FLAGS[nk];
      }
      const code = macKeyCode(mainKey);
      return {
        op,
        args: { keys, code, flags },
        jxa: `ObjC.import('CoreGraphics'); var down = $.CGEventCreateKeyboardEvent(null, ${code}, true); $.CGEventSetFlags(down, ${flags}); $.CGEventPost($.kCGHIDEventTap, down); var up = $.CGEventCreateKeyboardEvent(null, ${code}, false); $.CGEventSetFlags(up, ${flags}); $.CGEventPost($.kCGHIDEventTap, up)`,
      };
    }
    case "keyboard.isDown": {
      const key = String(args.key ?? "");
      const code = macKeyCode(key);
      return {
        op,
        args: { key, code },
        jxa: `ObjC.import('CoreGraphics'); $.CGEventSourceKeyState($.kCGEventSourceStateHIDSystemState, ${code})`,
      };
    }
    case "screen.size":
      return {
        op,
        args: {},
        jxa: "ObjC.import('CoreGraphics'); var id = $.CGMainDisplayID(); ({ width: $.CGDisplayPixelsWide(id), height: $.CGDisplayPixelsHigh(id) })",
      };
    case "clipboard.get":
      return {
        op,
        args: {},
        jxa: "ObjC.import('AppKit'); ObjC.unwrap($.NSPasteboard.generalPasteboard.stringForType($.NSPasteboardTypeString)) || ''",
      };
    case "clipboard.set": {
      const text = String(args.text ?? "");
      return {
        op,
        args: { text },
        jxa: `ObjC.import('AppKit'); var pb = $.NSPasteboard.generalPasteboard; pb.clearContents; pb.setStringForType(${JSON.stringify(text)}, $.NSPasteboardTypeString)`,
      };
    }
    case "apps.running":
      return {
        op,
        args: {},
        jxa: "ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.runningApplications (activationPolicy === 0)",
      };
    case "apps.quit": {
      const name = String(args.name ?? "");
      return {
        op,
        args: { name },
        jxa: `Application(${JSON.stringify(name)}).quit()`,
      };
    }
    case "notify.show": {
      const title = String(args.title ?? "");
      const message = String(args.message ?? "");
      return {
        op,
        args: { title, message },
        jxa: `var a = Application.currentApplication(); a.includeStandardAdditions = true; a.displayNotification(${JSON.stringify(message)}, { withTitle: ${JSON.stringify(title)} })`,
      };
    }
    case "system.idle":
      return {
        op,
        args: {},
        jxa: "ObjC.import('CoreGraphics'); $.CGEventSourceSecondsSinceLastEventType($.kCGEventSourceStateCombinedSessionState, $.kCGAnyInputEventType)",
      };
    default:
      throw new Error(`unsupported macOS JXA op: ${op}`);
  }
}

/**
 * Build the exact macOS CLI invocation (`screencapture`, `open -g`, `pmset`)
 * without shell interpolation.
 */
function buildMacCliCommand(op, args = {}) {
  switch (op) {
    case "screen.screenshot":
      return { command: "screencapture", args: ["-x", "-t", "png", String(args.outPath)] };
    case "screen.pixel":
      return { command: "screencapture", args: ["-x", "-R", `${Number(args.x)},${Number(args.y)},1,1`, "-t", "png", String(args.outPath)] };
    case "apps.open":
      // `-g` ensures the app opens in the background and never steals focus.
      return { command: "open", args: ["-g", "-a", String(args.name)] };
    case "apps.openFile":
      return { command: "open", args: ["-g", String(args.path)] };
    case "apps.openUrl":
      return { command: "open", args: ["-g", validateHttpUrl(args.url)] };
    case "system.battery":
      return { command: "pmset", args: ["-g", "batt"] };
    default:
      throw new Error(`unsupported macOS CLI op: ${op}`);
  }
}

/**
 * Build the exact Windows PowerShell + Add-Type user32 / WinForms / .NET command
 * for an operation.
 */
function buildWindowsPsCommand(op, args = {}) {
  switch (op) {
    case "mouse.position":
      return {
        op,
        args: {},
        ps: "$pt = New-Object MycelWin+POINT; [MycelWin]::GetCursorPos([ref]$pt) | Out-Null; @{ x = $pt.X; y = $pt.Y }",
      };
    case "mouse.moveTo": {
      const x = Number(args.x), y = Number(args.y);
      return {
        op,
        args: { x, y },
        ps: `[MycelWin]::SetCursorPos(${x}, ${y}) | Out-Null`,
      };
    }
    case "mouse.click": {
      const button = validateButton(args.button);
      return {
        op,
        args: { button },
        ps: `[MycelWin]::MouseClick(${psQuote(button)}, 1)`,
      };
    }
    case "mouse.doubleClick": {
      const button = validateButton(args.button);
      return {
        op,
        args: { button },
        ps: `[MycelWin]::MouseClick(${psQuote(button)}, 2)`,
      };
    }
    case "mouse.scroll": {
      const dx = Number(args.dx ?? 0), dy = Number(args.dy ?? 0);
      return {
        op,
        args: { dx, dy },
        ps: `[MycelWin]::MouseScroll(${dx}, ${dy})`,
      };
    }
    case "mouse.drag": {
      const fromX = Number(args.fromX), fromY = Number(args.fromY), toX = Number(args.toX), toY = Number(args.toY);
      const button = validateButton(args.button);
      return {
        op,
        args: { fromX, fromY, toX, toY, button },
        ps: `[MycelWin]::MouseDrag(${fromX}, ${fromY}, ${toX}, ${toY}, ${psQuote(button)})`,
      };
    }
    case "keyboard.typeText": {
      const text = String(args.text ?? "");
      return {
        op,
        args: { text },
        ps: `[MycelWin]::SendUnicodeText(${psQuote(text)})`,
      };
    }
    case "keyboard.press": {
      const key = String(args.key ?? "");
      const vk = winVkCode(key);
      return {
        op,
        args: { key, vk },
        ps: `[MycelWin]::KeyTap(${vk})`,
      };
    }
    case "keyboard.hotkey": {
      const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
      if (!keys.length) throw new Error("hotkey requires at least one key");
      const vks = keys.map(winVkCode);
      return {
        op,
        args: { keys, vks },
        ps: `[MycelWin]::SendHotkey(@(${vks.join(", ")}))`,
      };
    }
    case "keyboard.isDown": {
      const key = String(args.key ?? "");
      const vk = winVkCode(key);
      return {
        op,
        args: { key, vk },
        ps: `(([MycelWin]::GetAsyncKeyState(${vk}) -band 0x8000) -ne 0)`,
      };
    }
    case "screen.size":
      return {
        op,
        args: {},
        ps: "@{ width = [MycelWin]::GetSystemMetrics(0); height = [MycelWin]::GetSystemMetrics(1) }",
      };
    case "screen.screenshot":
      return {
        op,
        args: { outPath: String(args.outPath) },
        ps: `$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save(${psQuote(args.outPath)}, [System.Drawing.Imaging.ImageFormat]::Png)`,
      };
    case "screen.pixel": {
      const x = Number(args.x), y = Number(args.y);
      return {
        op,
        args: { x, y },
        ps: `$bmp = New-Object System.Drawing.Bitmap(1, 1); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(${x}, ${y}, 0, 0, (New-Object System.Drawing.Size(1, 1))); $c = $bmp.GetPixel(0, 0); @{ r = $c.R; g = $c.G; b = $c.B; a = $c.A }`,
      };
    }
    case "clipboard.get":
      return {
        op,
        args: {},
        ps: "[System.Windows.Forms.Clipboard]::GetText()",
      };
    case "clipboard.set":
      return {
        op,
        args: { text: String(args.text ?? "") },
        ps: `[System.Windows.Forms.Clipboard]::SetText(${psQuote(args.text ?? "")})`,
      };
    case "apps.open":
      return {
        op,
        args: { name: String(args.name ?? "") },
        ps: `Start-Process -FilePath ${psQuote(args.name ?? "")}`,
      };
    case "apps.openFile":
      return {
        op,
        args: { path: String(args.path ?? "") },
        ps: `Start-Process -FilePath ${psQuote(args.path ?? "")}`,
      };
    case "apps.openUrl": {
      const url = validateHttpUrl(args.url);
      return {
        op,
        args: { url },
        ps: `Start-Process -FilePath ${psQuote(url)}`,
      };
    }
    case "apps.running":
      return {
        op,
        args: {},
        ps: "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty ProcessName -Unique",
      };
    case "apps.quit":
      return {
        op,
        args: { name: String(args.name ?? "") },
        ps: `Get-Process -Name ${psQuote(args.name ?? "")} -ErrorAction Stop | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
      };
    case "notify.show":
      return {
        op,
        args: { title: String(args.title ?? ""), message: String(args.message ?? "") },
        ps: `$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(3000, ${psQuote(args.title ?? "")}, ${psQuote(args.message ?? "")}, [System.Windows.Forms.ToolTipIcon]::Info)`,
      };
    case "system.battery":
      return {
        op,
        args: {},
        ps: "Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress",
      };
    case "system.idle":
      return {
        op,
        args: {},
        ps: "[MycelWin]::GetIdleSeconds()",
      };
    default:
      throw new Error(`unsupported Windows PowerShell op: ${op}`);
  }
}

function parsePmsetBattery(stdout) {
  const s = String(stdout ?? "");
  const m = /(\d+)%/.exec(s);
  if (!m) return { percent: null, charging: false };
  const percent = Math.max(0, Math.min(100, Number(m[1])));
  const charging = /\bcharging\b|\bAC Power\b|\bcharged\b/i.test(s) && !/\bdischarging\b/i.test(s);
  return { percent, charging };
}

function parseWindowsBattery(stdout) {
  const raw = String(stdout ?? "").trim();
  if (!raw) return { percent: null, charging: false };
  try {
    const obj = JSON.parse(raw);
    const pct = typeof obj.EstimatedChargeRemaining === "number" ? Math.max(0, Math.min(100, obj.EstimatedChargeRemaining)) : null;
    // Win32_Battery BatteryStatus: 2 = AC/Unknown, 6 = Charging, 7 = Charging and High, 8 = Charging and Low, 9 = Charging and Critical
    const charging = [2, 6, 7, 8, 9].includes(Number(obj.BatteryStatus));
    return { percent: pct, charging };
  } catch {
    return { percent: null, charging: false };
  }
}

function buildDryRunLine(platform, op, args = {}) {
  if (op === "system.os") return `[DRY-RUN] system.os() -> ${platform}`;
  if (op === "system.user") return "[DRY-RUN] system.user() -> os.userInfo().username";
  if (platform === "win32") {
    const cmd = buildWindowsPsCommand(op, args);
    return `[DRY-RUN] powershell -NoProfile -NonInteractive: ${cmd.ps}`;
  }
  if (op === "screen.screenshot" || op === "screen.pixel" || op === "apps.open" || op === "apps.openFile" || op === "apps.openUrl" || op === "system.battery") {
    const cli = buildMacCliCommand(op, args);
    return `[DRY-RUN] ${cli.command} ${cli.args.join(" ")}`;
  }
  const jxa = buildMacJxaCommand(op, args);
  return `[DRY-RUN] osascript -l JavaScript: ${jxa.jxa}`;
}

module.exports = {
  MAC_KEY_CODES,
  MAC_MODIFIER_FLAGS,
  WIN_VK_CODES,
  normalizeKey,
  macKeyCode,
  winVkCode,
  validateButton,
  validateHttpUrl,
  psQuote,
  buildMacJxaCommand,
  buildMacCliCommand,
  buildWindowsPsCommand,
  parsePmsetBattery,
  parseWindowsBattery,
  buildDryRunLine,
};
