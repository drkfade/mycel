import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runIsolated, check } from "../src/host";
import { exec, out, errors } from "./helpers";

test("JS keywords and globals are ordinary Ply names", async () => {
  const src = `
class Object { var constructor = 1\n var __proto__ = 2\n var toString = 3 }
fn eval(process: Int) -> Int { return process + 1 }
fn main() {
  let require = 5
  let undefined = 6
  let Math = 7
  let o = Object()
  print(f"{eval(require)} {undefined} {Math} {o.constructor} {o.__proto__} {o.toString}")
  var m: {String: Int} = {}
  m["__proto__"] = 1
  m["constructor"] = 2
  print(m)
}`;
  assert.equal(await out(src), `6 6 7 1 2 3\n{"__proto__": 1, "constructor": 2}`);
});

test("there is no way to name JS internals", () => {
  for (const body of [`let x = "a".constructor`, `let x = [1].__proto__`, `let x = globalThis`, `let x = process`, `let x = require("fs")`, `let f = Function`, `let x = 1.constructor`]) {
    const e = errors(`fn main() {\n${body}\n}`);
    assert.ok(e.length > 0, `should not compile: ${body}`);
  }
});

test("nothing outside the run is reachable even from user-defined names", async () => {
  const src = `fn main() { let globalThis = 1\n let process = "p"\n print(f"{globalThis}{process}") }`;
  assert.equal(await out(src), "1p");
});

test("limits cannot be caught or swallowed", async () => {
  const src = `fn main() {\n try { while true { } } catch e { print("swallowed") } finally { print("finally runs") }\n}`;
  const r = await exec(src, { limits: { maxSteps: 50000 } });
  assert.equal(r.error!.limit, "steps");
  assert.ok(!r.output.includes("swallowed"));
});

test("unicode: strings index and slice by character, not UTF-16 unit", async () => {
  const src = `fn main() {
  let s = "a😀é"
  print(s.length)
  print(s[1])
  print(s.chars())
  print(s.substring(1, 3))
  print(s.reversed())
  print("日本語".upper() + f"{"ß".upper()}")
  let café = 1
  print(café)
}`;
  assert.equal(await out(src), `3\n😀\n["a", "😀", "é"]\n😀é\né😀a\n日本語SS\n1`);
});

test("paths with spaces", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ply space "));
  const f = path.join(dir, "a file.txt");
  const src = `import std.fs\nfn main() { fs.writeText(${JSON.stringify(f)}, "x").unwrap()\n print(fs.readText(${JSON.stringify(f)}).unwrap()) }`;
  assert.equal(await out(src, { capabilities: { fs: { read: [dir], write: [dir] } } }), "x");
});

test("a dropped async call that fails does not crash the host", async () => {
  const src = `async fn boom() { panic("nobody awaits me") }\nasync fn main() { boom()\n print("main finished") }`;
  const r = await exec(src);
  assert.match(r.output, /main finished/);
  assert.ok(r.taskErrors.length >= 1 || r.ok, "reported or ignored, but the process survives");
});

test("deeply nested source does not crash the compiler", () => {
  const e = errors(`fn main() { let x = ${"(".repeat(20000)}1${")".repeat(20000)} }`);
  assert.equal(e[0].code, "E0002");
});

test("isolated run: a catastrophic regex is killed by the wall clock", async () => {
  const src = `import std.re\nfn main() { let r = re.Regex.compile("(a+)+$").unwrap()\n print(r.isMatch("${"a".repeat(40)}!")) }`;
  const t0 = Date.now();
  const r = await runIsolated({ source: src, limits: { maxMillis: 600 } });
  assert.equal(r.error!.limit, "time");
  assert.ok(Date.now() - t0 < 5000);
});

test("isolated run: a memory bomb is stopped by the heap cap, the host survives", async () => {
  const src = `fn main() {\n var xs: [[Int]] = []\n while true { var row: [Int] = []\n for i in 0..100000 { row.push(i) }\n xs.push(row) }\n}`;
  const r = await runIsolated({ source: src, maxMemoryMb: 64, limits: { maxMillis: 20000, maxCollection: 1e9 } });
  assert.ok(r.error);
  assert.ok(r.error!.limit === "memory" || /memory|limit/i.test(r.error!.message), r.error!.human);
});

test("isolated run returns output and results like a normal run", async () => {
  const r = await runIsolated({ source: `fn main() { print("hi") }` });
  assert.equal(r.ok, true);
  assert.equal(r.output, "hi\n");
  const chunks: string[] = [];
  await runIsolated({ source: `fn main() { print("a")\n print("b") }`, onOutput: (t) => chunks.push(t) });
  assert.equal(chunks.join(""), "a\nb\n");
});

test("concurrent runs do not share state or output", async () => {
  const mk = (n: number) => exec(`import std.task\nvar counter = ${n}\nasync fn main() { for i in 0..3 { await task.sleep(2)\n counter += 1\n print(counter) } }`);
  const [a, b] = await Promise.all([mk(100), mk(200)]);
  assert.equal(a.output, "101\n102\n103\n");
  assert.equal(b.output, "201\n202\n203\n");
});

test("collections and strings obey size limits", async () => {
  const r = await exec(`fn main() { var a: [Int] = []\n while true { a.push(1) } }`, { limits: { maxCollection: 1000 } });
  assert.equal(r.error!.limit, "memory");
  const s = await exec(`fn main() { print("xx".repeat(1000000)) }`, { limits: { maxStringLength: 1000 } });
  assert.equal(s.error!.limit, "memory");
  const c = await exec(`fn main() { var s = "x"\n while true { s = s + s } }`, { limits: { maxStringLength: 100000 } });
  assert.equal(c.error!.limit, "memory");
});

test("fuzz: mutated programs never crash the compiler", () => {
  const seeds = [
    `enum Shape { Circle(r: Float)\n Rect(w: Float, h: Float) }\nfn area(s: Shape) -> Float { return match s { .Circle(r) => r * r\n .Rect(w, h) => w * h } }\nfn main() { print(area(.Circle(r: 2.0))) }`,
    `class A { var n = 1\n fn inc() -> Int { self.n += 1\n return self.n } }\nclass B: A { override fn inc() -> Int { return super.inc() * 2 } }\nfn main() { let b = B()\n print(b.inc()) }`,
    `fn f<T: Comparable>(xs: [T]) -> T? { var best: T? = nil\n for x in xs { if let b = best { if x > b { best = x } } else { best = x } }\n return best }\nfn main() { print(f([3, 1, 2]) ?? 0) }`,
    `interface S { fn a() -> Int }\nstruct P: S { let x: Int\n fn a() -> Int => self.x }\nasync fn g() -> Int { return 1 }\nasync fn main() { let t = spawn g()\n print(await t) }`,
  ];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const toks = ["{", "}", "(", ")", "[", "]", ",", ":", "->", "=>", "let", "fn", "?", "!", "..", "match", "class", "x", "1", "\"s\"", "<", ">", "self", "nil", "async", "await", "gen", "yield", "return", "if", "else", "for", "in", "enum", "struct", "init", "=", "override"];
  let n = 0;
  for (let i = 0; i < 600; i++) {
    let s = seeds[i % seeds.length];
    for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
      const pos = Math.floor(rnd() * s.length);
      const r = rnd();
      if (r < 0.35) s = s.slice(0, pos) + s.slice(pos + 1 + Math.floor(rnd() * 6));
      else if (r < 0.7) s = s.slice(0, pos) + " " + toks[Math.floor(rnd() * toks.length)] + " " + s.slice(pos);
      else { const q = Math.floor(rnd() * s.length); s = s.slice(0, pos) + s.slice(q, q + 8) + s.slice(pos); }
    }
    const c = check({ source: s, file: "fuzz.olx" });
    const ice = c.diagnostics.find((d) => d.code === "E0003");
    assert.ok(!ice, `internal compiler error on:\n${s}\n${ice?.message}`);
    n++;
  }
  assert.equal(n, 600);
});

test("fuzz: valid-looking mutated programs also run without internal errors", async () => {
  const src = `fn main() { var t = 0\n for i in 0..10 { t += i * i }\n print(t) }`;
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 60; i++) {
    const ops = ["+", "-", "*", "/", "%", "**", "<<", ">>", "&", "|", "^"];
    const s = src.replace("i * i", `i ${ops[Math.floor(rnd() * ops.length)]} ${Math.floor(rnd() * 70) - 5}`);
    const r = await exec(s, { limits: { maxSteps: 100000 } });
    if (!r.ok) assert.notEqual(r.error!.kind, "uncaught", s), assert.ok(!/internal error/.test(r.error!.message), `${s}\n${r.error!.human}`);
  }
});

test("a panic deep in recursion reports the whole chain, condensed", async () => {
  const r = await exec(`fn depth(n: Int) -> Int {\n  if n == 0 { panic("bottom") }\n  return depth(n - 1) + 1\n}\nfn main() { print(depth(40)) }`);
  assert.equal(r.error!.trace.filter((f) => f.fn === "depth").length, 41);
  assert.match(r.error!.human, /at depth \(test\.olx:3:3\)  \[repeated 40 times\]/);
  assert.match(r.error!.human, /at main \(test\.olx:5:/);
});
