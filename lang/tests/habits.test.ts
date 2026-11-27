import { test } from "node:test";
import * as assert from "node:assert/strict";
import { HABITS, LANGS } from "../src/habits";
import { check } from "../src/host";

const errs = (source: string) => check({ source, file: "habit.myc" }).diagnostics.filter((d) => d.severity === "error");

test("habit table: every one of the 7 languages has at least 15 habits", () => {
  for (const l of LANGS) assert.ok(HABITS.filter((h) => h.lang === l).length >= 15, `${l} has ${HABITS.filter((h) => h.lang === l).length}`);
});

for (const h of HABITS) {
  test(`habit ${h.lang}: ${h.habit} is ${h.ok ? "accepted" : "an error with a fix-it"}`, () => {
    const e = errs(h.probe);
    if (h.ok) assert.deepEqual(e.map((d) => d.message), [], `probe should compile:\n${h.probe}`);
    else {
      assert.ok(e.length > 0, `probe should fail:\n${h.probe}`);
      assert.match(e[0].message, /Mycel/, `the first error should be the fix-it naming Mycel's spelling, got: ${e[0].message}\nprobe:\n${h.probe}`);
    }
  });
}
