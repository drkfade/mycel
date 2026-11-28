// `text.extract(kind)` with the closed kind set Int, Float, Number, Word, Operator, Bool.
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { exec, out, errors, diags } from "./helpers";
import { extractPieces } from "../src/extract";

const lines = (xs: string[]) => () => xs.shift() ?? null;

test("input() then extract(Int), extract(Number, Operator), a filter closure, filter/map braces", async () => {
  const src = `sum = input("Enter your sum: ")
print(sum.extract(Int) == [12, 3, 4])
print(sum.extract(Int))
print(sum.extract(Number, Operator))
print(sum.extract(Int) { it > 5 } == [12])
nums = [12, 3, 4]
print(nums.filter { it > 5 })
print(nums.map { it * 2 })`;
  const r = await exec(src, { inputSync: lines(["12 + 3*4"]) });
  assert.equal(r.ok, true, r.error?.human);
  assert.equal(r.output, 'Enter your sum: true\n[12, 3, 4]\n[Number(12.0), Operator("+"), Number(3.0), Operator("*"), Number(4.0)]\ntrue\n[12]\n[24, 6, 8]\n');
});

test("results are typed: extract(Int) is [Int] (arithmetic works), Operator and Word are [String], Bool is [Bool]", async () => {
  assert.equal(await out('let xs: [Int] = "1 b 22".extract(Int)\nprint(xs.map { it + 1 })'), "[2, 23]");
  assert.equal(await out('let ws: [String] = "hi there".extract(Word)\nprint(ws.length)'), "2");
  assert.equal(await out('let bs: [Bool] = "yes no".extract(Bool)\nprint(bs)'), "[true, false]");
  assert.equal(await out('let fs: [Float] = "1.5 and 2".extract(Float)\nprint(fs)'), "[1.5]");
  assert.equal(await out('print("1.5 and 2".extract(Number))'), "[1.5, 2.0]");
  assert.ok(errors('let xs: [String] = "a1".extract(Int)').length > 0, "extract(Int) is not [String]");
});

test("Piece values match: the calculator tokenizer in one line", async () => {
  const src = `let tokens = "12 + 3*4".extract(Number, Operator)
var total = 0.0
var op = "+"
for t in tokens {
  match t {
    .Number(n) => { total = op == "+" ? total + n : total * n }
    .Operator(o) => { op = o }
    _ => {}
  }
}
print(total)`;
  assert.equal(await out(src), "60.0"); // left to right, no precedence: (12 + 3) * 4
});

test("Word: edge punctuation is stripped, inner @ . - ' are kept; the filter uses `in` and `and`", async () => {
  assert.equal(await out('print("Hi, a@b.com! it\'s well-known (really).".extract(Word))'), '["Hi", "a@b.com", "it\'s", "well-known", "really"]');
  assert.equal(await out('print("mail a@b.com or c@d.org or x".extract(Word) { "@" in it and ".com" in it })'), '["a@b.com"]');
  assert.equal(await out('print("mail a@b.com or c@d.org".extract(Word, where: { "@" in it }))'), '["a@b.com", "c@d.org"]');
});

test("extractPieces: signs, decimals, glued letters, operators and brackets", () => {
  const v = (s: string, k: any[]) => extractPieces(s, k).map((p) => p.value);
  assert.deepEqual(v("12 + 3*4", ["Int"]), [12n, 3n, 4n]);
  assert.deepEqual(v("12 - 3", ["Int"]), [12n, 3n]);            // a minus after a value is subtraction
  assert.deepEqual(v("5 -3", ["Int"]), [5n, 3n]);
  assert.deepEqual(v("(-3) 2 * -4, -5", ["Int"]), [-3n, 2n, -4n, -5n]);
  assert.deepEqual(v("3.5 and 4", ["Int"]), [4n]);               // 3.5 is a Float, not an Int
  assert.deepEqual(v("3.5 and 4", ["Float"]), [3.5]);
  assert.deepEqual(v("3.5 and 4", ["Number"]), [3.5, 4]);
  assert.deepEqual(v("abc123 v2 7", ["Int"]), [7n]);             // numbers glued to letters are not numbers
  assert.deepEqual(v("I have 3.", ["Int"]), [3n]);
  assert.deepEqual(v("2**3 // 4 <= 5 && x", ["Operator"]), ["**", "//", "<=", "&&"]);
  assert.deepEqual(v("(1+2)*3", ["Number", "Operator"]), ["(", 1, "+", 2, ")", "*", 3]);
  assert.deepEqual(v("TRUE yes No false maybe", ["Bool"]), [true, true, false, false]);
  assert.deepEqual(v("", ["Int", "Word"]), []);
});

test("typos get did-you-mean; only the six kinds exist; a filter needs one kind", () => {
  let e = errors('let a = "x".extract(Integer)');
  assert.match(e[0].message, /`Integer` is not something `extract` can pull out of text/);
  e = errors('let a = "x".extract(Wrod)');
  assert.match(e[0].message, /did you mean `Word`\?/);
  for (const k of ["Email", "Url", "Date", "Line", "Letter", "Digit"]) assert.ok(errors(`let a = "x".extract(${k})`).length > 0, k);
  assert.match(errors('let a = "x".extract(Int, Word) { it > 1 }')[0].message, /a filter works with one kind/);
  assert.match(errors("let a = 5.extract(Int)")[0].message, /pulls pieces out of text/);
});

test("habits: a digit/word regex points at extract; has / contains_all point at `in`", () => {
  const w = diags('import re\nprint(re.findAll("\\\\d+", "a1"))').filter((d) => d.severity === "warning");
  assert.match(w[0].suggestion!, /extract\(Int\)/);
  assert.match(diags('import re\nprint(re.findAll("\\\\w+", "a b"))')[0].suggestion!, /extract\(Word\)/);
  assert.match(diags('import re\nprint(re.findAll("-?\\\\d+(\\\\.\\\\d+)?", "a1"))')[0].suggestion!, /extract\(Number\)/);
  assert.equal(diags('import re\nprint(re.findAll("[a-z]+@x", "a1"))').length, 0);
  for (const m of ['w.has("@")', 'w.contains_all(["@", ".com"])', 'w.containsAny(["a"])']) {
    const e = errors(`let w = "a@b.com"\nprint(${m})`);
    assert.match(e[0].suggestion!, /"@" in w.*`a in w and b in w`/, m);
  }
});

test("it works inside functions and with a Piece list result passed around", async () => {
  assert.equal(await out('fn digits(s: String) -> [Int] => s.extract(Int)\nprint(digits("1 22 333").length)'), "3");
  assert.equal(await out('fn toks(s: String) -> [Piece] => s.extract(Word, Number)\nprint(toks("a 1").length)'), "2");
});
