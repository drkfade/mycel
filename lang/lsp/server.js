#!/usr/bin/env node
"use strict";
// Mycel language server: stdio JSON-RPC (LSP 3.17 subset), no dependencies. It reuses the compiler in ../dist, so the
// diagnostics are exactly `mycel check --json` (message, why, suggestion). Features: diagnostics on change, hover (type
// of the name under the cursor with /// doc comments), go-to-definition across files, completion (std modules/members,
// keywords, locals), document symbols, quick-fixes (code actions applying compiler suggestions), rename symbol,
// and formatting via `mycel fmt`.
const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "dist", "src");
const { compileProgram, makeResolver } = require(path.join(D, "modules"));
const { withinPath } = require(path.join(D, "paths"));
const { Source, toJson } = require(path.join(D, "diag"));
const { lex, KEYWORDS } = require(path.join(D, "lexer"));
const { show, prune } = require(path.join(D, "types"));
const { Checker } = require(path.join(D, "checker"));
const { findProject } = require(path.join(D, "project"));
const { format } = require(path.join(D, "fmt"));

const STD_DIR = path.resolve(__dirname, "..", "std");
const { fileOf, keyOf, keyOfFile, uriOfFile } = require("./uris").makeUris();
const STD_MODULES = [
  "crypto", "db", "env", "files", "fs", "http", "io", "json", "log", "math",
  "process", "re", "sqlite", "task", "test", "time", "ui", "web"
];
const STD_MODULE_DOCS = {
  web: "Web apps: Express/Flask style routes (:params), JSON, forms, static files",
  http: "HTTP client and server (http.get, http.post, http.serve)",
  json: "JSON parse, stringify, encode, pretty",
  files: "File and path utilities: text, lines, write, append, Path navigation",
  db: "SQLite databases and key-value stores (openKV, open, tables)",
  fs: "File system operations (readText, writeText, list, exists, mkdir, remove)",
  math: "Mathematical constants and functions (sin, cos, sqrt, random, min, max)",
  time: "Date and time utilities (now, sleep, duration)",
  task: "Concurrency and task management (sleep, all, race, Channel)",
  env: "Environment variables and command-line arguments",
  process: "Run external commands and process management",
  sqlite: "SQLite database queries and mutations",
  crypto: "Cryptographic hashing and random bytes",
  re: "Regular expression matching and replacement",
  log: "Structured logging (info, warn, error)",
  test: "Test assertions and runner utilities",
  io: "Input/output stream operations",
  ui: "UI building primitives",
};

// The checker drops its scopes when it finishes; declareLocal is the single place a local is born, so wrap it
// (without editing the compiler) to remember each local's live type for hover.
let collector = null;
if (!Checker.prototype.__lspPatched) {
  const orig = Checker.prototype.declareLocal;
  Checker.prototype.declareLocal = function (cx, name, ty, mutable, span, kind) {
    const info = orig.call(this, cx, name, ty, mutable, span, kind);
    if (collector) collector.push(info);
    return info;
  };
  Checker.prototype.__lspPatched = true;
}

const KW_DOC = {
  let: "let name = value — an immutable binding", var: "var name = value — a mutable variable", fn: "fn name(params) -> Type { … } — a function",
  class: "class Name { … } — a reference type with fields and methods", struct: "struct Name { … } — a value type", interface: "interface Name { … } — a set of methods a type can promise",
  enum: "enum Name { A, B(Int) } — a closed set of variants", match: "match value { pattern => result } — pick by shape", for: "for x in items { … }", while: "while cond { … }",
  if: "if cond { … } else { … }", import: "import std.name — bring a module in", test: "test \"name\" { … } — run by `mycel test`", return: "return value", nil: "the absent value of an optional type",
};

const docs = new Map(); // keyOf(uri) -> { uri (as the client spelt it), text, version, analysis }
const docOfFile = (file) => docs.get(keyOfFile(file));
// the client's own spelling for an open document, so it matches the editor's model (VS Code on Windows: file:///c%3A/...)
const uriFor = (file) => { const d = docOfFile(file); return d ? d.uri : uriOfFile(file); };
let rootUri = null, shutdownReq = false;

function send(msg) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
const reply = (id, result) => send({ id, result: result === undefined ? null : result });
const fail = (id, code, message) => send({ id, error: { code, message } });


function analyze(uri, text) {
  const file = fileOf(uri);
  const dir = path.dirname(file);
  let project; try { project = findProject(dir); } catch { project = undefined; }
  const roots = project ? [project.srcDir, path.join(project.root, "tests"), dir] : [dir];
  let entry = "main";
  if (project) {
    const r = path.relative(project.srcDir, file);
    entry = withinPath(project.srcDir, file) ? r.replace(/\.(myc|olx)$/, "").split(path.sep).join(".") : "main_entry";
  }
  // other open buffers shadow the disk for imports
  const base = makeResolver({ roots, packages: project && project.packages });
  const resolve = (name) => {
    const r = base(name);
    if (r) { const open = docOfFile(r.file); if (open && !r.isStd) return { ...r, text: open.text }; }
    return r;
  };
  const locals = [];
  collector = locals;
  let program;
  try { program = compileProgram({ entry: { name: entry, file, text }, resolve }); }
  catch (e) { collector = null; return { file, text, src: new Source(file, text), error: String(e && e.message || e), diagnostics: [], locals: [], mod: undefined, program: undefined, resolver: resolve }; }
  collector = null;
  const src = new Source(file, text);
  const mod = program.modules.find((m) => m.file === file || (m.ast && m.ast.src.name === file) || m.name === entry);
  return { file, text, src, program, mod, locals: locals.filter((l) => l.span && l.span.src.name === file), diagnostics: program.diagnostics, resolver: resolve };
}

const isStdWarning = (d) => d.span && /(^|[\\/])std[\\/][^\\/]+\.(olx|myc)$/.test(d.span.src.name) && d.severity === "warning";

function lspRange(src, start, end) {
  const a = src.pos(start), b = src.pos(Math.max(start, end));
  return { start: { line: a.line - 1, character: a.col - 1 }, end: { line: b.line - 1, character: b.col - 1 } };
}
function offsetAt(src, pos) {
  // inverse of Source.pos
  const lines = src.text.split("\n");
  let off = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) off += lines[i].length + 1;
  return Math.min(off + pos.character, src.text.length);
}

function publish(key) {
  const d = docs.get(key); if (!d) return;
  const a = d.analysis;
  const out = [];
  for (const x of a.diagnostics) {
    if (isStdWarning(x) || !x.span || x.span.src.name !== a.file) continue;
    const j = toJson(x);
    const lines = [x.message];
    if (x.why) lines.push(`why: ${x.why}`);
    if (x.suggestion) lines.push(`fix: ${x.suggestion}`);
    out.push({ range: lspRange(a.src, x.span.start, x.span.end), severity: x.severity === "error" ? 1 : 2, code: x.code, source: "mycel", message: lines.join("\n"), data: { suggestion: x.suggestion, why: x.why, json: j } });
  }
  if (a.error) out.push({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, source: "mycel", message: `internal error: ${a.error}` });
  send({ method: "textDocument/publishDiagnostics", params: { uri: d.uri, version: d.version, diagnostics: out } });
}

// ---------- symbol lookup ----------
function tokenAt(a, off) {
  let toks; try { toks = lex(a.src); } catch { return undefined; }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if ((t.k === "id" || t.k === "kw") && off >= t.start && off <= t.end) return { t, prev: toks[i - 1], i, toks };
  }
  return undefined;
}
function idTokenIn(a, span, name) {
  let toks; try { toks = lex(a.src, span.start, span.end); } catch { return undefined; }
  return toks.find((t) => t.k === "id" && t.v === name);
}
function idTokenInSrc(src, span, name) {
  if (!src) return undefined;
  let toks; try { toks = lex(src, span.start, span.end); } catch { return undefined; }
  return toks.find((t) => (t.k === "id" || t.k === "kw") && t.v === name);
}

function docAbove(span) {
  if (!span || !span.src || !span.src.text) return undefined;
  const lines = span.src.text.split("\n");
  let ln = span.src.pos(span.start).line - 1;
  const out = [];
  while (ln >= 1 && /^\s*\/\/\//.test(lines[ln - 1])) {
    out.unshift(lines[ln - 1].replace(/^\s*\/\/\/ ?/, ""));
    ln--;
  }
  return out.length ? out.join("\n") : undefined;
}

function moduleDoc(file) {
  if (!file || !fs.existsSync(file)) return undefined;
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const out = [];
    for (const l of lines) {
      if (/^\s*\/\/\/? ?(.*)/.test(l)) {
        const m = l.match(/^\s*\/\/\/? ?(.*)/);
        if (m) out.push(m[1]);
      } else if (out.length && !l.trim()) {
        continue;
      } else if (out.length) {
        break;
      }
    }
    return out.length ? out.join("\n") : undefined;
  } catch { return undefined; }
}

const tyStr = (t) => { try { return show(prune(t)); } catch { return "?"; } };
function fnSig(f) {
  const ps = f.params.map((p) => `${p.name}: ${tyStr(p.ty)}${p.hasDefault ? " = …" : ""}`).join(", ");
  return `fn ${f.name}(${ps}) -> ${tyStr(f.ret)}`;
}

/** Resolve the name at an offset to { sig, doc, target: {file, start, end} } or undefined. */
function resolve(a, off) {
  const at = tokenAt(a, off); if (!at) return undefined;
  const { t, prev } = at;
  if (t.k === "kw") return KW_DOC[t.v] ? { sig: t.v, doc: KW_DOC[t.v], keyword: true } : undefined;
  const name = t.v;
  const target = (span, ident) => {
    if (!span) return undefined;
    const tk = ident !== false ? idTokenInSrc(span.src, span, name) : undefined;
    return { file: span.src.name, src: span.src, start: tk ? tk.start : span.start, end: tk ? tk.end : span.end };
  };

  // member access: `x.name`
  if (prev && prev.k === "op" && (prev.v === "." || prev.v === "?.")) {
    const prevTk = at.i >= 2 ? at.toks[at.i - 2] : undefined;
    const recvName = prevTk && prevTk.k === "id" ? prevTk.v : undefined;

    // Check if receiver is an imported module (e.g. `web.text`, `fs.readText`)
    const imp = recvName && a.mod && a.mod.imports.get(recvName);
    if (imp && imp.kind === "module") {
      const fns = imp.mod.fns.get(name);
      if (fns && fns.length) {
        return { sig: fns.map(fnSig).join("\n"), doc: docAbove(fns[0].decl && fns[0].decl.span), target: target(fns[0].decl && fns[0].decl.span) };
      }
      const ty = imp.mod.types.get(name);
      if (ty) {
        return { sig: `${ty.kind} ${ty.name}${ty.params.length ? `<${ty.params.map((p) => p.name).join(", ")}>` : ""}`, doc: docAbove(ty.ast && ty.ast.span), target: target(ty.ast && ty.ast.span) };
      }
      const g = imp.mod.globals.get(name);
      if (g) {
        return { sig: `${g.mutable ? "var" : "let"} ${name}: ${tyStr(g.ty)}`, doc: docAbove(g.decl && g.decl.span), target: target(g.decl && g.decl.span) };
      }
    }

    // Check receiver is "std" (e.g. `std.web`)
    if (recvName === "std" && STD_MODULES.includes(name)) {
      const res = a.resolver && a.resolver("std." + name);
      if (res && res.file) {
        return { sig: `module std.${name}`, doc: moduleDoc(res.file), target: { file: res.file, src: new Source(res.file, res.text), start: 0, end: 0 } };
      }
    }

    // Receiver is an object instance with known type
    const hits = [];
    const types = new Set();
    for (const m of a.program ? a.program.modules : []) for (const d of m.types.values()) types.add(d);
    for (const d of types) {
      const f = d.fields.get(name); if (f) hits.push({ sig: `(field) ${d.name}.${name}: ${tyStr(f.ty)}`, span: f.span, doc: docAbove(f.span) });
      for (const fn of [...(d.methods.get(name) || []), ...(d.statics.get(name) || [])]) hits.push({ sig: `(method) ${d.name}.${fnSig(fn).slice(3)}`, span: fn.decl && fn.decl.span, doc: docAbove(fn.decl && fn.decl.span) });
      const g = d.getters.get(name); if (g) hits.push({ sig: `(property) ${d.name}.${name}: ${tyStr(g.ret)}`, span: g.decl && g.decl.span, doc: docAbove(g.decl && g.decl.span) });
    }
    if (!hits.length) return undefined;
    const h = hits[0];
    return { sig: h.sig, doc: h.doc, target: target(h.span), more: hits.length - 1 };
  }

  // locals: the nearest preceding declaration with this name
  const ls = a.locals.filter((l) => l.name === name && l.span.start <= off).sort((x, y) => y.span.start - x.span.start);
  if (ls.length) {
    const l = ls[0];
    return { sig: `${l.kind === "param" ? "(parameter)" : l.mutable ? "var" : "let"} ${name}: ${tyStr(l.ty)}`, target: target(l.span) };
  }

  const m = a.mod;
  if (m) {
    const fns = m.fns.get(name);
    if (fns && fns.length) return { sig: fns.map(fnSig).join("\n"), doc: docAbove(fns[0].decl && fns[0].decl.span), target: target(fns[0].decl && fns[0].decl.span) };
    const ty = m.types.get(name);
    if (ty) return { sig: `${ty.kind} ${ty.name}${ty.params.length ? `<${ty.params.map((p) => p.name).join(", ")}>` : ""}`, doc: docAbove(ty.ast && ty.ast.span), target: target(ty.ast && ty.ast.span) };
    const g = m.globals.get(name);
    if (g) return { sig: `${g.mutable ? "var" : "let"} ${name}: ${tyStr(g.ty)}`, doc: docAbove(g.decl && g.decl.span), target: target(g.decl && g.decl.span) };
    const imp = m.imports.get(name);
    if (imp) {
      if (imp.kind === "module") return { sig: `module ${imp.mod.name}`, doc: moduleDoc(imp.mod.file), target: imp.mod.file && fs.existsSync(imp.mod.file) ? { file: imp.mod.file, src: new Source(imp.mod.file, fs.readFileSync(imp.mod.file, "utf8")), start: 0, end: 0 } : undefined };
      if (imp.kind === "type") return { sig: `${imp.decl.kind} ${imp.decl.name}`, doc: docAbove(imp.decl.ast && imp.decl.ast.span), target: target(imp.decl.ast && imp.decl.ast.span, false) };
      if (imp.kind === "fn") return { sig: imp.fns.map(fnSig).join("\n"), doc: docAbove(imp.fns[0].decl && imp.fns[0].decl.span), target: target(imp.fns[0].decl && imp.fns[0].decl.span, false) };
      if (imp.kind === "global") return { sig: `let ${name}: ${tyStr(imp.g.ty)}`, doc: docAbove(imp.g.decl && imp.g.decl.span), target: target(imp.g.decl && imp.g.decl.span, false) };
    }
  }

  // std module check (e.g. `import std.web` or `std`)
  if (name === "std") {
    return { sig: "module std", doc: "The Mycel standard library", target: { file: path.join(STD_DIR, "web.olx"), src: new Source(path.join(STD_DIR, "web.olx"), ""), start: 0, end: 0 } };
  }
  if (STD_MODULES.includes(name)) {
    const res = a.resolver && a.resolver("std." + name);
    if (res && res.file) {
      return { sig: `module std.${name}`, doc: moduleDoc(res.file) || STD_MODULE_DOCS[name], target: { file: res.file, src: new Source(res.file, res.text), start: 0, end: 0 } };
    }
  }

  // prelude (std) names
  const pre = a.program && a.program.modules.find((x) => x.name === "prelude");
  if (pre) {
    const fns = pre.fns.get(name); if (fns && fns.length) return { sig: fns.map(fnSig).join("\n"), doc: docAbove(fns[0].decl && fns[0].decl.span), target: target(fns[0].decl && fns[0].decl.span, false) };
    const ty = pre.types.get(name); if (ty) return { sig: `${ty.kind} ${ty.name}`, doc: docAbove(ty.ast && ty.ast.span), target: target(ty.ast && ty.ast.span, false) };
  }
  return undefined;
}

function locationOf(t) {
  if (!t || !t.file || !t.src) return null;
  return { uri: uriFor(t.file), range: lspRange(t.src, t.start, t.end) };
}

function hover(a, pos) {
  const r = resolve(a, offsetAt(a.src, pos)); if (!r) return null;
  const parts = ["```mycel\n" + r.sig + "\n```"];
  if (r.doc) parts.push(r.doc);
  if (r.more > 0) parts.push(`_and ${r.more} more with this name_`);
  return { contents: { kind: "markdown", value: parts.join("\n\n") } };
}

function completion(a, pos) {
  const off = offsetAt(a.src, pos);
  const items = [];
  const seen = new Set();
  const add = (label, kind, detail, doc) => {
    if (seen.has(label)) return;
    seen.add(label);
    const item = { label, kind, detail };
    if (doc) item.documentation = { kind: "markdown", value: doc };
    items.push(item);
  };

  const before = a.text.slice(0, off).replace(/[A-Za-z_0-9]*$/, "");

  // 1) Completion after `import std.` or `import `
  if (/\bimport\s+std\.$/.test(before)) {
    for (const mod of STD_MODULES) add(mod, 9, "std module", STD_MODULE_DOCS[mod]);
    return items;
  }
  if (/\bimport\s+$/.test(before)) {
    add("std", 9, "standard library");
    for (const mod of STD_MODULES) add(`std.${mod}`, 9, "std module", STD_MODULE_DOCS[mod]);
    if (a.program) {
      for (const m of a.program.modules) {
        if (!m.name.startsWith("std.") && m.name !== "prelude" && m.name !== a.mod?.name) {
          add(m.name, 9, "module");
        }
      }
    }
    return items;
  }

  // 2) Member completion after `.` or `?.`
  if (/(\?\.|\.)$/.test(before) && !/\.\.$/.test(before)) {
    const recvMatch = /([A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*)\s*(?:\?\.|\.)$/.exec(before);
    const recv = recvMatch ? recvMatch[1] : undefined;

    // A) If receiver is "std"
    if (recv === "std") {
      for (const mod of STD_MODULES) add(mod, 9, "std module", STD_MODULE_DOCS[mod]);
      return items;
    }

    // B) If receiver is "std.<mod>" (e.g. `std.web.`) or an imported std module (e.g. `web.`)
    let stdMod = recv && recv.startsWith("std.") ? recv : undefined;
    if (!stdMod && recv) {
      const impMatch = new RegExp(`\\bimport\\s+std\\.(${recv})\\b`).exec(a.text);
      if (impMatch) stdMod = "std." + recv;
    }
    if (stdMod) {
      let modInfo = a.program ? a.program.modules.find((m) => m.name === stdMod) : undefined;
      if (!modInfo) {
        try {
          const resolver = a.resolver || makeResolver({ roots: [] });
          const res = resolver(stdMod);
          if (res) {
            const p = compileProgram({ entry: { name: stdMod, file: res.file, text: res.text }, resolve: resolver });
            modInfo = p.modules.find((m) => m.name === stdMod);
          }
        } catch {}
      }
      if (modInfo) {
        for (const [k, v] of modInfo.fns) add(k, 3, fnSig(v[0]).slice(3), docAbove(v[0].decl?.span));
        for (const [k, v] of modInfo.types) add(k, 7, v.kind, docAbove(v.ast?.span));
        for (const [k, v] of modInfo.globals) add(k, 6, tyStr(v.ty), docAbove(v.decl?.span));
        return items;
      }
    }

    // C) If receiver is an imported module (e.g. `web.` after `import std.web`)
    let decl;
    if (recv && a.program) {
      const imp = a.mod && a.mod.imports.get(recv);
      if (imp && imp.kind === "module") {
        for (const [k, v] of imp.mod.fns) add(k, 3, fnSig(v[0]).slice(3), docAbove(v[0].decl?.span));
        for (const [k, v] of imp.mod.types) add(k, 7, v.kind, docAbove(v.ast?.span));
        for (const [k, v] of imp.mod.globals) add(k, 6, tyStr(v.ty), docAbove(v.decl?.span));
        return items;
      }
      const l = a.locals.filter((x) => x.name === recv && x.span.start <= off).sort((x, y) => y.span.start - x.span.start)[0];
      let ty = l ? prune(l.ty) : a.mod && a.mod.globals.get(recv) ? prune(a.mod.globals.get(recv).ty) : undefined;
      if (ty && ty.k === "opt") ty = prune(ty.inner);
      if (ty && ty.k === "app") decl = ty.decl;
      const pre = a.program && a.program.modules.find((m) => m.name === "prelude");
      if (ty && pre && !decl) {
        if (ty.k === "prim") decl = pre.types.get(ty.name);
        else if (ty.k === "list") decl = pre.types.get("Array");
        else if (ty.k === "map") decl = pre.types.get("Map");
        else if (ty.k === "set") decl = pre.types.get("Set");
      }
    }

    const fill = (d) => {
      for (const [k, f] of d.fields) add(k, 5, tyStr(f.ty), docAbove(f.span));
      for (const [k, fs_] of d.methods) add(k, 2, fnSig(fs_[0]).slice(3), docAbove(fs_[0].decl?.span));
      for (const [k, fs_] of d.statics) add(k, 2, "static " + fnSig(fs_[0]).slice(3), docAbove(fs_[0].decl?.span));
      for (const [k, g] of d.getters) add(k, 10, tyStr(g.ret), docAbove(g.decl?.span));
      if (d.base) fill(d.base.decl);
    };
    if (decl) fill(decl);
    else {
      const all = new Set();
      for (const m of a.program ? a.program.modules : []) for (const d of m.types.values()) all.add(d);
      for (const d of all) fill(d);
    }
    return items;
  }

  for (const l of a.locals) if (l.span.start <= off) add(l.name, 6, tyStr(l.ty));
  const m = a.mod;
  if (m) {
    for (const [k, v] of m.fns) add(k, 3, fnSig(v[0]).slice(3), docAbove(v[0].decl?.span));
    for (const [k, v] of m.types) add(k, 7, v.kind, docAbove(v.ast?.span));
    for (const [k, v] of m.globals) add(k, 6, tyStr(v.ty), docAbove(v.decl?.span));
    for (const [k, v] of m.imports) add(k, v.kind === "module" ? 9 : 6, v.kind);
  }
  const pre = a.program && a.program.modules.find((x) => x.name === "prelude");
  if (pre) {
    for (const [k, v] of pre.fns) add(k, 3, fnSig(v[0]).slice(3), docAbove(v[0].decl?.span));
    for (const [k, v] of pre.types) add(k, 7, v.kind, docAbove(v.ast?.span));
  }
  for (const k of KEYWORDS) add(k, 14, "keyword");
  return items;
}

function symbols(a) {
  const out = [];
  const m = a.mod; if (!m || !m.ast) return out;
  const range = (span) => lspRange(a.src, span.start, span.end);
  const nameSel = (span, name) => { const tk = idTokenIn(a, span, name); return tk ? lspRange(a.src, tk.start, tk.end) : range(span); };
  const fnSym = (f, kind) => ({ name: f.name, kind, range: range(f.span), selectionRange: nameSel(f.span, f.name) });
  for (const d of m.ast.decls) {
    if (!d.span || d.span.src.name !== a.file) continue;
    switch (d.k) {
      case "fn": out.push(fnSym(d.fn, 12)); break;
      case "let": { const n = d.stmt && d.stmt.name; if (typeof n === "string") out.push({ name: n, kind: 13, range: range(d.span), selectionRange: nameSel(d.span, n) }); break; }
      case "class": out.push({ name: d.name, kind: d.struct ? 23 : 5, range: range(d.span), selectionRange: nameSel(d.span, d.name),
        children: [...d.fields.map((f) => ({ name: f.name, kind: 8, range: range(f.span), selectionRange: nameSel(f.span, f.name) })), ...d.methods.map((f) => fnSym(f, f.isInit ? 9 : 6))] }); break;
      case "interface": out.push({ name: d.name, kind: 11, range: range(d.span), selectionRange: nameSel(d.span, d.name), children: d.methods.map((f) => fnSym(f, 6)) }); break;
      case "enum": out.push({ name: d.name, kind: 10, range: range(d.span), selectionRange: nameSel(d.span, d.name), children: [...d.variants.map((v) => ({ name: v.name, kind: 22, range: range(v.span), selectionRange: nameSel(v.span, v.name) })), ...d.methods.map((f) => fnSym(f, 6))] }); break;
      case "alias": out.push({ name: d.name, kind: 26, range: range(d.span), selectionRange: nameSel(d.span, d.name) }); break;
      case "test": out.push({ name: `test ${d.name}`, kind: 12, range: range(d.span), selectionRange: range(d.span) }); break;
    }
  }
  return out;
}

function codeActions(a, range, context) {
  const actions = [];
  const uri = uriFor(a.file);
  const diags = context.diagnostics || [];
  for (const diag of diags) {
    const data = diag.data || {};
    const sug = data.suggestion || "";
    const msg = diag.message || "";
    // 1) elif -> else if
    if (/`elif` is Python/.test(msg)) {
      actions.push({
        title: "Replace `elif` with `else if`",
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: diag.range, newText: "else if" }] } }
      });
      continue;
    }
    // 2) {:} -> {}
    if (/`\{:\}` is not Mycel syntax/.test(msg) || /write `\{\}`/.test(sug)) {
      const st = Math.max(0, offsetAt(a.src, diag.range.start) - 1);
      const en = Math.min(a.src.text.length, offsetAt(a.src, diag.range.end) + 1);
      const sub = a.src.text.slice(st, en);
      const m = sub.indexOf("{:}");
      const targetRange = m >= 0 ? lspRange(a.src, st + m, st + m + 3) : diag.range;
      actions.push({
        title: "Replace `{:}` with `{}`",
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: targetRange, newText: "{}" }] } }
      });
      continue;
    }
    // 3) #[...] -> Set([...])
    if (/`#\[\.\.\.\]` is not Mycel syntax/.test(msg)) {
      const off = offsetAt(a.src, diag.range.start);
      const sub = a.src.text.slice(off, off + 2);
      const targetRange = sub === "#[" ? lspRange(a.src, off, off + 2) : diag.range;
      actions.push({
        title: "Replace `#[` with `Set([`",
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: targetRange, newText: "Set([" }] } }
      });
      continue;
    }
    // 4) General habit: `OLD` is ... — Mycel writes `NEW`
    const habit = /`([^`]+)` is [A-Za-z/]+ — Mycel writes `([^`]+)`/.exec(msg);
    if (habit) {
      actions.push({
        title: `Replace \`${habit[1]}\` with \`${habit[2]}\``,
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: diag.range, newText: habit[2] }] } }
      });
      continue;
    }
    // 5) Did you mean `xyz`? or change it to `xyz`
    const dym = /did you mean `([^`]+)`\?/.exec(msg) || /change it to `([^`]+)`/.exec(sug);
    if (dym) {
      actions.push({
        title: `Change to \`${dym[1]}\``,
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: diag.range, newText: dym[1] }] } }
      });
      continue;
    }
    // 6) write `xyz`
    const wr = /^write `([^`]+)`/i.exec(sug);
    if (wr) {
      actions.push({
        title: `Write \`${wr[1]}\``,
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: diag.range, newText: wr[1] }] } }
      });
      continue;
    }
    // 7) remove / unused
    const unused = /variable `([^`]+)` is never used.*rename it `([^`]+)`/.exec(msg);
    if (unused) {
      actions.push({
        title: `Rename \`${unused[1]}\` to \`${unused[2]}\``,
        kind: "quickfix",
        diagnostics: [diag],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: diag.range, newText: unused[2] }] } }
      });
      continue;
    }
  }
  return actions;
}

function prepareRename(a, pos) {
  const off = offsetAt(a.src, pos);
  const at = tokenAt(a, off);
  if (!at || at.t.k !== "id") return null;
  const name = at.t.v;
  if (KEYWORDS.has(name) || name === "self" || name === "super" || name === "main") return null;
  const r = resolve(a, off);
  if (!r) return null;
  if (r.target && r.target.file && /(^|[\\/])std[\\/][^\\/]+\.(olx|myc)$/.test(r.target.file)) return null;
  return { range: lspRange(a.src, at.t.start, at.t.end), placeholder: name };
}

function renameSymbol(a, pos, newName) {
  const off = offsetAt(a.src, pos);
  const at = tokenAt(a, off);
  if (!at || at.t.k !== "id") return null;
  const oldName = at.t.v;
  if (KEYWORDS.has(oldName) || oldName === "self" || oldName === "super" || oldName === "main") return null;
  const r = resolve(a, off);
  if (!r || !r.target) return null;
  if (r.target.file && /(^|[\\/])std[\\/][^\\/]+\.(olx|myc)$/.test(r.target.file)) return null;

  const targetFile = r.target.file;
  const changes = {};

  const checkDoc = (docSrc, file) => {
    let toks; try { toks = lex(docSrc); } catch { return []; }
    const edits = [];
    for (const tk of toks) {
      if (tk.k === "id" && tk.v === oldName) {
        const docAnalysis = docOfFile(file)?.analysis || (file === a.file ? a : undefined);
        if (docAnalysis) {
          const resolved = resolve(docAnalysis, tk.start);
          if (resolved && resolved.target && resolved.target.file === targetFile && resolved.target.start === r.target.start) {
            edits.push({ range: lspRange(docSrc, tk.start, tk.end), newText: newName });
          }
        } else if (file === targetFile && tk.start === r.target.start) {
          edits.push({ range: lspRange(docSrc, tk.start, tk.end), newText: newName });
        }
      }
    }
    return edits;
  };

  const currentEdits = checkDoc(a.src, a.file);
  if (currentEdits.length) changes[uriFor(a.file)] = currentEdits;

  for (const [key, d] of docs.entries()) {
    if (key === keyOfFile(a.file)) continue;
    const file = fileOf(d.uri);
    const edits = checkDoc(d.analysis ? d.analysis.src : new Source(file, d.text), file);
    if (edits.length) changes[d.uri] = edits;
  }

  return { changes };
}

function formatDocument(a) {
  try {
    const formatted = format(a.text);
    if (formatted === a.text) return [];
    const lines = a.text.split("\n");
    const lastLine = lines.length - 1;
    const lastCol = lines[lastLine].length;
    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lastLine, character: lastCol }
      },
      newText: formatted
    }];
  } catch (e) {
    return [];
  }
}

// ---------- dispatch ----------
function reanalyze(key) {
  const d = docs.get(key); if (!d) return;
  const next = analyze(d.uri, d.text);
  // mid-edit text often doesn't parse: keep answering hover/completion from the last analysis that did (its types are still the
  // best we know), but always against the current text and with the current error list
  if (next.mod) d.good = next;
  d.analysis = next.mod || !d.good ? next : { ...d.good, text: next.text, src: next.src, diagnostics: next.diagnostics, stale: true };
  publish(key);
}
const timers = new Map();
function schedule(key) { clearTimeout(timers.get(key)); timers.set(key, setTimeout(() => { timers.delete(key); reanalyze(key); }, 120)); }
function ensure(uri) { const key = keyOf(uri); const d = docs.get(key); if (d && timers.has(key)) { clearTimeout(timers.get(key)); timers.delete(key); reanalyze(key); } return d && d.analysis; }

function handle(m) {
  const { id, method, params } = m;
  try {
    switch (method) {
      case "initialize":
        rootUri = params.rootUri;
        return reply(id, { capabilities: {
          textDocumentSync: { openClose: true, change: 1, save: { includeText: false } },
          hoverProvider: true, definitionProvider: true, documentSymbolProvider: true,
          completionProvider: { triggerCharacters: [".", " "] },
          codeActionProvider: { codeActionKinds: ["quickfix"] },
          renameProvider: { prepareProvider: true },
          documentFormattingProvider: true,
        }, serverInfo: { name: "mycel-lsp", version: "1.0.0" } });
      case "initialized": return;
      case "shutdown": shutdownReq = true; return reply(id, null);
      case "exit": process.exit(shutdownReq ? 0 : 1);
      case "textDocument/didOpen": { const t = params.textDocument, key = keyOf(t.uri); docs.set(key, { uri: t.uri, text: t.text, version: t.version }); return reanalyze(key); }
      case "textDocument/didChange": {
        const key = keyOf(params.textDocument.uri), d = docs.get(key); if (!d) return;
        d.text = params.contentChanges[params.contentChanges.length - 1].text; d.version = params.textDocument.version;
        return schedule(key);
      }
      case "textDocument/didSave": return reanalyze(keyOf(params.textDocument.uri));
      case "textDocument/didClose": { const key = keyOf(params.textDocument.uri); clearTimeout(timers.get(key)); timers.delete(key); docs.delete(key); send({ method: "textDocument/publishDiagnostics", params: { uri: params.textDocument.uri, diagnostics: [] } }); return; }
      case "textDocument/hover": { const a = ensure(params.textDocument.uri); return reply(id, a ? hover(a, params.position) : null); }
      case "textDocument/definition": {
        const a = ensure(params.textDocument.uri); if (!a) return reply(id, null);
        const r = resolve(a, offsetAt(a.src, params.position));
        return reply(id, r && r.target ? locationOf(r.target) : null);
      }
      case "textDocument/completion": { const a = ensure(params.textDocument.uri); return reply(id, a ? { isIncomplete: false, items: completion(a, params.position) } : { isIncomplete: false, items: [] }); }
      case "textDocument/documentSymbol": { const a = ensure(params.textDocument.uri); return reply(id, a ? symbols(a) : []); }
      case "textDocument/codeAction": {
        const a = ensure(params.textDocument.uri);
        return reply(id, a ? codeActions(a, params.range, params.context) : []);
      }
      case "textDocument/prepareRename": {
        const a = ensure(params.textDocument.uri);
        return reply(id, a ? prepareRename(a, params.position) : null);
      }
      case "textDocument/rename": {
        const a = ensure(params.textDocument.uri);
        return reply(id, a ? renameSymbol(a, params.position, params.newName) : null);
      }
      case "textDocument/formatting": {
        const a = ensure(params.textDocument.uri);
        return reply(id, a ? formatDocument(a) : []);
      }
      default: if (id !== undefined) return fail(id, -32601, `method not found: ${method}`);
    }
  } catch (e) {
    if (id !== undefined) fail(id, -32603, String(e && e.stack || e));
    else process.stderr.write(`mycel-lsp: ${method}: ${e && e.stack || e}\n`);
  }
}

function serve(input) {
  let buf = Buffer.alloc(0);
  input.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const sep = buf.indexOf("\r\n\r\n"); if (sep < 0) return;
      const head = buf.slice(0, sep).toString("ascii");
      const mm = /content-length:\s*(\d+)/i.exec(head); if (!mm) { buf = buf.slice(sep + 4); continue; }
      const len = Number(mm[1]);
      if (buf.length < sep + 4 + len) return;
      const body = buf.slice(sep + 4, sep + 4 + len).toString("utf8");
      buf = buf.slice(sep + 4 + len);
      let msg; try { msg = JSON.parse(body); } catch { continue; }
      handle(msg);
    }
  });
  input.on("end", () => process.exit(shutdownReq ? 0 : 0));
}

module.exports = { serve, analyze, resolve, completion, symbols, codeActions, renameSymbol, formatDocument };
if (require.main === module) serve(process.stdin);
