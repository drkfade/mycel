"use strict";
// Drives the language server over real stdio JSON-RPC. Run: node --test lsp/test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const SERVER = process.env.MYCEL_LSP_SERVER || path.join(__dirname, "server.js");
const FIX = path.join(__dirname, "fixtures", "demo.myc");

function client() {
  const p = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "inherit"] });
  // close() kills the server right after "exit"; on Windows the queued stdin write then fails with EPIPE, an
  // unhandled stream error that failed the whole file after 11/11 passes (first real-Windows CI run).
  p.stdin.on("error", (e) => { if (e.code !== "EPIPE" && e.code !== "EOF") throw e; });
  let buf = Buffer.alloc(0), nextId = 1;
  const waiters = [], pending = new Map(), notes = [];
  p.stdout.on("data", (c) => {
    buf = Buffer.concat([buf, c]);
    for (;;) {
      const sep = buf.indexOf("\r\n\r\n"); if (sep < 0) return;
      const len = Number(/content-length:\s*(\d+)/i.exec(buf.slice(0, sep).toString())[1]);
      if (buf.length < sep + 4 + len) return;
      const msg = JSON.parse(buf.slice(sep + 4, sep + 4 + len).toString()); buf = buf.slice(sep + 4 + len);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else { notes.push(msg); for (const w of waiters.splice(0)) w(); }
    }
  });
  const write = (m) => { const b = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...m })); p.stdin.write(`Content-Length: ${b.length}\r\n\r\n`); p.stdin.write(b); };
  return {
    request: (method, params) => new Promise((res) => { const id = nextId++; pending.set(id, res); write({ id, method, params }); }),
    notify: (method, params) => write({ method, params }),
    diagnostics: async (uri, pred = () => true) => {
      for (let i = 0; i < 100; i++) {
        const hit = notes.filter((n) => n.method === "textDocument/publishDiagnostics" && n.params.uri === uri).filter((n) => pred(n.params.diagnostics)).pop();
        if (hit) return hit.params.diagnostics;
        await new Promise((r) => { waiters.push(r); setTimeout(r, 100); });
      }
      throw new Error("no diagnostics; got " + JSON.stringify(notes.map((n) => n.method)));
    },
    close: () => { write({ method: "exit" }); p.stdin.end(); p.kill(); },
  };
}
const uri = pathToFileURL(FIX).href;
const text = fs.readFileSync(FIX, "utf8");
const at = (needle, nth = 0, delta = 0) => { // position of nth occurrence of needle
  const lines = text.split("\n"); let seen = 0;
  for (let l = 0; l < lines.length; l++) { let c = -1; while ((c = lines[l].indexOf(needle, c + 1)) >= 0) { if (seen++ === nth) return { line: l, character: c + delta }; } }
  throw new Error("no " + needle);
};

async function open(c, t = text) {
  await c.request("initialize", { rootUri: null, capabilities: {} });
  c.notify("initialized", {});
  c.notify("textDocument/didOpen", { textDocument: { uri, languageId: "mycel", version: 1, text: t } });
}

test("clean file: no diagnostics; hover, definition, symbols, completion", async () => {
  const c = client(); try { await open(c);
  assert.deepEqual(await c.diagnostics(uri), []);
  const h1 = await c.request("textDocument/hover", { textDocument: { uri }, position: at("add(p.x", 0, 1) });
  assert.match(h1.result.contents.value, /fn add\(a: Int, b: Int\) -> Int/);
  const h2 = await c.request("textDocument/hover", { textDocument: { uri }, position: at("total", 0, 1) });
  assert.match(h2.result.contents.value, /let total: Int/, JSON.stringify(h2));
  const h3 = await c.request("textDocument/hover", { textDocument: { uri }, position: at("p.x", 0, 0) });
  assert.match(h3.result.contents.value, /let p: Point/, JSON.stringify(h3));
  const def = await c.request("textDocument/definition", { textDocument: { uri }, position: at("add(p.x", 0, 1) });
  assert.equal(def.result.uri, uri); assert.equal(def.result.range.start.line, at("fn add").line);
  const sym = await c.request("textDocument/documentSymbol", { textDocument: { uri } });
  assert.deepEqual(sym.result.map((s) => s.name), ["Point", "add", "main"]);
  assert.deepEqual(sym.result[0].children.map((s) => s.name), ["x", "y"]);
  const comp = await c.request("textDocument/completion", { textDocument: { uri }, position: at("print", 0, 0) });
  const labels = comp.result.items.map((i) => i.label);
  for (const want of ["add", "Point", "total", "p", "fn", "match"]) assert.ok(labels.includes(want), want + " missing from " + labels.slice(0, 30));
  } finally { c.close(); }
});

test("member completion after a dot uses the receiver's type", async () => {
  const c = client(); try { await open(c);
  await c.diagnostics(uri); // analysed clean once; now the user types `p.` (does not parse)
  c.notify("textDocument/didChange", { textDocument: { uri, version: 2 }, contentChanges: [{ text: text.replace("  print(", "  p.\n  print(") }] });
  await c.diagnostics(uri, (d) => d.length > 0);
  const pos = { line: at("print").line, character: 4 };
  const comp = await c.request("textDocument/completion", { textDocument: { uri }, position: pos });
  const labels = comp.result.items.map((i) => i.label).sort();
  assert.ok(labels.includes("x") && labels.includes("y"), JSON.stringify(labels));
  for (const no of ["add", "fn", "Point", "total"]) assert.ok(!labels.includes(no), no + " leaked into member completion");
  } finally { c.close(); }
});

test("errors carry the CLI's message, why/fix and a precise range; fixing clears them", async () => {
  const c = client(); try { await open(c, text.replace("add(p.x, p.y)", "add(p.x, \"no\")"));
  const ds = await c.diagnostics(uri, (d) => d.length > 0);
  assert.equal(ds[0].severity, 1); assert.equal(ds[0].source, "mycel"); assert.match(ds[0].code, /^E\d+/);
  assert.equal(ds[0].range.start.line, at("add(p.x").line);
  // same message the CLI prints
  const cli = require("node:child_process").spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "mycel"), "check", "--json", FIX], { input: "", encoding: "utf8" });
  assert.ok(ds[0].message.length > 5);
  c.notify("textDocument/didChange", { textDocument: { uri, version: 2 }, contentChanges: [{ text }] });
  assert.deepEqual(await c.diagnostics(uri, (d) => d.length === 0), []);
  } finally { c.close(); }
});

test("std module completion and member completion", async () => {
  const c = client(); try {
    const src = "import web\n\nfn main() {\n  let app = web.App()\n  web.\n}\n";
    await open(c, src);
    const comp1 = await c.request("textDocument/completion", {
      textDocument: { uri },
      position: { line: 0, character: "import ".length }
    });
    const stdMods = comp1.result.items.map((i) => i.label);
    assert.ok(stdMods.includes("web"), "web missing from std modules: " + JSON.stringify(stdMods));
    assert.ok(stdMods.includes("http"), "http missing from std modules");
    assert.ok(stdMods.includes("json"), "json missing from std modules");
    assert.ok(stdMods.includes("fs"), "fs missing from std modules");

    const comp2 = await c.request("textDocument/completion", {
      textDocument: { uri },
      position: { line: 4, character: "  web.".length }
    });
    const webMembers = comp2.result.items.map((i) => i.label);
    assert.ok(webMembers.includes("App"), "App missing from web: " + JSON.stringify(webMembers));
    assert.ok(webMembers.includes("text"), "text missing from web");
    assert.ok(webMembers.includes("html"), "html missing from web");
    assert.ok(webMembers.includes("escape"), "escape missing from web");
  } finally { c.close(); }
});

test("hover docs from ## comments", async () => {
  const c = client(); try {
    const src = "## Calculates double the input value.\nfn double(n: Int) -> Int {\n  return n * 2\n}\n\nfn main() {\n  let d = double(4)\n}\n";
    await open(c, src);
    const h = await c.request("textDocument/hover", {
      textDocument: { uri },
      position: { line: 6, character: 12 }
    });
    assert.ok(h.result, "expected hover result");
    assert.match(h.result.contents.value, /Calculates double the input value\./);
  } finally { c.close(); }
});

test("quick-fixes for compiler suggestions: elif and {:}", async () => {
  const c = client(); try {
    const srcElif = "fn main() {\n  let x = 1\n  if x > 0 {\n    print(1)\n  }\n  elif x < 0 {\n    print(2)\n  }\n}\n";
    await open(c, srcElif);
    const ds1 = await c.diagnostics(uri, (d) => d.length > 0);
    const elifDiag = ds1.find((d) => /elif/.test(d.message));
    assert.ok(elifDiag, "expected elif diagnostic");
    const ca1 = await c.request("textDocument/codeAction", {
      textDocument: { uri },
      range: elifDiag.range,
      context: { diagnostics: [elifDiag] }
    });
    assert.ok(ca1.result && ca1.result.length > 0, "expected code actions for elif");
    assert.match(ca1.result[0].title, /else if/);
    assert.equal(ca1.result[0].edit.changes[uri][0].newText, "else if");

    // Test {:} quickfix
    const srcMap = "fn main() {\n  let m = {:}\n}\n";
    c.notify("textDocument/didChange", { textDocument: { uri, version: 2 }, contentChanges: [{ text: srcMap }] });
    const ds2 = await c.diagnostics(uri, (d) => d.some((x) => /\{:\}/.test(x.message) || /empty map/.test(x.message)));
    const mapDiag = ds2.find((d) => /\{:\}/.test(d.message) || /empty map/.test(d.message));
    assert.ok(mapDiag, "expected {:} diagnostic");
    const ca2 = await c.request("textDocument/codeAction", {
      textDocument: { uri },
      range: mapDiag.range,
      context: { diagnostics: [mapDiag] }
    });
    assert.ok(ca2.result && ca2.result.length > 0, "expected code actions for {:}");
    assert.match(ca2.result[0].title, /\{\}/);
    assert.equal(ca2.result[0].edit.changes[uri][0].newText, "{}");
  } finally { c.close(); }
});

test("go-to-definition across files", async () => {
  const c = client(); try {
    const src = "import web\n\nfn main() {\n  let app = web.App()\n  let res = web.escape(\"hello\")\n}\n";
    await open(c, src);
    const def = await c.request("textDocument/definition", {
      textDocument: { uri },
      position: { line: 4, character: 18 }
    });
    assert.ok(def.result, "expected definition result");
    assert.match(def.result.uri, /web\.(olx|myc)/);
  } finally { c.close(); }
});

test("rename symbol updates all references in document", async () => {
  const c = client(); try {
    const src = "fn add(a: Int, b: Int) -> Int {\n  let total = a + b\n  return total\n}\n";
    await open(c, src);
    const prep = await c.request("textDocument/prepareRename", {
      textDocument: { uri },
      position: { line: 1, character: 7 }
    });
    assert.ok(prep.result, "expected prepareRename result");
    assert.equal(prep.result.placeholder, "total");

    const ren = await c.request("textDocument/rename", {
      textDocument: { uri },
      position: { line: 1, character: 7 },
      newName: "sum"
    });
    assert.ok(ren.result && ren.result.changes, "expected rename changes");
    const edits = ren.result.changes[uri];
    assert.equal(edits.length, 2, "expected 2 edits for total: " + JSON.stringify(edits));
    assert.equal(edits[0].newText, "sum");
    assert.equal(edits[1].newText, "sum");
  } finally { c.close(); }
});

test("document formatting via mycel fmt", async () => {
  const c = client(); try {
    const unformatted = "fn main() {let x=1\nprint(x)}\n";
    await open(c, unformatted);
    const fmtResult = await c.request("textDocument/formatting", {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true }
    });
    assert.ok(fmtResult.result && fmtResult.result.length > 0, "expected formatting edits");
    const formattedText = fmtResult.result[0].newText;
    assert.match(formattedText, /let x = 1/);
  } finally { c.close(); }
});

// VS Code sends URIs from its own encoder: every char outside [A-Za-z0-9-._~/] is %-escaped and a Windows drive arrives as
// `file:///c%3A/...` (lower-case, escaped colon). Node's pathToFileURL spells the same file differently, so the server must key
// open documents by file identity, not by URI string. A directory with parentheses reproduces the mismatch on any OS.
function vscodeUri(file) {
  const p = file.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase() + ":");
  return "file://" + p.split("/").map((seg) => [...Buffer.from(seg, "utf8")].map((b) => /[A-Za-z0-9\-._~]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : "%" + b.toString(16).toUpperCase().padStart(2, "0")).join("")).join("/");
}

test("open buffers are matched by file, not URI spelling (VS Code / Windows URIs)", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mycel lsp (copy) "));
  const lib = path.join(dir, "lib.myc"), main = path.join(dir, "main.myc");
  fs.writeFileSync(lib, "pub fn value() -> Int => 1\n");
  const mainText = "import lib\n\nfn main() {\n  print(lib.extra())\n}\n";
  fs.writeFileSync(main, mainText);
  const libUri = vscodeUri(lib), mainUri = vscodeUri(main);
  assert.notEqual(libUri, pathToFileURL(lib).href, "fixture must exercise a differently-spelled URI");
  const c = client(); try {
    await c.request("initialize", { rootUri: null, capabilities: {} });
    c.notify("initialized", {});
    // the unsaved lib buffer defines extra(); main must see the buffer, not the disk
    c.notify("textDocument/didOpen", { textDocument: { uri: libUri, languageId: "mycel", version: 1, text: "pub fn value() -> Int => 1\npub fn extra() -> Int => 2\n" } });
    await c.diagnostics(libUri);
    c.notify("textDocument/didOpen", { textDocument: { uri: mainUri, languageId: "mycel", version: 1, text: mainText } });
    const ds = await c.diagnostics(mainUri);
    assert.deepEqual(ds.map((d) => d.message), [], "main read lib from disk instead of the open buffer");
    const def = await c.request("textDocument/definition", { textDocument: { uri: mainUri }, position: { line: 3, character: "  print(lib.e".length } });
    assert.equal(def.result.uri, libUri, "definition must point at the client's URI for an open document");
    const ren = await c.request("textDocument/rename", { textDocument: { uri: mainUri }, position: { line: 3, character: "  print(lib.e".length }, newName: "more" });
    assert.deepEqual(Object.keys(ren.result.changes).sort(), [libUri, mainUri].sort(), JSON.stringify(ren.result));
    for (const edits of Object.values(ren.result.changes)) assert.equal(edits.length, 1, JSON.stringify(ren.result));
  } finally { c.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("BQ-mycel-4: member completion on primitive String returns only String methods", async () => {
  const c = client(); try {
    const src = 'fn main() {\n  let s = "hello"\n  print(s)\n}\n';
    await open(c, src);
    await c.diagnostics(uri);
    c.notify("textDocument/didChange", {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: src.replace("  print(s)", "  s.\n  print(s)") }]
    });
    await c.diagnostics(uri, (d) => d.length > 0);
    const pos = { line: 2, character: 4 };
    const comp = await c.request("textDocument/completion", { textDocument: { uri }, position: pos });
    const labels = comp.result.items.map((i) => i.label);
    assert.ok(labels.includes("upper"), "upper missing from String completion");
    assert.ok(labels.includes("lower"), "lower missing from String completion");
    assert.ok(labels.includes("split"), "split missing from String completion");
    for (const no of ["push", "pop", "insert", "keys", "values", "toRadix", "clamp"]) {
      assert.ok(!labels.includes(no), no + " leaked into String member completion");
    }
  } finally { c.close(); }
});
