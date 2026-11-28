import { test } from "node:test";
import * as assert from "node:assert/strict";
import { exec, out, errors, diags } from "./helpers";

const D = "$";

test("shadowing, closures capture per-iteration variables, nested scopes", async () => {
  const src = `
fn main() {
  let x = 1
  let y = x + 1
  if true { let x = x + 10\n print(x) }
  print(x + y)
  var fs: [() -> Int] = []
  for i in 0..3 { fs.push(() => i * 10) }
  print(fs.map((f) => f()))
}`;
  assert.equal(await out(src), "11\n3\n[0, 10, 20]");
  // `{ ... }` where a value is expected is a map literal only when it is `{}` or has `key: value`; with statements it is a closure
  assert.equal(await out(`fn main() { let v = { let x = 5\n x }\n print(v()) }`), "5");
  assert.ok(errors(`fn main() { let v = { let x = 5\n x }\n print(v + 1) }`).length > 0);
});

test("operators on user types: == < sorting, derived comparisons", async () => {
  const src = `
class V: Comparable, Equatable {
  let n: Int
  init(n: Int) { self.n = n }
  operator <(o: V) -> Bool { return self.n < o.n }
  operator ==(o: V) -> Bool { return self.n == o.n }
  fn toString() -> String { return f"V{self.n}" }
}
fn biggest<T: Comparable>(xs: [T]) -> T { var b = xs[0]\n for x in xs { if x > b { b = x } }\n return b }
fn main() {
  let a = V(1)
  let b = V(2)
  print(a < b)
  print(a >= b)
  print(a == V(1))
  print(a != b)
  print(biggest([a, b, V(0)]))
  print([b, a, V(0)].sorted())
}`;
  assert.equal(await out(src), "true\nfalse\ntrue\ntrue\nV2\n[V0, V1, V2]");
});

test("extensions and dynamic dispatch on primitives", async () => {
  const src = `
extend Int { fn double() -> Int { return self * 2 } }
extend<T> [T] { fn second() -> T? { if self.length > 1 { return self[1] }\n return nil } }
interface Describable { fn describe() -> String }
extend Int: Describable { fn describe() -> String { return f"int {self}" } }
extend String: Describable { fn describe() -> String { return "str " + self } }
fn show(d: Describable) -> String { return d.describe() }
fn main() {
  print(21.double())
  print([1, 2, 3].second() ?? 0)
  print(show(5))
  print(show("s"))
}`;
  assert.equal(await out(src), "42\n2\nint 5\nstr s");
});

test("return type inference including mutual recursion", async () => {
  const src = `
fn isEven(n: Int) -> Bool { if n == 0 { return true }\n return isOdd(n - 1) }
fn isOdd(n: Int) -> Bool { if n == 0 { return false }\n return isEven(n - 1) }
fn twice(n: Int) => n * 2
fn later() => twice(4) + 1
fn pair() -> (Int, String) { return (1, "a") }
fn main() {
  print(isEven(10))
  print(later())
  let (n, s) = pair()
  print(f"{n}{s}")
  let p = pair()
  print(p.1)
}`;
  assert.equal(await out(src), "true\n9\n1a\na");
});

test("multi-line strings dedent; escapes; chars", async () => {
  const src = `
fn main() {
  let s = """
    line one
      indented
    done
    """
  print(s)
  print("tab\\there \\u{41} \\"q\\" \\\\")
  print('x'.upper())
  print('\\n'.code)
}`;
  assert.equal(await out(src), "line one\n  indented\ndone\ntab\there A \"q\" \\\nX\n10");
});

test("struct equality, with(), enum equality and display", async () => {
  const src = `
struct P { let x: Int, y: Int }
enum Color { Red\n Green\n Custom(r: Int, g: Int, b: Int) }
fn main() {
  let a = P(x: 1, y: 2)
  print(a == P(x: 1, y: 2))
  print(a == P(x: 1, y: 3))
  print(a.with(y: 9))
  print(Color.Red == Color.Red)
  print(Color.Custom(r: 1, g: 2, b: 3) == Color.Custom(r: 1, g: 2, b: 3))
  print(Color.Custom(r: 1, g: 2, b: 3))
  print([Color.Green, Color.Red])
  let p = a
  print(p.x)
}`;
  assert.equal(await out(src), "true\nfalse\nP(x: 1, y: 9)\ntrue\ntrue\nCustom(r: 1, g: 2, b: 3)\n[Green, Red]\n1");
  const e = errors(`struct P { let x: Int }\nfn main() { var p = P(x: 1)\n p.x = 2 }`);
  assert.equal(e[0].code, "E0373");
});

test("conditional expressions, compound assignment on fields and indexes", async () => {
  const src = `
class C { var n = 0\n var xs = [1, 2, 3] }
fn main() {
  let c = C()
  c.n += 5
  c.xs[1] *= 10
  c.n -= 1
  var m = {"k": 1}
  m["k"] = (m["k"] ?? 0) + 1
  let label = if c.n > 3 { "big" } else { "small" }
  let t = c.n > 100 ? "huge" : "ok"
  print(f"{c.n} {c.xs} {m} {label} {t}")
  var o: Int? = nil
  o ??= 7
  print(o)
}`;
  assert.equal(await out(src), `4 [1, 20, 3] {"k": 2} big ok\n7`);
});

test("optional chains short-circuit the whole chain", async () => {
  const src = `
class Inner { let v: Int\n init(v: Int) { self.v = v }\n fn twice() -> Int { return self.v * 2 } }
class Outer { var inner: Inner? = nil }
var calls = 0
fn side() -> Int { calls += 1\n return 1 }
fn main() {
  let o = Outer()
  print(o.inner?.twice() ?? -1)
  print(o.inner?.v ?? -2)
  print(o.inner?.twice().toFloat() ?? -3.0)
  o.inner = Inner(4)
  print(o.inner?.twice() ?? -1)
  print(o.inner?.twice().toFloat() ?? -3.0)
  let n: Outer? = nil
  print(n?.inner?.v ?? -9)
  print(n?.inner?.twice() == nil)
}`;
  assert.equal(await out(src), "-1\n-2\n-3.0\n8\n8.0\n-9\ntrue");
});

test("match as an expression containing await, nested", async () => {
  const src = `
import task
async fn val(n: Int) -> Int { await task.sleep(1)\n return n }
async fn main() {
  let r = match await val(2) { 1 => "one", 2 => match await val(3) { 3 => "two-three", _ => "?" }, _ => "other" }
  print(r)
  let t = try await val(5)
  print(t)
}`;
  assert.equal(await out(src), "two-three\nOk(5)");
});

test("generic class hierarchy and interface with type parameters", async () => {
  const src = `
interface Repo<T> { fn all() -> [T]\n fn add(item: T) }
class MemRepo<T>: Repo<T> {
  var items: [T] = []
  fn all() -> [T] { return self.items }
  fn add(item: T) { self.items.push(item) }
}
class Named { let name: String\n init(name: String) { self.name = name } }
fn fill(r: Repo<Named>) { r.add(Named("a"))\n r.add(Named("b")) }
fn main() {
  let r = MemRepo<Named>()
  fill(r)
  print(r.all().map((n) => n.name))
  let ints = MemRepo<Int>()
  ints.add(3)
  print(ints.all())
}`;
  assert.equal(await out(src), `["a", "b"]\n[3]`);
  const e = errors(`class A {}\nfn f(xs: [A]) {}\nclass B: A {}\nfn main() { let bs: [B] = [B()]\n f(bs) }`);
  assert.equal(e[0].code, "E0300");
  assert.match(e[0].why!, /invariant|exactly/);
});

test("visibility: protected, private across subclasses, static members", async () => {
  const src = `
class Base { protected var secret = 1\n private var hidden = 2\n static fn make() -> Base { return Base() } }
class Child: Base { fn peek() -> Int { return self.secret } }
fn main() { print(Child().peek())\n print(Base.make().hidden) }`;
  const e = errors(src);
  assert.equal(e.length, 1);
  assert.match(e[0].message, /`hidden` is private in Base/);
  const e2 = errors(`class Base { protected var secret = 1 }\nfn main() { print(Base().secret) }`);
  assert.match(e2[0].message, /protected/);
});

test("definite initialisation and return-path checks", () => {
  assert.equal(errors(`class A { var x: Int\n var y: Int\n init() { self.x = 1 } }\nfn main() {}`)[0].code, "E0253");
  const r = errors(`fn f(n: Int) -> Int { if n > 0 { return 1 } }\nfn main() {}`);
  assert.equal(r[0].code, "E0252");
  assert.match(r[0].suggestion!, /return/);
  assert.equal(errors(`fn f(n: Int) -> Int { if n > 0 { return 1 } else { return 2 } }\nfn main() {}`).length, 0);
  assert.equal(errors(`fn f() -> Int { while true { } }\nfn main() {}`).length, 0);
});

test("unreachable code and unused variables produce warnings, not errors", async () => {
  const r = await exec(`fn f() -> Int { return 1\n print("never") }\nfn main() { let unused = f() }`);
  assert.equal(r.ok, true);
  const codes = r.diagnostics.map((d) => d.code).sort();
  assert.deepEqual(codes, ["W0101", "W0102"]);
});

test("Float printing, parsing and conversion", async () => {
  const src = `
fn main() {
  print(1.0)
  print(0.1 + 0.2)
  print(1e21)
  print(2.5.round())
  print((-2.5).round())
  print(7.9.toInt())
  print(Int.parse("42") ?? 0)
  print(Int.parse("4x2") == nil)
  print(Float.parse("3.5e2") ?? 0.0)
  print(10.fixed_placeholder)
}`.replace("  print(10.fixed_placeholder)\n", "  print(3.14159.fixed(2))\n");
  assert.equal(await out(src), "1.0\n0.30000000000000004\n1e+21\n3\n-3\n7\n42\ntrue\n350.0\n3.14");
});

test("bigger Int arithmetic stays exact up to 64 bits", async () => {
  const src = `fn main() { print(9007199254740993 + 2)\n print(Int.maxValue)\n print(Int.minValue)\n print(3037000499 * 3037000499)\n print(1 << 62)\n print(-17 >> 2)\n print(0xFF & 0b1010) }`;
  assert.equal(await out(src), "9007199254740995\n9223372036854775807\n-9223372036854775808\n9223372030926249001\n4611686018427387904\n-5\n10");
});

test("gen fn with early exit and delegation", async () => {
  const src = `
gen fn inner() -> Gen<Int> { yield 1\n yield 2 }
gen fn outer() -> Gen<Int> { yield 0\n yield* inner()\n yield 3 }
fn main() { var seen: [Int] = []\n for x in outer() { if x == 3 { break }\n seen.push(x) }\n print(seen) }`;
  assert.equal(await out(src), "[0, 1, 2]");
});

test("labeled diagnostics: wrong argument count and names", () => {
  const e = errors(`fn f(a: Int, b: Int = 2) -> Int { return a + b }\nfn main() { f()\n f(1, 2, 3)\n f(1, c: 5) }`);
  assert.deepEqual(e.map((x) => x.code), ["E0404", "E0401", "E0402"]);
  assert.match(e[0].suggestion!, /signature: f\(a: Int, b: Int = \.\.\.\)/);
});

test("WO111 20a: untyped parameters inferred from body and call sites", async () => {
  // Infer from body (x * 2 with Int literal)
  const src1 = `
fn double(x) { return x * 2 }
fn main() { print(double(21)) }
`;
  assert.equal(await out(src1), "42");

  // Infer from call site: add(a, b) => a + b
  const src2 = `
fn add(a, b) => a + b
fn main() { print(add(2, 3)) }
`;
  assert.equal(await out(src2), "5");

  // Strings at call site
  const src3 = `
fn add(a, b) => a + b
fn main() { print(add("hello ", "world")) }
`;
  assert.equal(await out(src3), "hello world");

  // Impossible without call site
  const e1 = errors("fn add(a, b) => a + b");
  assert.ok(e1.some((d) => d.code === "E0221" && /write `a: Type`/.test(d.suggestion ?? "")));

  // Conflicting call sites: names the earlier call site and says what to write
  const e2 = errors("fn add(a, b) => a + b\nfn main() {\n  add(1, 2)\n  add(\"x\", \"y\")\n}");
  assert.ok(e2.some((d) => d.code === "E0221" && /call site at/.test(d.message) && /write `fn add/.test(d.suggestion ?? "")));

  // Body error with call-site types: names the call site
  const e3 = errors("fn bad(x) { return x.foo() }\nfn main() { bad(42) }");
  assert.ok(e3.some((d) => d.why?.includes("call site at") || d.notes?.some((n) => n.includes("call from"))));
});

test("WO111 20b: empty map {} and empty array [] with element types inferred from later use", async () => {
  // Empty map {} inferred from indexing assignment
  const src1 = `
fn main() {
  var counts = {}
  counts["apples"] = 3
  counts["oranges"] = 5
  print(counts["apples"] ?? 0)
}
`;
  assert.equal(await out(src1), "3");

  // Empty array [] inferred from push
  const src2 = `
fn main() {
  var xs = []
  xs.push(10)
  xs.push(20)
  print(xs)
}
`;
  assert.equal(await out(src2), "[10, 20]");

  // Old empty map {:} is now an error that says to write {} (item 22: no made-up syntax)
  const e0 = errors("fn main() { var counts = {:} }");
  assert.ok(e0.some((d) => d.code === "E0101" && /\{:\}/.test(d.message)), JSON.stringify(e0));

  // Unused empty map {} gives E0230
  const e1 = errors("fn main() { let counts = {} }");
  assert.ok(e1.some((d) => d.code === "E0230" && /empty map/.test(d.message)));
  assert.ok(e1.some((d) => d.code === "E0230" && /`counts`/.test(d.message)));

  // Unused empty array [] gives E0230
  const e2 = errors("fn main() { let xs = [] }");
  assert.ok(e2.some((d) => d.code === "E0230" && /empty array/.test(d.message)));
  assert.ok(e2.some((d) => d.code === "E0230" && /`xs`/.test(d.message)));
});

test("WO111 20c: numbers like Python: Int * Float -> Float, 7 / 2 -> 3.5, 7.div(2) -> 3", async () => {
  const src = `
fn main() {
  print(7 / 2)
  print(7.div(2))
  print(-7.div(2))
  let a = 4
  let b = 1.5
  let c = a * b
  print(c)
  print(10 - 2.5)
  print(3.5 + 4)
  print(3 == 3.0)
  print(3 != 3.5)
  print(3 < 3.5)
}
`;
  assert.equal(await out(src), "3.5\n3\n-3\n6.0\n7.5\n7.5\ntrue\ntrue\ntrue");

  // Division by zero panics
  const z1 = await exec("fn main() { print(7 / 0) }");
  assert.equal(z1.error?.kind, "panic");
  assert.match(z1.error!.message, /division by zero/);

  // 7.div(0) panics
  const z2 = await exec("fn main() { print(7.div(0)) }");
  assert.equal(z2.error?.kind, "panic");
  assert.match(z2.error!.message, /division by zero/);
});

test("WO111 20d: ranges act like lists: (1..5).map(...), .filter, .sum(), len(1..5)", async () => {
  const src = `
fn main() {
  let mapped = (1..5).map((x) => x * 10)
  print(mapped)
  let filtered = (1..5).filter((x) => x % 2 == 0)
  print(filtered)
  print((1..5).sum())
  print(len(1..5))
  print((1..=5).sum())
  print(len(1..=5))
  print(sum(1..5))
}
`;
  assert.equal(await out(src), "[10, 20, 30, 40]\n[2, 4]\n10\n4\n15\n5\n10");
});

test("WO111 22: real syntax only — if as a value, Python's a if c else b, Set([...]), anonymous fn; made-up forms rejected with fix-its", async () => {
  const src = `
fn sign(n) => if n < 0 { "neg" } else if n == 0 { "zero" } else { "pos" }
let label = "big" if 10 > 3 else "small"
let s = Set([1, 2, 2, 3])
let w = if s.has(2) {
  "has two"
} else {
  "no"
}
print(sign(-2), sign(0), sign(5), label, s.length, w)
print([1, 2, 3].map(fn(x) => x * x), [1, 2].map(fn(x) { return x * 2 }))
print(match 3 { n if n > 2 => "gt2", _ => "other" })
print(f"{"x" if true else "y"}")
`;
  assert.equal(await out(src), "neg zero pos big 3 has two\n[1, 4, 9] [2, 4]\ngt2\nx");
  const bad: [string, RegExp, RegExp][] = [
    ["let s = #[1, 2]", /`#\[\.\.\.\]` is not Mycel syntax/, /Set\(\[1, 2\]\)/],
    ["let m = {:}", /`\{:\}` is not Mycel syntax/, /write `\{\}`/],
    ["let x = if true then 1 else 2", /`then` is not Mycel syntax/, /if cond \{ a \} else \{ b \}/],
    ["let y = if true { 1 }", /needs an `else`/, /else/],
    ["let z = 1 if true", /needs an `else`/, /else/],
    ["let w = if true { let a = 1\na } else { 2 }", /one expression in each branch/, /function/],
  ];
  for (const [code, msg, fix] of bad) {
    const ds = errors(code);
    assert.ok(ds.some((d: any) => msg.test(d.message) && fix.test(String(d.suggestion ?? ""))), `${code}: ${JSON.stringify(ds)}`);
  }
});

test("WO111 20e: simpler than Python — x = 1 declares, a, b = b, a, in / not in, comprehensions, xs[-1], get(k, d), set & | -, step", async () => {
  const src = `
total = 0
fn add(x) { total = total + x }
add(5)
add(7)
fn sumList(xs) {
  s = 0
  for x in xs { s += x }
  return s
}
a, b = 1, 2
a, b = b, a
counts = {}
for w in "a b a".split(" ") { counts[w] = counts.get(w, 0) + 1 }
print(total, sumList([1, 2, 3]), a, b, counts)
print([n * n for n in 1..11 if n % 2 == 0], [1, 2, 3][-1], "hey"[-1])
print(2 in [1, 2], "z" not in "abc", "k" in {"k": 1}, 3 in Set([3]), 5 in 1..3)
x = Set([1, 2, 3])
y = Set([2, 3, 4])
print((x & y).sorted(), (x | y).sorted(), (x - y).sorted(), (0..=100).step(25))
`;
  assert.equal(await out(src), `12 6 2 1 {"a": 2, "b": 1}\n[4, 16, 36, 64, 100] 3 y\ntrue true true true false\n[2, 3] [1, 2, 3, 4] [1] [0, 25, 50, 75, 100]`);
  // a never-read new name next to a similar one is flagged as a likely typo; a block-local name gets a scope hint
  const w = diags("fn f() {\n  count = 0\n  cuont = count + 1\n  print(count)\n}");
  assert.ok(w.some((d: any) => /made a new variable/.test(d.message) && /did you mean `count`/.test(String(d.suggestion))), JSON.stringify(w));
  const e = errors("fn g(c) {\n  if c { x = 1 }\n  print(x)\n}");
  assert.ok(e.some((d: any) => /first set inside/.test(String(d.why)) && /before the block/.test(String(d.suggestion))), JSON.stringify(e));
});
