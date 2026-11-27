import { test } from "node:test";
import * as assert from "node:assert/strict";
import { check, run } from "../src/host";

test("fuzz found #1: char literal with invalid unicode escape emits diagnostic instead of crashing", () => {
  // Test code point exceeding 0x10ffff
  const r1 = check({ source: "let c = '\\u{999999999}'" });
  assert.equal(r1.ok, false);
  assert.equal(r1.diagnostics[0]?.code, "E0001");
  assert.match(r1.diagnostics[0]?.message ?? "", /invalid unicode escape/);

  // Test invalid hex characters
  const r2 = check({ source: "let c = '\\u{gggg}'" });
  assert.equal(r2.ok, false);
  assert.equal(r2.diagnostics[0]?.code, "E0001");

  // Test unterminated escape
  const r3 = check({ source: "let c = '\\u{'" });
  assert.equal(r3.ok, false);
  assert.equal(r3.diagnostics[0]?.code, "E0001");
});

test("fuzz found #2: String.padLeft and padRight with unicode surrogates count code points and do not corrupt data", async () => {
  const src = `
let s1 = "👋".padLeft(3)
let s2 = "a".padLeft(3, "👋")
let s3 = "a".padRight(3, "👋")
print(s1.length, s2.length, s3.length, s2, s3)
`;
  const r = await run({ source: src });
  assert.equal(r.ok, true, r.error?.human);
  assert.equal(r.output, "3 3 3 👋👋a a👋👋\n");
});

test("fuzz found #3: Range.sum overflows 64-bit int with panic", async () => {
  const src = `
let r = 9223372036854775806..=9223372036854775807
print(r.sum())
`;
  const r = await run({ source: src });
  assert.equal(r.ok, false);
  assert.equal(r.error?.kind, "panic");
  assert.match(r.error?.message ?? "", /integer overflow/);
});

test("fuzz found #4: minimum 64-bit integer literal -9223372036854775808 (I64_MIN) compiles and evaluates", async () => {
  const src = `
let x = -9223372036854775808
print(x)
`;
  const r = await run({ source: src });
  assert.equal(r.ok, true, r.error?.human);
  assert.equal(r.output, "-9223372036854775808\n");
});

test("fuzz found #5: open-ended range at statement level and end of line parses correctly", async () => {
  const src = `
let r = 10..
print(r.lo)
`;
  const r = await run({ source: src });
  assert.equal(r.ok, true, r.error?.human);
  assert.equal(r.output, "10\n");
});

test("fuzz found #6: function with inferred return type falling through emits E0252", () => {
  const src = `
fn fact(n) {
  if n <= 1 { return 1 }
  n * fact(n - 1)
}
print(fact(20))
`;
  const r = check({ source: src });
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics[0]?.code, "E0252");
  assert.match(r.diagnostics[0]?.message ?? "", /returns a value on some paths but not all/);
});

test("fuzz found #7: calling unimplemented extern fn panics with clean message instead of TypeError crash", async () => {
  const src = `
class Dog {
  extern fn speak()
}
let d = Dog()
d.speak()
`;
  const r = await run({ source: src });
  assert.equal(r.ok, false);
  assert.equal(r.error?.kind, "panic");
  assert.match(r.error?.message ?? "", /native 'main\.Dog\.speak' is not implemented/);
});

