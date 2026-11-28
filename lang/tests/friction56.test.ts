// Compiler-benchmark syntax friction cases, each fixed with a test that fails when reverted.
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { exec, errors, diags } from "./helpers";

test("friction #1: `var counts: [String: Int] = [:]` (Swift's map type and empty map) suggest {...}, not slicing", () => {
  let e = errors("var counts: [String: Int] = {}");
  assert.match(e[0].message, /`\[String: Int\]` is Swift's dictionary type — Mycel writes the map type with braces: `\{String: Int\}`/);
  e = errors("var counts: {String: Int} = [:]");
  assert.match(e[0].message, /`\[:\]` is Swift's empty dictionary/);
  assert.match(e[0].suggestion!, /`\{\}`/);
  assert.doesNotMatch(e[0].message, /slicing/);
});

test("friction #2: no diagnostic suggests the old ${...} interpolation (Char -> String fix-it)", () => {
  const e = errors('let c: Char = "a"[0]\nlet s: String = c');
  assert.doesNotMatch(e[0].suggestion!, /\$\{/);
  assert.match(e[0].suggestion!, /f"\{value\}"/);
  const all = [...diags('let c: Char = "a"[0]\nlet s: String = c'), ...diags("let a: Int = \"x\""), ...diags("let a = [1]\nprint(a.size)")];
  for (const d of all) assert.doesNotMatch(`${d.message} ${d.why ?? ""} ${d.suggestion ?? ""}`, /\$\{/);
});

test("friction #3: maps and lists name one obvious size, `length`, and hint the other spellings", () => {
  for (const m of ["count", "size", "len"]) {
    const e = errors(`let m = {"a": 1}\nprint(m.${m})`);
    assert.match(e[0].message + " " + e[0].suggestion, /length/, m);
  }
});

test("friction #4: the string-length safety limit says how to raise it", async () => {
  const r = await exec('var s = ""\nwhile true { s += "abcdefghij" }', { limits: { maxStringLength: 1000 } as any });
  assert.match(r.error!.message, /string length limit of 1000 exceeded \(raise it with --max-string=<chars>\)/);
});
