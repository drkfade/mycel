// Closures are written in braces; `it` is the single argument.
// Disambiguation of `{` in an expression position:
//   * `{}` or a `key: value` colon directly inside the braces (a `:` after `?` is a ternary's) -> map literal;
//   * anything else (`{ it > 5 }`, `{ x => ... }`, `{ (a, b) => ... }`, a `let`/`return`/`if` first, or statements on
//     separate lines) -> closure.
//   * after a call, member or lower-case name, `{` with a space before it is a trailing closure; in an if/while/for/match
//     head it is only a closure when the body's own `{` follows its `}`.
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { exec, out, errors } from "./helpers";
import { format } from "../src/fmt";

test("brace closure inside call parentheses parses as a closure, not a map (nums.filter({ it > 5 }))", async () => {
  assert.equal(await out("let nums = [12, 3, 4]\nprint(nums.filter({ it > 5 }))"), "[12]");
  assert.equal(await out("let nums = [12, 3, 4]\nprint(nums.map { it * 2 })"), "[24, 6, 8]");
  assert.equal(await out("print([12, 3, 4].filter { it > 5 })"), "[12]");
  assert.equal(await out("print([1, 2].reduce(0, { (a, b) => a + b }))"), "3");
});

test("named and typed closure parameters; chains; nested closures (inner it shadows)", async () => {
  assert.equal(await out("print([1, 2].map { x => x + 1 })"), "[2, 3]");
  assert.equal(await out("print([1, 2].map { (x: Int) => x * 3 })"), "[3, 6]");
  assert.equal(await out("print([1, 2, 3, 4].filter { it > 1 }.map { it * 10 })"), "[20, 30, 40]");
  assert.equal(await out("print([[1, 2], [3]].map { it.map { it + 1 } })"), "[[2, 3], [4]]");
});

test("map literals stay maps: {}, key: value, ternary values, comprehensions", async () => {
  assert.equal(await out('let m = {"a": 1, "b": 2}\nprint(m)'), '{"a": 1, "b": 2}');
  assert.equal(await out('let e: {String: Int} = {}\nprint(e.length)'), "0");
  assert.equal(await out('let k = 3\nlet m = {"a": k > 1 ? 1 : 2}\nprint(m)'), '{"a": 1}');
  assert.equal(await out('let m = {\n  "a": 1,\n  "b": 2\n}\nprint(m.length)'), "2");
  assert.equal(await out('print({w: w.length for w in ["hi", "abc"]})'), '{"hi": 2, "abc": 3}');
  assert.equal(await out('fn f(m: {String: Int}) => m.length\nprint(f({"x": 1}))'), "1");
});

test("a closure with several statements: last expression is the result; a Void last line gives no result", async () => {
  assert.equal(await out("print([1, 2].map {\n  let y = it * 2\n  y + 1\n})"), "[3, 5]");
  assert.equal(await out("[1, 2].forEach {\n  let y = it + 1\n  print(y)\n}"), "2\n3");
  assert.equal(await out("var total = 0\n[1, 2, 3].forEach { total += it }\nprint(total)"), "6");
  assert.equal(await out("print([1, 2].map { return it * 5 })"), "[5, 10]");
});

test("if/while/for heads: { starts the body, unless a closure is followed by the body's own {", async () => {
  assert.equal(await out('let xs = [1, 20]\nif xs.any { it > 10 } {\n  print("big")\n}'), "big");
  assert.equal(await out('let ready = true\nif ready {\n  print("go")\n}'), "go");
  assert.equal(await out("let xs = [1, 2]\nvar n = 0\nwhile n < xs.length {\n  n += 1\n}\nprint(n)"), "2");
  assert.equal(await out("for x in [1, 2].map { it * 2 } {\n  print(x)\n}"), "2\n4");
  assert.equal(await out('print(match [1, 2].filter { it > 1 }.length {\n  1 => "one"\n  _ => "other"\n})'), "one");
  assert.equal(await out("let v = if [1].any { it == 1 } { 1 } else { 2 }\nprint(v)"), "1");
});

test("struct patterns and literals still use a { that touches the name", async () => {
  assert.equal(await out("struct P { let x: Int, y: Int }\nfn main() {\n  let p = P(x: 1, y: 2)\n  let P{x, y} = p\n  print(x + y)\n}"), "3");
});

test("it outside a one-argument closure is a clear error", async () => {
  const e = errors("print(it)");
  assert.match(e[0].message, /`it` can only be used inside a `\{ \.\.\. \}` closure that takes one argument/);
  assert.match(e[0].suggestion!, /\{ x => x \* 2 \}/);
});

test("fmt keeps closures: spaces before a trailing {, none after ( ", () => {
  assert.equal(format("let a = [1].map { it * 2 }\nlet b = [1].filter( { it > 0 } )\n", "t.myc"), "let a = [1].map { it * 2 }\nlet b = [1].filter({ it > 0 })\n");
});
