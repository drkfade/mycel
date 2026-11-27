// Item 2 (WO111): Python vs Mycel on 25 beginner programs. Runs both, compares output, counts lines/tokens, and
// applies the SAME typo to both (typos.json) to capture the first error message a beginner sees.
// usage: node compare/measure.mjs [--md]     (needs python3 on PATH; Mycel from ../bin/mycel)
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
const here = path.dirname(new URL(import.meta.url).pathname);
const mycel = path.join(here, "..", "bin", "mycel");
const typos = JSON.parse(fs.readFileSync(path.join(here, "typos.json"), "utf8"));
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: "utf8" }); return (r.stdout + r.stderr).trimEnd(); };
// Same meaning, each language's own spelling of it: Python True/None and 'quotes' vs Mycel true/nil and "quotes".
const norm = (s) => s.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "nil").replace(/'([^']*)'/g, '"$1"').replace(/": /g, '":');
const tokens = (src) => (src.replace(/#.*|\/\/.*/g, "").match(/f"(?:[^"\\]|\\.)*"|"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_]\w*|\d+(?:\.\d+)?|\*\*|==|!=|<=|>=|=>|->|\.\.=?|[^\s\w]/g) ?? []).length;
const lines = (src) => src.split("\n").filter((l) => l.trim() && !/^\s*(#|\/\/)/.test(l)).length;
const firstError = (out) => { const l = out.split("\n").filter(Boolean); const e = l.find((x) => /^(error|panic)|Error:/.test(x)); return (e ?? l[l.length - 1] ?? "").trim(); };
// Python prints a traceback; the exception line it ends with is what the beginner reads.
const lastPyError = (out) => [...out.split("\n")].reverse().find((x) => /^\w+(Error|Exception)\b/.test(x))?.trim() ?? out.split("\n").pop();
const rows = [];
for (const f of fs.readdirSync(here).filter((x) => x.endsWith(".py")).sort()) {
  const b = f.slice(0, -3), py = fs.readFileSync(path.join(here, f), "utf8"), my = fs.readFileSync(path.join(here, b + ".myc"), "utf8");
  const pyOut = run("python3", [f, "a", "b"], here), myOut = run(mycel, ["run", b + ".myc", "--", "a", "b"], here);
  const ty = typos[b]; const [pf, pt] = Array.isArray(ty) ? ty : ty.py; const [mf, mt] = Array.isArray(ty) ? ty : ty.myc;
  if (!py.includes(pf) || !my.includes(mf)) throw new Error(`${b}: typo spot not found (py ${py.includes(pf)}, myc ${my.includes(mf)})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-cmp-"));
  fs.writeFileSync(path.join(tmp, f), py.replace(pf, pt));
  fs.writeFileSync(path.join(tmp, b + ".myc"), my.replace(mf, mt));
  const pyErr = lastPyError(run("python3", [f], tmp)), myErr = firstError(run(mycel, ["run", b + ".myc"], tmp));
  rows.push({ prog: b, same: norm(pyOut) === norm(myOut), pyOut, myOut, pyLines: lines(py), myLines: lines(my), pyTok: tokens(py), myTok: tokens(my), pyErr, myErr });
}
if (process.argv.includes("--md")) {
  const t = (a, b) => a.reduce((s, r) => s + r[b], 0);
  console.log(`| program | same output | lines py / myc | tokens py / myc | first error (same typo) — Python | — Mycel |\n|---|---|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.prog} | ${r.same ? "yes" : "**no**"} | ${r.pyLines} / ${r.myLines} | ${r.pyTok} / ${r.myTok} | ${r.pyErr.replace(/\|/g, "\\|")} | ${r.myErr.replace(/\|/g, "\\|")} |`);
  console.log(`| **total** | ${rows.filter((r) => r.same).length}/${rows.length} | ${t(rows, "pyLines")} / ${t(rows, "myLines")} | ${t(rows, "pyTok")} / ${t(rows, "myTok")} | | |`);
} else console.log(JSON.stringify(rows, null, 1));
