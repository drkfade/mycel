// Task 55: `mycel translate` — Python → Mycel. Every program is run by python3 and, translated, by Mycel; the
// outputs must be identical. Corpus: the 40 ai/translate_tasks.mjs pairs, the 25 compare/*.py, and two held-out
// batches written for this task (translate_heldout: tuned on; translate_heldout_b: measured before any fix for it).
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { translatePython } from "../src/translate";
import { run } from "../src/host";
import { readForeign } from "../src/foreign";

const LANG = path.resolve(__dirname, "..", "..");
const python = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-translate-"));

interface Case { id: string; py: string; args?: string[] }
async function corpus(): Promise<Record<string, Case[]>> {
  const { TRANSLATE_PAIRS } = await import(path.join(LANG, "ai", "translate_tasks.mjs"));
  const dir = (d: string, args?: (f: string) => string[] | undefined) => fs.readdirSync(path.join(LANG, d)).filter((f) => f.endsWith(".py")).sort().map((f) => ({ id: `${d}/${f}`, py: fs.readFileSync(path.join(LANG, d, f), "utf8"), args: args?.(f) }));
  return {
    pairs: TRANSLATE_PAIRS.map((p: { py: string }, i: number) => ({ id: `pair ${i + 1}`, py: p.py })),
    compare: dir("compare", (f) => (f.startsWith("25") ? ["a", "b"] : undefined)),
    heldoutA: dir("tests/translate_heldout"),
    heldoutB: dir("tests/translate_heldout_b"),
  };
}
async function check(c: Case): Promise<string | undefined> {
  const pf = path.join(tmp, c.id.replace(/[^\w.]+/g, "_") + (c.id.endsWith(".py") ? "" : ".py"));
  fs.writeFileSync(pf, c.py);
  const want = spawnSync("python3", [pf, ...(c.args ?? [])], { encoding: "utf8" }).stdout;
  let t;
  try { t = translatePython(pf); } catch (e) { return `translate threw: ${(e as Error).message}`; }
  if (t.todos.length) return `TODO: ${t.todos.map((x) => `line ${x.line} ${x.why}`).join("; ")}`;
  const r = await run({ source: t.code, file: pf.replace(/\.py$/, ".myc"), args: c.args, foreign: readForeign(tmp, true), capabilities: { packages: { python: true } } });
  if (!r.ok) return `${r.error?.human ?? ""}`.split("\n").filter((l) => !/warning \[W0202\]|^\s*-->|\|\s*$|import std\.|fix: write/.test(l)).slice(0, 6).join(" | ") + `\n--- translated:\n${t.code}`;
  if (r.output !== want) return `output differs\n--- python:\n${want}--- mycel:\n${r.output}--- translated:\n${t.code}`;
  return undefined;
}
async function rate(cases: Case[]) {
  const fails: string[] = [];
  for (const c of cases) { const why = await check(c); if (why) fails.push(`${c.id}: ${why}`); }
  return { pass: cases.length - fails.length, total: cases.length, fails };
}

test("translate: every dataset pair and compare program prints what Python prints", { skip: python ? false : "python3 not available" }, async () => {
  const c = await corpus();
  for (const k of ["pairs", "compare"] as const) {
    const r = await rate(c[k]);
    console.log(`translate ${k}: ${r.pass}/${r.total}`);
    assert.deepEqual(r.fails, [], r.fails.join("\n\n"));
  }
});

test("translate: held-out programs (batch B measured before tuning: 13/15; b10 mixes Int and Float branches)", { skip: python ? false : "python3 not available" }, async () => {
  const c = await corpus();
  const a = await rate(c.heldoutA), b = await rate(c.heldoutB);
  console.log(`translate held-out A: ${a.pass}/${a.total}, B: ${b.pass}/${b.total}`);
  assert.deepEqual(a.fails, [], a.fails.join("\n\n"));
  assert.ok(b.pass >= 14, b.fails.join("\n\n"));
  // the one known gap fails loudly at compile time, never by printing something else
  for (const f of b.fails) assert.match(f, /b10_stats\.py: .*the two branches have different types/, f);
});

test("translate: what cannot be translated is a TODO comment with its line, and the CLI exits 3", { skip: python ? false : "python3 not available" }, () => {
  const pf = path.join(tmp, "todo.py");
  fs.writeFileSync(pf, `print("start")\nwith lock():\n    data = 1\n@decorator\ndef g():\n    pass\nx = 1\nprint(x)\n`);
  const t = translatePython(pf);
  assert.deepEqual(t.todos.map((x) => x.line), [2, 4]);
  assert.match(t.code, /# TODO\(translate\) line 2: `with` blocks are not translated .*: with lock\(\): ⏎ data = 1/);
  assert.match(t.code, /# TODO\(translate\) line 4: decorators are not translated/);
  assert.match(t.code, /# 2 line\(s\) could not be translated: search for TODO\(translate\)\./);
  assert.match(t.code, /print\("start"\)[\s\S]*x = 1\nprint\(x\)/); // the rest is still translated
  const cli = spawnSync(process.execPath, [path.join(LANG, "dist", "src", "cli.js"), "translate", pf], { encoding: "utf8" });
  assert.equal(cli.status, 3, cli.stderr);
  assert.match(cli.stderr, /todo\.py:2: not translated — `with` blocks/);
  // a Python syntax error is reported with its position, not translated
  fs.writeFileSync(pf, "def f(:\n  pass\n");
  assert.throws(() => translatePython(pf), /todo\.py:1:7: Python syntax error/);
});

test("translate: preserves comments, translates dataclasses/enums/generators/with-open cleanly", { skip: python ? false : "python3 not available" }, async () => {
  const pf = path.join(tmp, "rich.py");
  fs.writeFileSync(pf, `# top comment\nfrom dataclasses import dataclass\n\n@dataclass\nclass Item:\n    name: str\n    qty: int = 1\n\ndef gen_nums(n):\n    # inside generator\n    for i in range(n):\n        yield i * 2\n\nit = Item("pen", 3) # inline note\nprint(it.name, it.qty, list(gen_nums(3)))\n`);
  const t = translatePython(pf);
  assert.equal(t.todos.length, 0);
  assert.match(t.code, /^# top comment$/m);
  assert.match(t.code, /# inside generator/);
  assert.match(t.code, /# inline note/);
  assert.match(t.code, /gen fn gen_nums/);
  const r = await run({ source: t.code, file: pf.replace(/\.py$/, ".myc"), foreign: readForeign(tmp, true) });
  assert.ok(r.ok, r.error?.human);
  assert.equal(r.output, "pen 3 [0, 2, 4]\n");
});

test("translate: imports of Python packages become `import x --python` with the bridge note", { skip: python ? false : "python3 not available" }, () => {
  const pf = path.join(tmp, "pkgs.py");
  fs.writeFileSync(pf, `import requests\nfrom bs4 import BeautifulSoup as Soup\nimport math\nprint(math.sqrt(16))\n`);
  const t = translatePython(pf);
  assert.match(t.code, /^import requests --python$/m);
  assert.match(t.code, /^from bs4 import BeautifulSoup as Soup --python$/m);
  assert.match(t.code, /^import std\.math$/m);
  assert.match(t.code, /run with --allow-pkg=requests,bs4/);
  assert.match(t.code, /print\(\(16\)\.toFloat\(\)\.sqrt\(\)\)|print\(16\.toFloat\(\)\.sqrt\(\)\)/);
});

test("std.pycompat: Python's printing and arithmetic", async () => {
  const r = await run({ source: `import std.pycompat as py\nprint(py.str([1, "a", true, nil, 2.0, (1, "b"), {"k": [1.5]}]), py.floordiv(-7, 2), py.mod(-7, 3), py.round(2.5), py.round(3.5), py.slice([1, 2, 3], 5, nil), py.slice("hello", -3, nil))\ntry { py.int("x7") } catch e: py.ValueError { print(e.message) }\nprint(py.maxBy(["i", "s"], k => 4), py.sortedBy([("b", 1), ("a", 1)], p => (p.1, p.0)))\n`, file: "t.myc" });
  assert.equal(r.output, `[1, 'a', True, None, 2.0, (1, 'b'), {'k': [1.5]}] -4 2 2 4 [] llo\ninvalid literal for int() with base 10: 'x7'\ni [("a", 1), ("b", 1)]\n`, r.error?.human);
});
