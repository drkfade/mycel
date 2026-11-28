"use strict";
// Long-lived macOS JXA helper (`osascript -l JavaScript`) speaking JSON lines on stdin/stdout.
// Zero extra installs: uses Apple's built-in Foundation, CoreGraphics, AppKit, and ApplicationServices.

ObjC.import("Foundation");
ObjC.import("CoreGraphics");
ObjC.import("AppKit");
ObjC.import("ApplicationServices");

var stdin = $.NSFileHandle.fileHandleWithStandardInput;
var stdout = $.NSFileHandle.fileHandleWithStandardOutput;
var escHeldSince = 0;

function checkPanicKey() {
  var down = !!$.CGEventSourceKeyState($.kCGEventSourceStateHIDSystemState, 53);
  var now = Date.now();
  if (down) {
    if (!escHeldSince) escHeldSince = now;
    if (now - escHeldSince >= 1000) return true;
  } else {
    escHeldSince = 0;
  }
  return false;
}

function requireAccessibility() {
  if (!$.AXIsProcessTrusted()) {
    return {
      type: "PermissionError",
      permission: "accessibility",
      message: "macOS Accessibility permission is required: open System Settings -> Privacy & Security -> Accessibility and enable your terminal or Mycel runner."
    };
  }
  return null;
}

function mouseConstants(button) {
  if (button === "right") return { btn: $.kCGMouseButtonRight, down: $.kCGEventRightMouseDown, up: $.kCGEventRightMouseUp, drag: $.kCGEventRightMouseDragged };
  if (button === "middle") return { btn: $.kCGMouseButtonCenter, down: $.kCGEventOtherMouseDown, up: $.kCGEventOtherMouseUp, drag: $.kCGEventOtherMouseDragged };
  return { btn: $.kCGMouseButtonLeft, down: $.kCGEventLeftMouseDown, up: $.kCGEventLeftMouseUp, drag: $.kCGEventLeftMouseDragged };
}

function currentPoint() {
  var ev = $.CGEventCreate(null);
  return $.CGEventGetLocation(ev);
}

function postMouse(type, x, y, btn, clickCount) {
  var ev = $.CGEventCreateMouseEvent(null, type, $.CGPointMake(x, y), btn);
  if (clickCount) $.CGEventSetIntegerValueField(ev, $.kCGMouseEventClickState, clickCount);
  $.CGEventPost($.kCGHIDEventTap, ev);
}

function postKey(code, down, flags) {
  var ev = $.CGEventCreateKeyboardEvent(null, code, down);
  if (flags) $.CGEventSetFlags(ev, flags);
  $.CGEventPost($.kCGHIDEventTap, ev);
}

function typeUnicodeString(text) {
  for (var i = 0; i < text.length; i++) {
    var ch = text.charCodeAt(i);
    var down = $.CGEventCreateKeyboardEvent(null, 0, true);
    $.CGEventKeyboardSetUnicodeString(down, 1, Ref([ch]));
    $.CGEventPost($.kCGHIDEventTap, down);
    var up = $.CGEventCreateKeyboardEvent(null, 0, false);
    $.CGEventKeyboardSetUnicodeString(up, 1, Ref([ch]));
    $.CGEventPost($.kCGHIDEventTap, up);
  }
}

function handle(req) {
  var op = req.op;
  var args = req.args || {};
  if (op === "ping") return { ok: true, value: true };
  if (op === "panic.check") return { ok: true, value: { escDown: escHeldSince > 0, triggered: checkPanicKey() } };

  if (op === "mouse.position") {
    var p = currentPoint();
    return { ok: true, value: { x: Math.round(p.x), y: Math.round(p.y) } };
  }
  if (op === "mouse.moveTo") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    postMouse($.kCGEventMouseMoved, args.x, args.y, $.kCGMouseButtonLeft, 0);
    return { ok: true, value: null };
  }
  if (op === "mouse.click" || op === "mouse.doubleClick") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    var c = mouseConstants(args.button || "left");
    var pt = currentPoint();
    if (op === "mouse.click") {
      postMouse(c.down, pt.x, pt.y, c.btn, 1);
      postMouse(c.up, pt.x, pt.y, c.btn, 1);
    } else {
      postMouse(c.down, pt.x, pt.y, c.btn, 1);
      postMouse(c.up, pt.x, pt.y, c.btn, 1);
      postMouse(c.down, pt.x, pt.y, c.btn, 2);
      postMouse(c.up, pt.x, pt.y, c.btn, 2);
    }
    return { ok: true, value: null };
  }
  if (op === "mouse.scroll") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    var ev = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitPixel, 2, args.dy || 0, args.dx || 0);
    $.CGEventPost($.kCGHIDEventTap, ev);
    return { ok: true, value: null };
  }
  if (op === "mouse.drag") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    var c = mouseConstants(args.button || "left");
    postMouse($.kCGEventMouseMoved, args.fromX, args.fromY, c.btn, 0);
    postMouse(c.down, args.fromX, args.fromY, c.btn, 1);
    postMouse(c.drag, args.toX, args.toY, c.btn, 1);
    postMouse(c.up, args.toX, args.toY, c.btn, 1);
    return { ok: true, value: null };
  }
  if (op === "keyboard.typeText") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    typeUnicodeString(args.text || "");
    return { ok: true, value: null };
  }
  if (op === "keyboard.press") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    postKey(args.code, true, 0);
    postKey(args.code, false, 0);
    return { ok: true, value: null };
  }
  if (op === "keyboard.hotkey") {
    var perm = requireAccessibility(); if (perm) return { ok: false, error: perm };
    postKey(args.code, true, args.flags || 0);
    postKey(args.code, false, args.flags || 0);
    return { ok: true, value: null };
  }
  if (op === "keyboard.isDown") {
    return { ok: true, value: !!$.CGEventSourceKeyState($.kCGEventSourceStateHIDSystemState, args.code) };
  }
  if (op === "screen.size") {
    var id = $.CGMainDisplayID();
    return { ok: true, value: { width: Number($.CGDisplayPixelsWide(id)), height: Number($.CGDisplayPixelsHigh(id)) } };
  }
  if (op === "clipboard.get") {
    var pb = $.NSPasteboard.generalPasteboard;
    var s = pb.stringForType($.NSPasteboardTypeString);
    return { ok: true, value: s ? ObjC.unwrap(s) : "" };
  }
  if (op === "clipboard.set") {
    var pb = $.NSPasteboard.generalPasteboard;
    pb.clearContents;
    pb.setStringForType($(args.text || ""), $.NSPasteboardTypeString);
    return { ok: true, value: null };
  }
  if (op === "apps.running") {
    var list = $.NSWorkspace.sharedWorkspace.runningApplications;
    var names = [];
    var seen = {};
    for (var i = 0; i < list.count; i++) {
      var app = list.objectAtIndex(i);
      if (app.activationPolicy === 0) {
        var n = app.localizedName ? ObjC.unwrap(app.localizedName) : "";
        if (n && !seen[n]) { seen[n] = true; names.push(n); }
      }
    }
    return { ok: true, value: names };
  }
  if (op === "apps.quit") {
    Application(args.name).quit();
    return { ok: true, value: null };
  }
  if (op === "notify.show") {
    var cur = Application.currentApplication();
    cur.includeStandardAdditions = true;
    cur.displayNotification(args.message || "", { withTitle: args.title || "" });
    return { ok: true, value: null };
  }
  if (op === "system.idle") {
    var sec = $.CGEventSourceSecondsSinceLastEventType($.kCGEventSourceStateCombinedSessionState, $.kCGAnyInputEventType);
    return { ok: true, value: Number(sec) };
  }
  return { ok: false, error: { type: "Error", message: "unknown op: " + op } };
}

// Exit when the program that started us is gone: stdin reaches end-of-file, or we get re-parented to launchd (pid 1).
// Note: in JXA `data.length` is the string "0", so it must be converted before it is compared with a number.
ObjC.import("unistd");
var parentPid = $.getppid();
function parentGone() { return $.getppid() !== parentPid; }

var buf = "";
while (true) {
  var data = stdin.availableData;
  if (Number(data.length) === 0 || parentGone()) break;
  buf += ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
  var idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    var line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    var req = JSON.parse(line);
    var res;
    try {
      var panicNow = checkPanicKey();
      res = handle(req);
      res.id = req.id;
      res.panic = panicNow || (res.value && res.value.triggered === true);
    } catch (e) {
      res = { id: req.id, ok: false, panic: checkPanicKey(), error: { type: "Error", message: String(e && e.message ? e.message : e) } };
    }
    var out = JSON.stringify(res) + "\n";
    stdout.writeData($.NSString.alloc.initWithString(out).dataUsingEncoding($.NSUTF8StringEncoding));
  }
}
