import { test } from "node:test";
import * as assert from "node:assert/strict";
import { out, errors } from "./helpers";
import { migrateSource } from "../src/migrate";

const prog = (body: string) => `fn main() {\n${body}\n}`;
const P = async (body: string) => out(prog(body));

test("f-string: expressions, escapes, nested quotes, multi-line", async () => {
  assert.equal(await P(`let name = "Ann"\nprint(f"Hello {name}! {1 + 2} {{literal}}")`), "Hello Ann! 3 {literal}");
  assert.equal(await P(`let m = {"a": 1}\nprint(f"v={m["a"]} {f"in{1}ner"}")`), "v=1 in1ner");
  assert.equal(await P(`let x = 4\nprint(f"""\n  a {x}\n  b\n  """)`), "a 4\nb");
  assert.equal(await P(`let x = 5\nprint(f"{"big" if x > 3 else "small"}")`), "big");
});

test("f-string: format specs like Python", async () => {
  assert.equal(await P(`print(f"{3.14159:.2f}|{42:>6}|{42:<6}|{42:^6}|{42:06d}|{1234567:,}|{255:x}|{255:#b}|{0.256:.1%}|{"ab":*^6}|{7:+d}")`),
    "3.14|    42|42    |  42  |000042|1,234,567|ff|0b11111111|25.6%|**ab**|+7");
  assert.equal(await P(`let t = true\nprint(f"{(1 if t else 2):3}")`), "  1");
});

test("f-string: debug form {x=}", async () => {
  assert.equal(await P(`let x = 5\nlet s = "hi"\nprint(f"{x=} {s=} {x + 1=}")`), `x=5 s="hi" x + 1=6`);
});

test("f-string is typed: every expression is checked", () => {
  const e = errors(prog(`print(f"{nope}")`));
  assert.ok(e.some((d) => /nope/.test(d.message)), JSON.stringify(e));
  assert.ok(errors(prog(`let x = "a"\nprint(f"{x:.2f}")`)).length === 0); // spec errors are runtime panics with the spec named
});

test("a bad format spec panics naming the spec", async () => {
  await assert.rejects(P(`print(f"{1:zz}")`), /bad format spec `zz`/);
  await assert.rejects(P(`print(f"{"s":d}")`), /needs a number/);
});

test("plain strings no longer interpolate: `${x}` is a compile error with a fix-it", () => {
  const e = errors(prog(`let x = 1\nprint("a ${"$"}{x}")`.replace('${"$"}', "$")));
  assert.equal(e.length, 1);
  assert.match(e[0].message, /old interpolation syntax/);
  assert.match(e[0].suggestion ?? "", /f"\.\.\.\{x\}\.\.\."/);
});

test("plain strings keep braces literally", async () => {
  assert.equal(await P(`print("{x} {{y}} }")`), "{x} {{y}} }");
});

test("a lone } in an f-string is an error", () => {
  assert.ok(errors(prog(`print(f"a } b")`)).some((d) => /lone `}`/.test(d.message)));
  assert.ok(errors(prog(`print(f"a {1")`)).length > 0);
});

test("migrate rewrites old syntax and escapes literal braces; migrated code runs", async () => {
  const old = 'fn main() {\n  let x = 2\n  print("a ${x + 1} {b} ${"q" + "${x}"} // not a comment")\n}\n';
  const mig = migrateSource(old);
  assert.equal(mig, 'fn main() {\n  let x = 2\n  print(f"a {x + 1} {{b}} {"q" + f"{x}"} // not a comment")\n}\n');
  assert.equal(await out(mig), "a 3 {b} q2 // not a comment");
  assert.equal(migrateSource(mig), mig); // idempotent
  assert.equal(migrateSource('let a = "no interp" // "${x}" in a comment\n'), 'let a = "no interp" // "${x}" in a comment\n');
  assert.equal(migrateSource('print("${true ? 1 : 2}")'), 'print(f"{(true ? 1 : 2)}")');
});
