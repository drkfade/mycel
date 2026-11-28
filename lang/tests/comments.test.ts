// Comments are `#`, `//` is floor division, `%` is floor mod.
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec, out, errors } from "./helpers";
import { migrateSource } from "../src/migrate";
import { format } from "../src/fmt";

test("# starts a comment; a # inside a string or f-string is text", async () => {
  assert.equal(await out('# hi\nprint(1) # trailing\nprint("a # b")\nprint(f"{1 + 1} # c")\n# last'), "1\na # b\n2 # c");
});

test("x = 10 // 3 prints 3 (and negative, Float and compound forms)", async () => {
  assert.equal(await out("x = 10 // 3; print(x)"), "3");
  assert.equal(await out("print(-7 // 2)"), "-4");
  assert.equal(await out("print(7.0 // 2)"), "3.0");
  assert.equal(await out("print(7 // 2.0, -7 // 2.0)"), "3.0 -4.0");
  assert.equal(await out("var x = 17\nx //= 5\nprint(x)\nvar f = 7.5\nf //= 2\nprint(f)"), "3\n3.0");
  assert.equal(await out("print(7 / 2, 7 // 2, 8 // 2)"), "3.5 3 4");
  assert.equal(await out("let xs = [10, 21]\nprint(xs.map(x => x // 4))"), "[2, 5]");
  assert.equal(await out("print(10 // 3 * 2 + 1)"), "7"); // same precedence as * and %
});

test("// by zero is a clear error", async () => {
  const r = await exec("let a = 0\nprint(5 // a)");
  assert.equal(r.error?.kind, "panic");
  assert.match(r.error!.message, /division by zero/);
  const f = await exec("let a = 0.0\nprint(5.0 // a)");
  assert.match(f.error!.message, /division by zero/);
});

test("% is Python's floor remainder: (a // b) * b + a % b == a", async () => {
  assert.equal(await out("print(-7 % 3, 7 % -3, -7 % -3, 7 % 3)"), "2 -2 -1 1");
  assert.equal(await out("print(-7.5 % 2, 7.5 % -2)"), "0.5 -0.5");
  const src = `
var bad = 0
for a in -9..=9 {
  for b in -4..=4 {
    if b != 0 and (a // b) * b + a % b != a { bad += 1 }
  }
}
print(bad)`;
  assert.equal(await out(src), "0");
});

test("old // comments get a friendly error that shows the fixed line", () => {
  let e = errors("// a note\nprint(1)");
  assert.equal(e.length, 1);
  assert.match(e[0].message, /comments start with # in Mycel/);
  assert.match(e[0].suggestion!, /`# a note`/);
  e = errors("print(1) // note");
  assert.match(e[0].message, /comments start with #/, "print(1) // note");
  assert.match(e[0].suggestion!, /`print\(1\) # note`/);
  e = errors("let a = 5 // the count\nprint(a)");
  assert.match(e[0].message, /comments start with #/);
  assert.match(e[0].suggestion!, /`let a = 5 # the count`/);
  e = errors("let a = 1 // don't panic");
  assert.match(e[0].message, /comments start with #/);
});

test("block comments are an error with a # fix-it", () => {
  const e = errors("/* hi */\nprint(1)");
  assert.match(e[0].message, /comments start with # in Mycel/);
  assert.match(e[0].message, /no \/\* \*\/ block comments/);
  assert.match(e[0].suggestion!, /`# hi`/);
  assert.match(errors("/* a\nb */\nprint(1)")[0].message, /comments start with #/);
});

test("the old #[...] set habit still gets its hint, while # [x] and #[x] on their own are comments", async () => {
  const e = errors("let s = #[1, 2]");
  assert.equal(e[0].code, "E0101");
  assert.match(e[0].suggestion!, /Set\(\[1, 2\]\)/);
  assert.equal(await out("# [x] a note\n#[1, 2] also a note\nprint(1) #[this is a note]"), "1");
});

test("fmt --fix (migrateSource) turns old comments into # and never touches // division or strings", () => {
  const old = 'fn main() {\n  // note\n  let a = 7 // 2\n  print(a) // shows 3\n  let s = "// not a comment"\n  /* block\n     two */\n  /// doc\n}\n';
  const mig = migrateSource(old);
  assert.equal(mig, 'fn main() {\n  # note\n  let a = 7 // 2\n  print(a) # shows 3\n  let s = "// not a comment"\n  # block\n  # two\n  ## doc\n}\n');
  assert.equal(migrateSource(mig), mig); // idempotent
  assert.equal(migrateSource("x //= 2\ny = 10 // 3\nprint(7 // 2)\n"), "x //= 2\ny = 10 // 3\nprint(7 // 2)\n");
});

test("fmt spaces // like the other operators and keeps # comments", () => {
  assert.equal(format("let a=7//2 # why\nprint(a)\n", "t.myc"), "let a = 7 // 2 # why\nprint(a)\n");
});

test("round trip: migrating every tour program changes nothing (already migrated) and formatting is stable", () => {
  const dir = path.resolve(__dirname, "..", "..", "examples", "tour");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".olx"))) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    assert.equal(migrateSource(t), t, f);
    assert.equal(format(format(t, f), f), format(t, f), f);
    assert.doesNotMatch(t, /^\s*\/\//m, `${f} still has a // comment line`);
  }
});
