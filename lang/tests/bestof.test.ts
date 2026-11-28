// Task 52 (best of Python/JS/Java/Rust/Go/Swift): every feature added there is pinned here. Each test fails when its
// feature is reverted (proved in docs/rebuild/reports/MYCEL_best_of.md).
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { out, errors } from "./helpers";

// ---------- comprehensions (Python) ----------
test("comprehensions: map, nested for, patterns, any iterable, filter clauses", async () => {
  assert.equal(await out(`
let words = ["hi", "there"]
print({w: len(w) for w in words})
print([(a, b) for a in [1, 2] for b in [3, 4] if a != b - 2])
let ages = {"ann": 31, "bo": 17}
print([name for (name, age) in ages if age >= 18])
print([f"{i}:{x}" for i, x in ["p", "q"]])
print([c for c in "abc"])
print([i * i for i in 0..5 if i % 2 == 0])
let fs: [Float] = [1 for _ in 0..2]
print(fs)
print({n: [d for d in 1..=n if n % d == 0] for n in 4..=6})`),
    `{"hi": 2, "there": 5}\n[(1, 4), (2, 3)]\n["ann"]\n["0:p", "1:q"]\n["a", "b", "c"]\n[0, 4, 16]\n[1.0, 1.0]\n{4: [1, 2, 4], 5: [1, 5], 6: [1, 2, 3, 6]}`);
});

test("comprehensions: await inside one, variables do not leak, conditions must be Bool", async () => {
  assert.equal(await out(`
import task
async fn twice(n: Int) -> Int { await task.sleep(1)
 return n * 2 }
async fn main() { print([await twice(x) for x in [1, 2]]) }`), "[2, 4]");
  const leak = errors(`fn main() { let xs = [x for x in [1]]\n print(x) }`);
  assert.ok(leak.some((d) => d.code === "E0352" && d.message.includes("`x`")), JSON.stringify(leak));
  const cond = errors(`print([x for x in [1] if x])`);
  assert.ok(cond.some((d) => d.message.includes("expected Bool, found Int") && d.why!.includes("comprehension condition")), JSON.stringify(cond));
  const key = errors(`print({[x]: 1 for x in [1]})`);
  assert.ok(key.length > 0, "a list cannot be a map key");
});

// ---------- destructuring in parameters (Swift/Rust tuples, Rust structs) ----------
test("destructured parameters: fn, lambda with and without context, struct pattern, method", async () => {
  assert.equal(await out(`
fn add((a, b): (Int, Int)) -> Int => a + b
print(add((1, 2)))
print([(1, "one"), (2, "two")].map(((n, w)) => f"{n}={w}"))
print({"a": 1, "b": 2}.entries.filter(((_, v)) => v > 1))
struct P { let x: Int, y: Int }
fn sum(P{x, y}: P) => x + y
print(sum(P(x: 3, y: -1)))
let g = ((a, b)) => a * b
print(g((6, 7)))
class C { fn twice((s, n): (String, Int)) -> String { return s.repeat(n * 2) } }
print(C().twice(("ab", 1)))`), `3\n["1=one", "2=two"]\n[("b", 2)]\n2\n42\nabab`);
});

test("destructured parameters: refutable patterns and defaults are refused; messages name the pattern", () => {
  const ref = errors(`enum E { A(Int), B }\nfn f(E.A(n): E) -> Int => n`);
  assert.ok(ref.length > 0, "an enum variant pattern can fail and must not destructure a parameter");
  const arr = errors(`fn f([a, b]: [Int]) -> Int => a`);
  assert.ok(arr.length > 0);
  const def = errors(`fn f((a, b): (Int, Int) = (1, 2)) -> Int => a + b`);
  assert.ok(def.some((d) => d.message.includes("cannot have a default value")), JSON.stringify(def));
  const mis = errors(`fn f((a, b): (Int, Int)) -> Int => a + b\nprint(f(1))`);
  assert.ok(mis.some((d) => (d.why ?? "").includes("argument `(a, b)`")), JSON.stringify(mis));
});

// ---------- labeled break / continue (Go, Java, Swift) ----------
test("labeled loops: break/continue an outer for or while", async () => {
  assert.equal(await out(`
outer: for i in 0..3 {
  for j in 0..3 {
    if j == 1 { continue outer }
    if i == 2 { break outer }
    print(f"{i}{j}")
  }
}
var n = 0
spin: while true {
  while true {
    n += 1
    if n > 3 { break spin }
  }
}
print(n)`), "00\n10\n4");
});

test("labeled loops: unknown label suggests the near one, duplicate labels, and break outer counts for missing-return", () => {
  const typo = errors(`outer: for i in 0..3 { for j in 0..2 { break outr } }`);
  assert.ok(typo.some((d) => d.code === "E0270" && (d.suggestion ?? "").includes("break outer")), JSON.stringify(typo));
  const dup = errors(`a: for i in 0..2 { a: for j in 0..2 { } }`);
  assert.ok(dup.some((d) => d.code === "E0271"), JSON.stringify(dup));
  // `break outer` from the inner loop leaves `outer: while true`, so the function can fall off its end
  const fall = errors(`fn f() -> Int {\n  outer: while true { for i in 0..3 { if i == 2 { break outer } } }\n}`);
  assert.ok(fall.some((d) => d.code === "E0252"), JSON.stringify(fall));
  assert.deepEqual(errors(`fn f() -> Int {\n  outer: while true { for i in 0..3 { if i == 2 { break } } }\n}`), []);
});

// ---------- JSON-native literals (JavaScript) ----------
test("json literals: nested objects/arrays/numbers/bools/nil where a Json is expected", async () => {
  assert.equal(await out(`
import json
let user: json.Json = {"name": "Ada", "age": 36, "langs": ["mycel", "python"], "admin": false, "boss": nil, "score": -1.5}
print(user.stringify())
print(user["langs"][1].asString!)
fn config() -> json.Json => {"debug": true, "level": 3}
print(config()["level"].asInt!)
let items: [json.Json] = [1, "two", [3], {}]
print(json.stringify(.Arr(items)))
let maybe: json.Json? = nil
print(maybe == nil)`), `{"name":"Ada","age":36,"langs":["mycel","python"],"admin":false,"boss":null,"score":-1.5}\npython\n3\n[1,"two",[3],{}]\ntrue`);
});

test("json literals: only literals lift; a variable gets a suggestion naming its variant", () => {
  const e = errors(`import json\nlet name = "Bo"\nlet n = 2\nlet v: json.Json = {"name": name, "n": n}\nprint(v)`);
  assert.ok(e.some((d) => d.suggestion === "write `.Str(name)`"), JSON.stringify(e));
  assert.ok(e.some((d) => d.suggestion === "write `.Num(n.toFloat())`"), JSON.stringify(e));
  // a plain map literal elsewhere is still a typed map, not Json
  assert.ok(errors(`let m = {"a": 1, "b": "x"}\nprint(m)`).length > 0);
});

// ---------- select over channels (Go) ----------
test("task.select: first channel wins, the others keep their values, closed gives nil, timeout gives nil", async () => {
  assert.equal(await out(`
import task
async fn later(c: task.Channel<String>, s: String, ms: Int) {
  await task.sleep(ms)
  c.send(s)
}
async fn main() {
  let a = task.Channel<String>()
  let b = task.Channel<String>()
  spawn later(b, "b first", 2)
  spawn later(a, "a later", 15)
  let (which, v) = await task.select([a, b])
  print(which, v!)
  print(await a.recv())
  b.send("ready")
  print(await task.select([a, b]))
  print(await task.select([a, b], timeout: 5))
  a.close()
  print(await task.select([a, b]))
  # the waiter select left on b was removed: this value is still queued, not swallowed
  b.send("kept")
  print(b.length)
}`), `1 b first\na later\n(1, "ready")\nnil\n(0, nil)\n1`);
});

// ---------- live values per line (Swift playgrounds) ----------
test("live values: bindings, assignments, value lines and loop counts of the entry module; off by default", async () => {
  const { run, compile } = await import("../src/host");
  const src = `let name = "Ada"\nvar total = 0\nfor i in 1..=4 {\n  total += i\n}\nlet xs = [x * x for x in 0..4]\nxs.length * 2\nfn double(n: Int) -> Int {\n  let r = n * 2\n  return r\n}\nprint(double(21))\n`;
  const r = await run({ source: src, file: "main.myc", liveValues: true });
  assert.equal(r.output, "42\n");
  assert.deepEqual(r.live, [
    { line: 1, name: "name", text: '"Ada"', count: 1 },
    { line: 2, name: "total", text: "0", count: 1 },
    { line: 4, name: "total", text: "10", count: 4 },
    { line: 6, name: "xs", text: "[0, 1, 4, 9]", count: 1 },
    { line: 7, name: "", text: "8", count: 1 },
    { line: 9, name: "r", text: "42", count: 1 },
  ]);
  const plain = await run({ source: src, file: "main.myc" });
  assert.equal(plain.live, undefined);
  assert.ok(!compile({ source: src, file: "main.myc" }).code!.includes("$live("), "no recording code unless asked");
  // a hot loop stays cheap: rendering stops after 1000 hits, the last value is rendered at the end
  const hot = await run({ source: `var n = 0\nwhile n < 5000 {\n  n += 1\n}\n`, file: "main.myc", liveValues: true });
  assert.deepEqual(hot.live!.find((x) => x.line === 3), { line: 3, name: "n", text: "5000", count: 5000 });
});

test("live values: the playground bundle returns them and the page shows them", { skip: require("fs").existsSync(require("path").resolve(__dirname, "..", "..", "..", "site", "public", "mycel", "play")) ? false : "site/ not present" }, async () => {
  const fs = require("fs") as typeof import("fs"), path = require("path") as typeof import("path"), vm = require("vm") as typeof import("vm");
  const { execFileSync } = require("child_process") as typeof import("child_process");
  const lang = path.resolve(__dirname, "..", "..");
  const play = path.resolve(lang, "..", "site", "public", "mycel", "play");
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "mycel-live-"));
  execFileSync("node", [path.join(lang, "web", "build.mjs"), tmp]);
  const ctx: any = vm.createContext({ console, setTimeout, clearTimeout, queueMicrotask, crypto: globalThis.crypto, TextEncoder, TextDecoder, AbortController });
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(tmp, "mycel.js"), "utf8"), ctx);
  const r = await ctx.Mycel.runSource(`let a = 6\nlet b = a * 7\nprint(b)\n`, { live: true });
  assert.deepEqual(JSON.parse(JSON.stringify(r.live)), [{ line: 1, name: "a", text: "6", count: 1 }, { line: 2, name: "b", text: "42", count: 1 }]);
  const page = fs.readFileSync(path.join(play, "index.html"), "utf8"), worker = fs.readFileSync(path.join(play, "worker.js"), "utf8");
  assert.match(page, /<div class="live" id="live"/);
  assert.match(page, /showLive\(r\.live\)/);
  assert.match(page, /worker\.postMessage\(\{ code, inputs: answers, seed, live: \$\("vals"\)\.checked(, files: [^\n]*)? \}\)/);
  assert.match(worker, /live: !!live/);
});

test("playground page: output that streamed in is not appended a second time when the run finishes", { skip: require("fs").existsSync(require("path").resolve(__dirname, "..", "..", "..", "site", "public", "mycel", "play")) ? false : "site/ not present" }, () => {
  const fs = require("fs") as typeof import("fs"), path = require("path") as typeof import("path");
  const page = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "site", "public", "mycel", "play", "index.html"), "utf8");
  assert.match(page, /if \(m\.data\.type === "out"\) \{ streamed = true;/);
  assert.match(page, /if \(r\.output && !streamed\)/);
});

// ---------- formatter: struct patterns stay patterns ----------
test("fmt keeps struct patterns tight (P{x, y}); 'P {x, y}' would no longer parse", async () => {
  const { format } = await import("../src/fmt");
  const src = `struct P { let x: Int, y: Int }\nfn f(P{x, y}: P) => x + y\nfn main() {\n  let p = P(x: 1, y: 2)\n  let P{x, y} = p\n  print(match p { P{x, y} => x + y }, f(p), x, y)\n}\nclass C{ }\n`;
  const once = format(src, "t.myc");
  assert.match(once, /let P\{x, y\} = p/);
  assert.match(once, /fn f\(P\{x, y\}: P\)/);
  assert.match(once, /match p \{ P\{x, y\} =>/);
  assert.match(once, /class C \{ \}/, "other braces still get their space");
  assert.equal(await out(once), "3 3 1 2");
});
