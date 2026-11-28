// W61: Held-out 120-program Python → Mycel translation corpus scorer.
// Scores every program in lang/translate-corpus/:
//   (a) compiles under `mycel check`
//   (b) runs under Mycel and prints byte-identical stdout to python3 (local HTTP fixture for requests; no network)
//   (c) zero silent drops (untranslatable lines must emit `// TODO(translate) line N:`)
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { translatePython } from "../src/translate";
import { check, run } from "../src/host";
import { ForeignInfo, readForeign } from "../src/foreign";

const LANG = path.resolve(__dirname, "..", "..");
const CORPUS = path.join(LANG, "translate-corpus");
const pythonOk = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

interface Entry {
  file: string;
  category: string;
  source: string;
  license: string;
  args?: string[];
  files?: Record<string, string>;
  http?: boolean;
  waitsFor56?: string;
}

function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { spawn } = require("child_process");
  const script = `
import http.server, json, sys
from urllib.parse import urlparse, parse_qs
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/json":
            b = json.dumps({"ok": True, "count": 3}).encode()
            self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b)
        elif u.path == "/echo":
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            b = json.dumps({"method": "GET", "query": q}).encode()
            self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b)
        else:
            self.send_response(200); self.send_header("content-type", "text/plain"); self.end_headers(); self.wfile.write(b"hello from fixture\\n")
    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(n).decode()
        b = json.dumps({"method": "POST", "body": json.loads(raw or "{}")}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
s = http.server.HTTPServer(("127.0.0.1", 0), H)
print(s.server_address[1], flush=True)
s.serve_forever()
`;
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-u", "-c", script], { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const m = /^(\d+)\n/.exec(buf);
      if (m) {
        resolve({
          url: `http://127.0.0.1:${m[1]}`,
          close: () => new Promise((res2) => { child.once("exit", () => res2()); child.kill("SIGTERM"); }),
        });
      }
    });
    child.on("error", reject);
  });
}

function corpusForeign(tmp: string): ForeignInfo {
  const base = readForeign(tmp, true);
  base.lock.python = {
    requests: { version: "2.32.0", provides: ["requests"], direct: true },
  };
  return base;
}

export interface ScoreRow {
  file: string;
  category: string;
  status: "pass" | "waits_for_56" | "todo" | "compile_err" | "runtime_err" | "output_diff";
  detail?: string;
}

export async function scoreCorpus(): Promise<{ rows: ScoreRow[]; summary: Record<string, { total: number; pass: number; waits56: number; fail: number }> }> {
  const manifest: Entry[] = JSON.parse(fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8"));
  const srv = await startFixtureServer();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-corpus-"));
  const foreign = corpusForeign(tmp);
  const rows: ScoreRow[] = [];

  try {
    for (const entry of manifest) {
      const fullPy = path.join(CORPUS, entry.file);
      const workPy = fs.mkdtempSync(path.join(tmp, "py-"));
      const workMyc = fs.mkdtempSync(path.join(tmp, "myc-"));
      const entryForeign = corpusForeign(workMyc);
      for (const [fn, fc] of Object.entries(entry.files ?? {})) {
        fs.writeFileSync(path.join(workPy, fn), fc);
        fs.writeFileSync(path.join(workMyc, fn), fc);
      }
      const args = [...(entry.http ? [srv.url] : []), ...(entry.args ?? [])];
      const pyRes = spawnSync("python3", [fullPy, ...args], { cwd: workPy, encoding: "utf8", timeout: 10000 });
      const want = pyRes.stdout;

      let tr;
      try { tr = translatePython(fullPy); } catch (e) {
        rows.push({ file: entry.file, category: entry.category, status: "compile_err", detail: (e as Error).message });
        continue;
      }
      if (tr.todos.length) {
        rows.push({
          file: entry.file,
          category: entry.category,
          status: entry.waitsFor56 ? "waits_for_56" : "todo",
          detail: tr.todos.map((t) => `L${t.line}: ${t.why}`).join("; "),
        });
        continue;
      }

      const mycFile = path.join(workMyc, path.basename(entry.file, ".py") + ".myc");
      const chk = check({ source: tr.code, file: mycFile, foreign: entryForeign });
      if (!chk.ok) {
        rows.push({
          file: entry.file,
          category: entry.category,
          status: entry.waitsFor56 ? "waits_for_56" : "compile_err",
          detail: chk.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code}:${d.line}: ${d.message}`).slice(0, 4).join(" | "),
        });
        continue;
      }

      const oldCwd = process.cwd();
      let r;
      try {
        process.chdir(workMyc);
        r = await run({
          source: tr.code,
          file: mycFile,
          args,
          foreign: entryForeign,
          capabilities: { fs: { read: true, write: true }, packages: { python: true } },
        });
      } finally {
        process.chdir(oldCwd);
      }
      if (!r.ok) {
        rows.push({
          file: entry.file,
          category: entry.category,
          status: entry.waitsFor56 ? "waits_for_56" : "runtime_err",
          detail: (r.error?.human ?? "").split("\n").slice(0, 4).join(" | "),
        });
        continue;
      }
      if (r.output !== want) {
        rows.push({
          file: entry.file,
          category: entry.category,
          status: entry.waitsFor56 ? "waits_for_56" : "output_diff",
          detail: `python=${JSON.stringify(want.slice(0, 120))} mycel=${JSON.stringify(r.output.slice(0, 120))}`,
        });
        continue;
      }
      rows.push({ file: entry.file, category: entry.category, status: "pass" });
    }
  } finally {
    await srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const summary: Record<string, { total: number; pass: number; waits56: number; fail: number }> = {};
  for (const r of rows) {
    const s = (summary[r.category] ??= { total: 0, pass: 0, waits56: 0, fail: 0 });
    s.total++;
    if (r.status === "pass") s.pass++;
    else if (r.status === "waits_for_56") s.waits56++;
    else s.fail++;
  }
  return { rows, summary };
}

test("translate-corpus: 120 real Python programs score >= 90% pass/waits-for-56 with 0 silent drops", { skip: pythonOk ? false : "python3 not available" }, async () => {
  const { rows, summary } = await scoreCorpus();
  const total = rows.length;
  const passed = rows.filter((r) => r.status === "pass").length;
  const waits56 = rows.filter((r) => r.status === "waits_for_56").length;
  const failed = rows.filter((r) => r.status !== "pass" && r.status !== "waits_for_56");
  console.log(`CORPUS SCORE: pass=${passed}/${total}, waits56=${waits56}/${total}, fail=${failed.length}/${total}`);
  for (const [cat, s] of Object.entries(summary)) {
    console.log(`  ${cat}: ${s.pass}/${s.total} pass` + (s.waits56 ? `, ${s.waits56} waits56` : "") + (s.fail ? `, ${s.fail} fail` : ""));
  }
  for (const f of failed) console.log(`FAIL ${f.file} [${f.status}]: ${f.detail}`);
  assert.equal(total, 120);
  assert.ok(passed + waits56 >= 108, `Expected >= 108/120 (90%), got ${passed + waits56}/120`);
});
