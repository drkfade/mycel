import { spawnCli } from "./helpers";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

// WO111 item 2: each compare/NN.myc prints what its Python twin prints (Python's True/None/'q' spelled the Mycel way).
// Python is only needed to produce the expected text; without python3 the test is skipped, not passed.
const dir = path.resolve(__dirname, "..", "..", "compare");
const mycel = path.resolve(__dirname, "..", "..", "bin", "mycel");
const hasPy = spawnSync("python3", ["-c", "print(1)"], { encoding: "utf8" }).stdout === "1\n";
const norm = (s: string) => s.replace(/\r\n/g, "\n").replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "nil").replace(/'([^']*)'/g, '"$1"').replace(/": /g, '":');
const KNOWN_DIFF: Record<string, string> = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".myc")).sort()) {
  const b = f.slice(0, -4);
  test(`compare ${b}: Mycel prints what Python prints`, { skip: hasPy ? false : "python3 not available" }, () => {
    const py = spawnSync("python3", [b + ".py", "a", "b"], { cwd: dir, encoding: "utf8" });
    const my = spawnCli(mycel, ["run", f, "--", "a", "b"], { cwd: dir, encoding: "utf8" });
    assert.equal(my.status, 0, `mycel failed:\n${my.stderr}`);
    if (KNOWN_DIFF[b]) { assert.notEqual(norm(my.stdout), norm(py.stdout), `${b} now matches Python: remove it from KNOWN_DIFF`); return; }
    assert.equal(norm(my.stdout), norm(py.stdout));
  });
}
