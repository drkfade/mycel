import { test } from "node:test";
import * as assert from "node:assert/strict";
import { check, run } from "../src/host";

test("BQ-mycel-1: String + Int suggestion suggests f-string instead of rejected ${a}${b}", () => {
  const r = check({ source: 'let s = "hello" + 5' });
  assert.equal(r.ok, false);
  const diag = r.diagnostics[0];
  assert.equal(diag.code, "E0363");
  assert.match(diag.suggestion ?? "", /f"\{a\}\{b\}"/);
  assert.doesNotMatch(diag.suggestion ?? "", /"\$\{a\}\$\{b\}"/);
});

test("BQ-mycel-2: full open range x[..] compiles and slices entire array", async () => {
  const r = await run({ source: 'let x = [1, 2, 3]\nprint(x[..])' });
  assert.equal(r.ok, true, r.error?.human);
  assert.equal(r.output, "[1, 2, 3]\n");
});

test("BQ-mycel-3: python slice syntax x[1:2] gives helpful slice diagnostic", () => {
  const r = check({ source: 'let x = [1, 2, 3]\nprint(x[1:2])' });
  assert.equal(r.ok, false);
  const diag = r.diagnostics[0];
  assert.match(diag.message ?? "", /slicing is Python/);
  assert.match(diag.suggestion ?? "", /\[1\.\.2\]/);
});

test("BQ-mycel-4: char literals containing braces or colons inside f-strings lex correctly", async () => {
  const r1 = await run({ source: `let c = '}'\nlet s = f"{c == '}'}"\nprint(s)` });
  assert.equal(r1.ok, true, r1.error?.human || r1.error?.message);
  assert.equal(r1.output, "true\n");

  const r2 = await run({ source: `let c = '{'\nlet s = f"{c == '{'}"\nprint(s)` });
  assert.equal(r2.ok, true, r2.error?.human || r2.error?.message);
  assert.equal(r2.output, "true\n");

  const r3 = await run({ source: `let c = ':'\nlet s = f"{1 if c == ':' else 2}"\nprint(s)` });
  assert.equal(r3.ok, true, r3.error?.human || r3.error?.message);
  assert.equal(r3.output, "1\n");
});

test("BQ-mycel-5: class with fn init() explains initializers are written without fn", () => {
  const r = check({ source: 'class Foo {\n  fn init() {}\n}' });
  assert.equal(r.ok, false);
  const diag = r.diagnostics[0];
  assert.match(diag.message ?? "", /initializers are written `init\(...\) \{ ... \}` without `fn`/);
});

test("BQ-mycel-6: for x in range(10) gives habit diagnostic for range", () => {
  const r = check({ source: 'for x in range(10) { print(x) }' });
  assert.equal(r.ok, false);
  const diag = r.diagnostics[0];
  assert.match(diag.message ?? "", /`range\(n\)` is Python — Mycel writes `0\.\.n`/);
});

test("BQ-mycel-7: same-line elif identifies elif as Python habit for else if", () => {
  const src = "fn main() {\n  let x = 1\n  if x > 0 {\n    print(1)\n  } elif x < 0 {\n    print(2)\n  }\n}";
  const r = check({ source: src });
  assert.equal(r.ok, false);
  const diag = r.diagnostics[0];
  assert.match(diag.message ?? "", /`elif` is Python — Mycel writes `else if`/);
});

test("BQ-mycel-8: fs.extension extracts last dot extension and returns empty string for dotfiles", async () => {
  const src = `
import fs
print(fs.extension("foo.bar.baz"))
print(fs.extension(".gitignore"))
print(fs.extension("archive.tar.gz"))
print(fs.extension("Makefile"))
`;
  const r = await run({ source: src });
  assert.equal(r.ok, true, r.error?.human || r.error?.message);
  assert.equal(r.output, ".baz\n\n.gz\n\n");
});

test("BQ-mycel-9: std.re.Regex Match.start/end use character codepoint offsets so s[m.start..m.end] matches m.text on strings with emoji", { skip: "open: std.re Match.start/end codepoint offsets in stdlib.ts" }, async () => {
  const src = `
import re
let s = "🌍 hello world"
let r = re.Regex.compile("world").unwrap()
let m = r.find(s)!
print(m.start, m.end, s[m.start..m.end])
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "8 13 world\n");
});

test("BQ-mycel-10: std.task.race([]) panics on empty task list instead of hanging forever", { skip: "open: std.task.race([]) empty task list handling in stdlib.ts" }, async () => {
  const src = `
import task
async fn main() {
  let xs: [Task<Int>] = []
  let x = await task.race(xs)
  print(x)
}
`;
  const res = await run({ source: src, limits: { maxMillis: 500 } });
  assert.equal(res.ok, false);
  assert.equal(res.error?.kind, "panic");
  assert.match(res.error?.message ?? "", /empty task list/);
});

test("BQ-mycel-11: std.fs.extension('..') and '.' return empty extension and preserve stem", async () => {
  const src = `
import fs
import files
print(fs.extension(".."))
print(fs.extension("."))
print(files.path("..").stem)
print(files.path(".").stem)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "\n\n..\n.\n");
});

test("BQ-mycel-12: newcomer habits for is None, is not None, and method suggestions strip, items", () => {
  const r1 = check({ source: "let x: Int? = nil\nif x is None { }" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /is None/);
  assert.match(r1.diagnostics[0]?.suggestion ?? "", /== nil/);

  const r2 = check({ source: "let x: Int? = nil\nif x is not None { }" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /is not/);
  assert.match(r2.diagnostics[0]?.suggestion ?? "", /!=/);

  const r3 = check({ source: 'let s = " hello ".strip()' });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.suggestion ?? "", /trim/);

  const r4 = check({ source: 'let m = {"a": 1}\nfor k, v in m.items() { }' });
  assert.equal(r4.ok, false);
  assert.match(r4.diagnostics[0]?.suggestion ?? "", /entries/);
});

test("BQ-mycel-13: Json.asInt returns nil on large or non-finite Float values without panicking", async () => {
  const src = `
import json
let j1 = json.parse("1e30").unwrap()
let j2 = json.Json.Num(1e30)
let j3 = json.Json.Num(42.0)
print(j1.asInt, j2.asInt, j3.asInt)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "nil nil 42\n");
});

test("BQ-mycel-14: std.files.lines normalizes CRLF and trailing newline, and Path.lines() works", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hunt-mycel-")));
  const tmp = path.join(dir, "test_lines_hunt.txt");
  fs.writeFileSync(tmp, "alpha\r\nbeta\r\n");
  const src = `
import files
let ls = files.lines(${JSON.stringify(tmp)}).unwrap()
let p = files.path(${JSON.stringify(tmp)})
let pls = p.lines().unwrap()
print(ls.length, ls[0], ls[1])
print(pls.length, pls[0], pls[1])
`;
  const res = await run({ source: src, capabilities: { fs: { read: [dir], write: [dir] } } });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "2 alpha beta\n2 alpha beta\n");
});

test("BQ-mycel-15: LSP server STD_MODULES includes files and db with documentation", () => {
  const srvPath = require("path").resolve(__dirname, "../../lsp/server.js");
  const srvText = require("fs").readFileSync(srvPath, "utf8");
  assert.match(srvText, /"files"/);
  assert.match(srvText, /"db"/);
});

test("BQ-mycel-16: newcomer diagnostics suggest import http for requests, import time for datetime, sorted for sort, append for extend, indexOf for find", () => {
  const r1 = check({ source: "import requests" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /import http/);
  assert.doesNotMatch(r1.diagnostics[0]?.message ?? "", /import py/);

  const r2 = check({ source: "import datetime" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /import time/);

  const r3 = check({ source: "let xs = [2, 1]\nxs.sort()" });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.suggestion ?? "", /sorted/);

  const r4 = check({ source: "let xs = [1, 2]\nxs.extend([3, 4])" });
  assert.equal(r4.ok, false);
  assert.match(r4.diagnostics[0]?.suggestion ?? "", /append/);

  const r5 = check({ source: 'let s = "hello".find("e")' });
  assert.equal(r5.ok, false);
  assert.match(r5.diagnostics[0]?.suggestion ?? "", /indexOf/);
});

test("BQ-mycel-17: for x in [1, 2, 3]: explains a : block is Python instead of slicing is Python", () => {
  const r1 = check({ source: "for x in [1, 2, 3]:\n  print(x)" });
  assert.equal(r1.ok, false);
  const d1 = r1.diagnostics[0];
  assert.match(d1.message ?? "", /a `:` block is Python — Mycel blocks use/);
  assert.doesNotMatch(d1.message ?? "", /slicing is Python/);

  const r2 = check({ source: 'if x in ["a", "b"]:\n  print(x)' });
  assert.equal(r2.ok, false);
  const d2 = r2.diagnostics[0];
  assert.match(d2.message ?? "", /a `:` block is Python — Mycel blocks use/);
  assert.doesNotMatch(d2.message ?? "", /slicing is Python/);
});

test("BQ-mycel-18: std.json array indexing and at() support negative indexes", async () => {
  const src = `
import json
let j = json.parse("[10, 20, 30]").unwrap()
print(j[-1], j[-2], j[-3], j[-4])
print(j.at(-1), j.at(-2), j.at(-4))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "30 20 10 null\n30 20 nil\n");
});

test("BQ-mycel-19: std.math.hypot does not overflow to inf or underflow to 0 for large/small numbers", async () => {
  const src = `
import math
print(math.hypot(1e200, 1e200))
print(math.hypot(1e-200, 1e-200))
print(math.hypot(3.0, 4.0))
print(math.hypot(0.0, 0.0))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "1.414213562373095e+200\n1.414213562373095e-200\n5.0\n0.0\n");
});

test("BQ-mycel-20: std.files.Path has value equality across distinct instances", async () => {
  const src = `
import files
import test
let p1 = files.path("data/test.txt")
let p2 = files.path("data/test.txt")
let p3 = files.path("data/other.txt")
print(p1 == p2, p1 == p3)
test.assertEq(p1, p2)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "true false\n");
});

test("BQ-mycel-21: task errors caught asynchronously after a delay are not reported as unobserved errors", async () => {
  const src = `
import task
async fn bad1() -> Int { throw Error("task error 1") }
async fn bad2() -> Int { throw Error("task error 2") }
async fn main() {
  let t1 = spawn bad1()
  let t2 = spawn bad2()
  await task.sleep(25)
  try { await t1 } catch e { print("caught 1") }
  try { await t2 } catch e { print("caught 2") }
}
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "caught 1\ncaught 2\n");
  assert.deepEqual(res.taskErrors, []);
});

test("BQ-mycel-22: std.math.hypot handles Float.infinity and Float.nan per IEEE 754", async () => {
  const src = `
import math
print(math.hypot(Float.infinity, 0.0))
print(math.hypot(0.0, Float.infinity))
print(math.hypot(Float.infinity, Float.nan))
print(math.hypot(Float.nan, Float.infinity))
print(math.hypot(Float.nan, 0.0).isNaN)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "inf\ninf\ninf\ninf\ntrue\n");
});

test("BQ-mycel-23: std.db Table.insert empty row, Table.update empty values, and where IS ? for nil", async () => {
  const src = `
import db
fn main() {
  let d = db.open(":memory:").unwrap()
  let t = d.table("items", {"id": "integer primary key", "val": "text"}).unwrap()
  t.insert({}).unwrap()
  t.insert({"val": "first"}).unwrap()
  t.insert({"val": nil}).unwrap()
  print("all count:", t.count().unwrap())
  let nullRows = t.find({"val": nil}).unwrap()
  print("null rows:", nullRows.length)
  t.update({"id": 1}, {}).unwrap()
  t.delete({"val": nil}).unwrap()
  print("after delete:", t.count().unwrap())
}
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "all count: 3\nnull rows: 2\nafter delete: 1\n");
});

test("BQ-mycel-24: property call E0400 suggests dropping parentheses, and newcomer modules/methods are suggested", () => {
  const r1 = check({ source: 'let s = "hello"\nprint(s.length())' });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.suggestion ?? "", /without parentheses/);

  const r2 = check({ source: 'let d = {"a": 1}\nprint(d.keys())\nprint(d.values())' });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.suggestion ?? "", /without parentheses/);

  const r3 = check({ source: "import subprocess\nimport sqlite3\nimport unittest" });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.message ?? "", /import process/);
  assert.match(r3.diagnostics[1]?.message ?? "", /import sqlite/);
  assert.match(r3.diagnostics[2]?.message ?? "", /import test/);

  const r4 = check({ source: 'let lines = "a\\nb".splitlines()' });
  assert.equal(r4.ok, false);
  assert.match(r4.diagnostics[0]?.suggestion ?? "", /lines/);
});

test("BQ-mycel-25: negative range slice endpoints on array and string slice from the end", async () => {
  const src = `
let xs = [10, 20, 30, 40]
print(xs[-2..])
print(xs[..-1])
print(xs[-3..-1])
let s = "hello world"
print(s[-5..])
print(s[..-6])
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "[30, 40]\n[10, 20, 30]\n[20, 30]\nworld\nhello\n");
});

test("BQ-mycel-26: Array.at, removeAt, and insert support negative indexing from the end", async () => {
  const src = `
fn main() {
  let xs = [10, 20, 30]
  print(xs.at(-1), xs.at(-2), xs.at(-4))
  let r = xs.removeAt(-1)
  print(r, xs)
  xs.insert(99, at: -1)
  print(xs)
}
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "30 20 nil\n30 [10, 20]\n[10, 99, 20]\n");
});

test("BQ-mycel-27: Float.parse parses inf, -inf, +inf, infinity, -infinity, and nan", async () => {
  const src = `
print(Float.parse("inf"))
print(Float.parse("-inf"))
print(Float.parse("+inf"))
print(Float.parse("infinity"))
print(Float.parse("-infinity"))
print(Float.parse("nan")?.isNaN)
print(str(Float.infinity).toFloat())
print(str(-Float.infinity).toFloat())
print(str(Float.nan).toFloat()?.isNaN)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "inf\n-inf\ninf\ninf\n-inf\ntrue\ninf\n-inf\ntrue\n");
});

test("BQ-mycel-28: std.time.Duration supports arithmetic (+, -, *) and comparison (<, <=, >, >=)", async () => {
  const src = `
import time
let d1 = time.seconds(10)
let d2 = time.seconds(20)
let d3 = d1 + d2
let d4 = d2 - d1
let d5 = d1 * 3
print(d3, d4, d5)
print(d1 < d2, d1 <= d2, d1 > d2, d1 >= d2, d1 == time.seconds(10))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "Duration(ms: 30000) Duration(ms: 10000) Duration(ms: 30000)\ntrue true false false true\n");
});

test("BQ-mycel-29: std.files.Path supports path division operator /", async () => {
  const src = `
import files
let base = files.path("data")
let p1 = base / "items.txt"
let p2 = base / files.path("nested") / "file.json"
print(p1, p2)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  // Path joins use the host separator (data\\items.txt on Windows), like the std.fs.join it is built on.
  const j = require("path").join;
  assert.equal(res.output, `${j("data", "items.txt")} ${j("data", "nested", "file.json")}\n`);
});

test("BQ-mycel-30: std.json Json supports isEmpty and contains / in operator", async () => {
  const src = `
import json
let emptyArr = json.parse("[]").unwrap()
let emptyObj = json.parse("{}").unwrap()
let obj = json.parse("{\\"name\\": \\"Ada\\", \\"age\\": 36}").unwrap()
print(emptyArr.isEmpty, emptyObj.isEmpty, obj.isEmpty)
print("name" in obj, "missing" in obj, obj.contains("age"))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "true true false\ntrue false true\n");
});

test("BQ-mycel-31: parser diagnoses Python 2 print without parens, let a, b tuple pattern, and built-in module import habits", () => {
  const r1 = check({ source: 'print "hello"' });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /`print` is called with parentheses/);

  const r2 = check({ source: "let a, b = (1, 2)" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /tuple unpacking with `let` requires parentheses/);

  const r3 = check({ source: "import pathlib\nimport hashlib\nimport uuid" });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.message ?? "", /import files/);
  assert.match(r3.diagnostics[1]?.message ?? "", /import crypto/);
  assert.match(r3.diagnostics[2]?.message ?? "", /import crypto/);
});



test("BQ-mycel-32: top-level script statements preserve sequential execution order across let/var", async () => {
  const src = `
var order: [String] = []
order.push("first")
let second = (order.push("second"), "val")
print(order)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, '["first", "second"]\n');
});

test("BQ-mycel-33: parser diagnoses `is nil` and `is not nil` cleanly", () => {
  const r1 = check({ source: "let x: Int? = nil\nif x is nil { print(1) }" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /`is nil` — Mycel writes `== nil`/);

  const r2 = check({ source: "let x: Int? = nil\nif x is not nil { print(1) }" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.suggestion ?? "", /write `!= nil`/);
});

test("BQ-mycel-34: parser diagnoses `self` parameter in method declaration", () => {
  const r = check({ source: "class Counter {\n  fn inc(self, amount: Int) {\n  }\n}" });
  assert.equal(r.ok, false);
  assert.match(r.diagnostics[0]?.message ?? "", /`self` is not declared as a parameter in Mycel/);
});

test("BQ-mycel-35: parser and habits diagnose `pass` statement and `typeof` operator", () => {
  const r1 = check({ source: "fn foo() {\n  pass\n}" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /`pass` is Python/);

  const r2 = check({ source: "let t = typeof 42" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /`typeof` is JavaScript/);
});

test("BQ-mycel-36: std.time.Duration supports division (by Int, Float, Duration), multiplication by Float, and time.parse", async () => {
  const src = `
import time
let d = time.seconds(10)
let dHalf = d / 2
let dFloat = d / 2.5
let dMul = d * 1.5
let ratio = time.minutes(1) / time.seconds(10)
print(dHalf.toSeconds(), dFloat.toSeconds(), dMul.toSeconds(), ratio)
let ts = time.parse("2026-11-25T15:00:00Z")
print(ts != nil)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "5.0 4.0 15.0 6.0\ntrue\n");
});

test("BQ-mycel-37: std.math provides lcm (least common multiple)", async () => {
  const src = `
import math
print(math.lcm(4, 6), math.lcm(12, 18), math.lcm(0, 5), math.lcm(-4, 6))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "12 36 0 12\n");
});

test("BQ-mycel-38: std.re provides top-level convenience functions", async () => {
  const src = `
import re
print(re.isMatch("[0-9]+", "123"))
print(re.isMatch("[0-9]+", "abc"))
let m = re.find("[0-9]+", "a123b")
print(m?.text)
let ms = re.findAll("[0-9]+", "a1b22c333")
print(ms.map(x => x.text))
print(re.replace("[0-9]+", "a123b", with: "X"))
print(re.split("[,;]", "a,b;c"))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "true\nfalse\n123\n[\"1\", \"22\", \"333\"]\naXb\n[\"a\", \"b\", \"c\"]\n");
});

test("BQ-mycel-39: std.sqlite provides top-level open function", async () => {
  const src = `
import sqlite
let db = sqlite.open(":memory:").unwrap()
db.exec("CREATE TABLE test (id INT, val TEXT)").unwrap()
db.exec("INSERT INTO test VALUES (?, ?)", [1, "sqlite"]).unwrap()
let rows = db.query("SELECT * FROM test").unwrap()
print(rows)
db.close()
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, '[{"id": 1, "val": "sqlite"}]\n');
});

test("BQ-mycel-40: std.fs.extension returns empty string for files ending with dot", async () => {
  const src = `
import fs
import files
print(fs.extension("file."), fs.extension("archive.tar.gz"), fs.extension(".gitignore"))
let p = files.path("file.")
print(p.extension, p.stem)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, " .gz \n file.\n");
});

test("BQ-mycel-41: std.math.lcm avoids 64-bit integer overflow when product exceeds I64_MAX", async () => {
  const src = `
import math
print(math.lcm(5000000000, 5000000000))
print(math.lcm(4000000000, 6000000000))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "5000000000\n12000000000\n");
});

test("BQ-mycel-42: parser diagnoses `is true`, `is false`, `is True`, `is False`, and `is not true` cleanly", () => {
  const r1 = check({ source: "let x = true\nif x is true { print(1) }" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /`is true` is Python — Mycel writes `== true`/);

  const r2 = check({ source: "let x = false\nif x is false { print(1) }" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /`is false` is Python — Mycel writes `== false`/);

  const r3 = check({ source: "let x = true\nif x is not true { print(1) }" });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.message ?? "", /`is not` is Python — Mycel writes `!= true`/);
});

test("BQ-mycel-43: parser diagnoses Python `class Foo:` and `class Foo(Bar)` class syntax", () => {
  const r1 = check({ source: "class Foo:\n  var x = 1\n" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /a `:` block is Python — Mycel classes use `{ \.\.\. }`/);

  const r2 = check({ source: "class Foo(Bar) { }" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /`\(Base\)` inheritance is Python — Mycel writes `class Foo: Bar { \.\.\. }`/);
});

test("BQ-mycel-44: parser and habits diagnose `with`, bracketed `from`, `del`, `delete` statement habits", () => {
  const r1 = check({ source: "with open(\"x\") as f:\n  pass" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /`with` is Python/);

  const r2 = check({ source: "from math import [sqrt]" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /takes no brackets/);
  assert.equal(check({ source: "from math import sqrt" }).ok, true);

  const r3 = check({ source: "del x" });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.message ?? "", /`del` is Python/);

  const r4 = check({ source: "delete obj.x" });
  assert.equal(r4.ok, false);
  assert.match(r4.diagnostics[0]?.message ?? "", /`delete` is JavaScript/);
});

test("BQ-mycel-45: habits diagnose JSON, Math, open, abs, parseInt, parseFloat, setTimeout, isinstance, list, dict", () => {
  const r1 = check({ source: "let s = JSON.stringify([1])" });
  assert.equal(r1.ok, false);
  assert.match(r1.diagnostics[0]?.message ?? "", /`JSON` is JavaScript/);

  const r2 = check({ source: "let x = Math.floor(1.5)" });
  assert.equal(r2.ok, false);
  assert.match(r2.diagnostics[0]?.message ?? "", /`Math` is JavaScript/);

  const r3 = check({ source: "let f = open(\"foo.txt\")" });
  assert.equal(r3.ok, false);
  assert.match(r3.diagnostics[0]?.message ?? "", /`open\(\.\.\.\)` is Python/);

  const r4 = check({ source: "print(abs(-5))" });
  assert.equal(r4.ok, false);
  assert.match(r4.diagnostics[0]?.message ?? "", /`abs\(x\)` is Python/);

  const r5 = check({ source: "let x = parseInt(\"42\")" });
  assert.equal(r5.ok, false);
  assert.match(r5.diagnostics[0]?.message ?? "", /`parseInt\(\.\.\.\)` is JavaScript/);

  const r6 = check({ source: "let x = isinstance(1, Int)" });
  assert.equal(r6.ok, false);
  assert.match(r6.diagnostics[0]?.message ?? "", /`isinstance\(x, T\)` is Python/);
});

test("BQ-mycel-46: std.files.Path provides read() method as alias for text()", async () => {
  const src = `
import files
let p = files.path("data.txt")
files.write("data.txt", "hello mycel").unwrap()
print(p.read().unwrap())
files.remove("data.txt").unwrap()
`;
  const res = await run({ source: src, capabilities: { fs: { read: true, write: true } } });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "hello mycel\n");
});

test("BQ-mycel-47: std.time.Duration supports reverse multiplication (Int * Duration, Float * Duration)", async () => {
  const src = `
import time
let d1 = 3 * time.seconds(5)
let d2 = 1.5 * time.seconds(10)
print(d1.toSeconds(), d2.toSeconds())
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "15.0 15.0\n");
});

test("BQ-mycel-48: std.math provides clamp for Int and Float", async () => {
  const src = `
import math
print(math.clamp(5, 10, 20), math.clamp(15, 10, 20), math.clamp(25, 10, 20))
print(math.clamp(5.0, 10.0, 20.0), math.clamp(15.5, 10.0, 20.0), math.clamp(25.0, 10.0, 20.0))
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, "10 15 20\n10.0 15.5 20.0\n");
});

test("BQ-mycel-49: std.json.Json provides keys and values accessors", async () => {
  const src = `
import json
let obj = json.parse("{\\"a\\": 1, \\"b\\": 2}").unwrap()
let arr = json.parse("[1, 2]").unwrap()
print(obj.keys, obj.values.length)
print(arr.keys, arr.values.length)
`;
  const res = await run({ source: src });
  assert.equal(res.ok, true, res.error?.human || res.error?.message);
  assert.equal(res.output, '["a", "b"] 2\n[] 0\n');
});
