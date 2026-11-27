import { test } from "node:test";
import * as assert from "node:assert/strict";
import { exec, out, errors } from "./helpers";

const prog = (body: string) => `fn main() {\n${body}\n}`;

test("hello world and interpolation", async () => {
  assert.equal(await out(prog(`print(f"Hello, {1 + 2}!")`)), "Hello, 3!");
});

test("let is immutable, var is mutable, inference", async () => {
  assert.equal(await out(prog(`var x = 1\nx += 2\nlet y: Float = 2\nprint(f"{x} {y}")`)), "3 2.0");
  const e = errors(prog(`let x = 1\nx = 2`));
  assert.equal(e[0].code, "E0371");
  assert.match(e[0].suggestion!, /var x/);
});

test("integer semantics: 64-bit, overflow panics, whole-number division with .div()", async () => {
  assert.equal(await out(prog(`print(7 / 2)\nprint(-7 / 2)\nprint(7.div(2))\nprint(-7.div(2))\nprint(-7 % 3)\nprint(2 ** 62)`)), "3.5\n-3.5\n3\n-3\n-1\n4611686018427387904");
  const r = await exec(prog(`let big = 9223372036854775807\nprint(big + 1)`));
  assert.equal(r.error?.kind, "panic");
  assert.match(r.error!.message, /integer overflow/);
  const z = await exec(prog(`let a = 0\nprint(1 / a)`));
  assert.match(z.error!.message, /division by zero/);
});

test("Int and Float mix like Python", async () => {
  assert.equal(await out(prog(`let a = 1\nlet b = 2.5\nprint(a + b)\nprint(2 * 1.5)\nprint(3 == 3.0)\nprint(3 < 3.5)`)), "3.5\n3.0\ntrue\ntrue");
});

test("functions: defaults, named args, recursion, closures, higher-order", async () => {
  const src = `
fn greet(name: String, greeting: String = "Hello") -> String { return f"{greeting}, {name}" }
fn fact(n: Int) -> Int { if n <= 1 { return 1 }\n return n * fact(n - 1) }
fn counter() -> () -> Int { var c = 0\n return () => { c += 1\n return c } }
fn main() {
  print(greet("a"))
  print(greet(greeting: "Yo", name: "b"))
  print(fact(10))
  let next = counter()
  next()
  print(next())
}`;
  assert.equal(await out(src), "Hello, a\nYo, b\n3628800\n2");
});

test("overloading by parameter types", async () => {
  const src = `
fn show(x: Int) -> String { return f"int {x}" }
fn show(x: String) -> String { return f"str {x}" }
fn main() { print(show(1))\n print(show("a")) }`;
  assert.equal(await out(src), "int 1\nstr a");
});

test("classes: init, inheritance, override, super, properties, static", async () => {
  const src = `
class Animal {
  var name: String
  static var count = 0
  init(name: String) { self.name = name\n Animal.count += 1 }
  fn speak() -> String { return "..." }
  get label: String { return f"<{self.name}>" }
}
class Dog: Animal {
  var tricks = 0
  init(name: String, tricks: Int) { super.init(name)\n self.tricks = tricks }
  override fn speak() -> String { return f"{super.speak()}woof" }
}
fn main() {
  let d = Dog("rex", 3)
  print(d.speak())
  print(d.label)
  print(d.tricks)
  Animal("x")
  print(Animal.count)
}`;
  assert.equal(await out(src), "...woof\n<rex>\n3\n2");
});

test("override must be marked, and must exist", () => {
  const base = `class A { fn f() -> Int { return 1 } }\n`;
  assert.equal(errors(base + `class B: A { fn f() -> Int { return 2 } }`)[0].code, "E0244");
  assert.equal(errors(base + `class B: A { override fn g() -> Int { return 2 } }`)[0].code, "E0243");
});

test("access modifiers", () => {
  const e = errors(`class A { private var secret = 1 }\nfn main() { let a = A()\n print(a.secret) }`);
  assert.equal(e[0].code, "E0380");
  assert.match(e[0].message, /private/);
});

test("interfaces: conformance is checked, default methods work", async () => {
  const bad = errors(`interface S { fn area() -> Float }\nclass C: S { }\nfn main() {}`);
  assert.equal(bad[0].code, "E0241");
  assert.match(bad[0].why!, /fn area/);
  const src = `
interface Greeter { get name: String\n fn hi() -> String { return f"hi {self.name}" } }
class P: Greeter { let name: String\n init(name: String) { self.name = name } }
fn greet(g: Greeter) -> String { return g.hi() }
fn main() { print(greet(P("bob"))) }`;
  assert.equal(await out(src), "hi bob");
});

test("generics with bounds and inference", async () => {
  const src = `
fn maxOf<T: Comparable>(a: T, b: T) -> T { if a > b { return a }\n return b }
class Box<T> { let v: T\n init(v: T) { self.v = v }\n fn get() -> T { return self.v } }
fn main() {
  print(maxOf(3, 9))
  print(maxOf("a", "b"))
  let b = Box(5)
  print(b.get() + 1)
  let c = Box<String>("s")
  print(c.get())
}`;
  assert.equal(await out(src), "9\nb\n6\ns");
  const e = errors(`fn f<T: Comparable>(a: T) {}\nclass X {}\nfn main() { f(X()) }`);
  assert.equal(e[0].code, "E0215");
});

test("enums, pattern matching, exhaustiveness", async () => {
  const src = `
enum Shape { Circle(r: Float)\n Rect(w: Float, h: Float)\n Dot }
fn area(s: Shape) -> Float {
  return match s {
    .Circle(r) => 3.0 * r * r
    .Rect(w, h) => w * h
    .Dot => 0.0
  }
}
fn classify(n: Int) -> String {
  return match n {
    0 => "zero"
    1..=9 => "small"
    x if x < 0 => "neg"
    _ => "big"
  }
}
fn main() {
  print(area(.Rect(w: 2.0, h: 3.0)))
  print(classify(0) + classify(5) + classify(-3) + classify(50))
  let pair = (1, "x")
  match pair { (1, s) => print(f"one {s}"), _ => print("other") }
  match [1, 2, 3] { [first, ..rest] => print(f"{first} {rest}"), _ => print("empty") }
}`;
  assert.equal(await out(src), "6.0\nzerosmallnegbig\none x\n1 [2, 3]");
  const e = errors(`enum E { A\n B\n C }\nfn f(e: E) -> Int { return match e { .A => 1, .B => 2 } }\nfn main() {}`);
  assert.equal(e[0].code, "E0460");
  assert.match(e[0].why!, /E\.C/);
});

test("optionals: ?., ??, !, if let, narrowing", async () => {
  const src = `
class U { let name: String\n init(name: String) { self.name = name } }
fn find(ok: Bool) -> U? { if ok { return U("ann") }\n return nil }
fn main() {
  print(find(true)?.name ?? "none")
  print(find(false)?.name ?? "none")
  let u = find(true)
  if u != nil { print(u!.name) }
  if let v = find(true) { print(v.name.upper()) }
  let w = find(false)
  if w == nil { print("nil!") }
}`;
  assert.equal(await out(src), "ann\nnone\nann\nANN\nnil!");
  const e = errors(`class U { let n = 1 }\nfn f() -> U? { return nil }\nfn main() { print(f().n) }`);
  assert.equal(e[0].code, "E0382");
  assert.match(e[0].suggestion!, /\?\./);
  const r = await exec(`fn main() { let x: Int? = nil\n print(x!) }`);
  assert.match(r.error!.message, /force-unwrapping/);
});

test("Result, ? propagation, try/catch/finally, typed errors", async () => {
  const src = `
class NotFound: Error {}
class Bad: Error {}
fn parse(s: String) -> Result<Int, Error> {
  match s.toInt() { nil => return Err(Error(f"bad int {s}")), n => return Ok(n!) }
}
fn sum(a: String, b: String) -> Result<Int, Error> { let x = parse(a)?\n let y = parse(b)?\n return Ok(x + y) }
fn risky(n: Int) { if n == 1 { throw NotFound("one") }\n if n == 2 { throw Bad("two") } }
fn main() {
  print(sum("1", "2"))
  print(sum("1", "x"))
  for n in 0..3 {
    try { risky(n)\n print(f"ok {n}") }
    catch e: NotFound { print(f"nf {e.message}") }
    catch e { print(f"other {e.message}") }
    finally { write(".") }
  }
  print("")
  let r = try risky(2)
  print(r.isErr)
}`;
  assert.equal(await out(src), "Ok(3)\nErr(Error: bad int x)\nok 0\n.nf one\n.other two\n.\ntrue");
});

test("panics are not catchable and carry a trace", async () => {
  const r = await exec(`fn f(a: [Int]) -> Int { return a[5] }\nfn main() {\n try { print(f([1])) } catch e { print("caught") }\n}`);
  assert.equal(r.error!.kind, "panic");
  assert.match(r.error!.message, /index 5 is out of range/);
  assert.equal(r.error!.trace[0].fn, "f");
  assert.equal(r.error!.trace[0].line, 1);
  assert.equal(r.output, "");
});

test("collections: arrays, maps, sets, tuples, destructuring, slices", async () => {
  const src = `
fn main() {
  var a = [3, 1, 2]
  a.push(0)
  print(a.sorted())
  print(a[1..3])
  var m: {String: Int} = {}
  m["x"] = 1
  m["y"] = 2
  print(m["x"] ?? 0)
  print(m["zz"] == nil)
  for (k, v) in m { write(f"{k}={v};") }
  print("")
  let s = Set([1, 2, 2, 3])
  print(s.length)
  let (p, q) = (1, 2)
  [p, q] = [q, p]
  print(f"{p}{q}")
  print("abcdef"[1..4])
}`;
  const o = await out(src.replace("[p, q] = [q, p]", "(p, q) = (q, p)").replace("let (p, q)", "var (p, q)"));
  assert.equal(o, "[0, 1, 2, 3]\n[1, 2]\n1\ntrue\nx=1;y=2;\n3\n21\nbcd");
});

test("generators and iterators", async () => {
  const src = `
gen fn evens(limit: Int) -> Gen<Int> { var i = 0\n while i < limit { yield i\n i += 2 } }
class Countdown: Iterable<Int> {
  let from: Int
  init(from: Int) { self.from = from }
  fn iter() -> Iterator<Int> { return countdown(self.from) }
}
gen fn countdown(n: Int) -> Gen<Int> { var i = n\n while i > 0 { yield i\n i -= 1 } }
fn main() {
  print(evens(7).toArray())
  var out: [Int] = []
  for x in Countdown(3) { out.push(x) }
  print(out)
}`;
  assert.equal(await out(src), "[0, 2, 4, 6]\n[3, 2, 1]");
});

test("async: await, spawn, concurrent ordering", async () => {
  const src = `
import std.task
async fn work(name: String, ms: Int) -> String { await task.sleep(ms)\n return name }
async fn main() {
  let a = spawn work("slow", 30)
  let b = spawn work("fast", 5)
  print(await b)
  print(await a)
  let all = await task.all([work("x", 1), work("y", 1)])
  print(all)
}`;
  assert.equal(await out(src), "fast\nslow\n[\"x\", \"y\"]");
  const e = errors(`async fn f() -> Int { return 1 }\nfn main() { let x = await f() }`);
  assert.equal(e[0].code, "E0332");
});

test("syntax errors are explained", () => {
  const e = errors(`fn main() {\n let x = (1 + \n}`);
  assert.equal(e.length, 1);
  assert.match(e[0].message, /expected an expression/);
  const e2 = errors(`fn main() { print("hi" }`);
  assert.match(e2[0].message, /expected `\)`/);
  assert.match(e2[0].why!, /never closed/);
});

test("unknown names suggest the closest match", () => {
  const e = errors(`fn main() { let count = 1\n print(cuont) }`);
  assert.equal(e[0].code, "E0352");
  assert.match(e[0].message, /cannot find `cuont` — did you mean `count`\?/); // the headline carries it (beginners read that first)
  assert.match(e[0].suggestion!, /change it to `count`/);
});

test("step limit stops infinite loops; output limit stops floods", async () => {
  const r = await exec(`fn main() { while true { } }`, { limits: { maxSteps: 100000 } });
  assert.equal(r.error!.kind, "limit");
  assert.equal(r.error!.limit, "steps");
  const o = await exec(`fn main() { while true { print("xxxxxxxxxx") } }`, { limits: { maxOutputBytes: 100 } });
  assert.equal(o.error!.limit, "output");
  const rec = await exec(`fn f(n: Int) -> Int { return f(n + 1) + 1 }\nfn main() { print(f(0)) }`);
  assert.match(rec.error!.message, /stack overflow/);
});

test("abort signal and wall-clock limit stop a run", async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 20);
  const r = await exec(`import std.task\nasync fn main() { await task.sleep(5000) }`, { signal: ac.signal });
  assert.equal(r.error!.kind, "abort");
  const t = await exec(`import std.task\nasync fn main() { await task.sleep(5000) }`, { limits: { maxMillis: 30 } });
  assert.equal(t.error!.limit, "time");
});
