import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// The macOS JXA helper (`osascript -l JavaScript .../jxa-helper.js`) must never outlive the program that started it.
const PKG = path.resolve(__dirname, "..", "..", "packages", "computer");
const HELPER = path.join(PKG, "native", "jxa-helper.js");
const WORKER = path.join(PKG, "native", "helper-worker.cjs");
const skip = process.platform === "darwin" ? false : "the JXA helper only exists on macOS";

/** pids of helper processes for THIS checkout's helper file (never touches anyone else's) */
function helperPids(): Set<number> {
  const r = cp.spawnSync("pgrep", ["-f", HELPER], { encoding: "utf8" });
  return new Set(String(r.stdout).split(/\s+/).filter(Boolean).map(Number).filter((p) => p !== process.pid));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(before: Set<number>, ms = 6000): Promise<number[]> {
  const end = Date.now() + ms;
  let extra: number[] = [];
  while (Date.now() < end) {
    extra = [...helperPids()].filter((p) => !before.has(p));
    if (!extra.length) return [];
    await sleep(200);
  }
  return extra;
}

test("the JXA helper exits when the program closes it, exits normally, or is killed", { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jxa-leak-"));
  const script = path.join(dir, "start.cjs");
  fs.writeFileSync(script, `
const { createHelperClient } = require(${JSON.stringify(WORKER)});
const c = createHelperClient("darwin");
console.log(JSON.stringify(c.call("ping")));
const mode = process.argv[2];
if (mode === "close") { c.close(); setTimeout(() => process.exit(0), 100); }
else if (mode === "exit") process.exit(0);
else setInterval(() => {}, 1000);
`);
  try {
    for (const mode of ["close", "exit", "killed"]) {
      const before = helperPids();
      const child = cp.spawn(process.execPath, [script, mode], { stdio: ["ignore", "pipe", "inherit"] });
      await new Promise<void>((resolve, reject) => {
        child.stdout.once("data", () => resolve());
        child.once("error", reject);
        child.once("exit", () => resolve());
      });
      if (mode === "killed") { await sleep(300); child.kill("SIGKILL"); }
      else await new Promise((r) => (child.exitCode !== null ? r(null) : child.once("exit", r)));
      const left = await settle(before);
      for (const p of left) { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } } // only helpers this test started
      assert.deepEqual(left, [], `${mode}: jxa-helper process(es) ${left.join(", ")} were left running`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("running the computer package tests leaves no jxa-helper behind", { skip }, async () => {
  const before = helperPids();
  const r = cp.spawnSync(process.execPath, ["--test", path.resolve(__dirname, "computer.test.js"), path.resolve(__dirname, "computer_index.test.js")], {
    encoding: "utf8", env: { ...process.env, MYCEL_COMPUTER_BACKEND: "mock" },
  });
  void r; // pass or fail of those tests is reported by those files; here only leaks matter
  const left = await settle(before);
  for (const p of left) { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } }
  assert.deepEqual(left, [], `jxa-helper process(es) ${left.join(", ")} were left running after the computer tests`);
});
