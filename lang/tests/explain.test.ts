// `mycel explain` (task 52, from Rust): the catalog covers every code the compiler can emit, and every example is
// true — `bad` produces exactly that code and `good` compiles without errors (or, for a warning, without that warning).
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { EXPLANATIONS, explain, explainUnknown, normalizeCode, explainHint } from "../src/explain";
import { diags } from "./helpers";
import { spawnCli } from "./helpers";

const SRC = path.resolve(__dirname, "..", "..", "src");

function emittedCodes(): Set<string> {
  const codes = new Set<string>();
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".ts") && x !== "explain.ts" && x !== "assist.ts")) {
    for (const m of fs.readFileSync(path.join(SRC, f), "utf8").matchAll(/"([EW]\d{4})"/g)) codes.add(m[1]);
  }
  return codes;
}

test("explain: every code the compiler emits has an explanation, and every explanation is a real code", () => {
  const emitted = emittedCodes();
  assert.ok(emitted.size > 100, `scan found only ${emitted.size} codes`);
  const missing = [...emitted].filter((c) => !EXPLANATIONS[c]).sort();
  assert.deepEqual(missing, [], `codes without an explanation: ${missing.join(" ")}`);
  const stale = Object.keys(EXPLANATIONS).filter((c) => !emitted.has(c)).sort();
  assert.deepEqual(stale, [], `explanations for codes nothing emits: ${stale.join(" ")}`);
});

for (const [code, x] of Object.entries(EXPLANATIONS)) {
  if (!x.bad) continue;
  test(`explain ${code}: the wrong example gets ${code} and the fixed one does not`, () => {
    const bad = diags(x.bad!);
    assert.ok(bad.some((d) => d.code === code), `bad example of ${code} gave: ${JSON.stringify(bad.map((d) => `${d.code} ${d.message}`))}`);
    const good = diags(x.good!);
    const wrong = good.filter((d) => d.severity === "error" || d.code === code);
    assert.deepEqual(wrong.map((d) => `${d.code} ${d.message}`), [], `fixed example of ${code} still fails`);
  });
}

test("explain: code spellings, unknown codes and the hint line", () => {
  assert.equal(normalizeCode("e300"), "E0300");
  assert.equal(normalizeCode("300"), "E0300");
  assert.equal(normalizeCode("w101"), "W0101");
  assert.match(explain("E0460")!, /^E0460: the match does not cover every case/);
  assert.match(explain("E0460")!, /This program gets E0460:\n\n {4}enum Light/);
  assert.equal(explain("E9999"), undefined);
  assert.match(explainUnknown("E0461"), /did you mean `mycel explain E0460`\?/);
  assert.equal(explainHint(["E0300", "E0352"]), "help: `mycel explain E0300` explains the first error with an example");
});

test("explain: the CLI prints the explanation, lists codes, and check/run errors end with the hint", () => {
  const bin = path.resolve(__dirname, "..", "..", "bin", "mycel");
  const r = spawnCli(bin, ["explain", "e352"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^E0352: cannot find this name/);
  const all = spawnCli(bin, ["explain"], { encoding: "utf8" });
  assert.match(all.stdout, /E0001 {2}the text cannot be read/);
  const bad = spawnCli(bin, ["explain", "E0461"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /did you mean `mycel explain E0460`/);
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "mycel-explain-"));
  const f = path.join(dir, "t.myc");
  fs.writeFileSync(f, "let n: Int = \"5\"\nprint(n)\n");
  for (const cmd of ["check", "run"]) {
    const c = spawnCli(bin, [cmd, f], { encoding: "utf8" });
    assert.equal(c.status, 1);
    assert.match(c.stderr, /\n\nhelp: `mycel explain E0300` explains this error with an example\n?$/, `${cmd}: ${c.stderr}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
