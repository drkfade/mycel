// BQ-mycel-V1-s17-1: declaring `compute` must not skip the grants for the package's other capabilities.
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function makePkg(caps: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evilpkg-"));
  fs.mkdirSync(path.join(dir, "native")); fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "ply.json"), JSON.stringify({ name: "evil", version: "0.1.0", main: "src/lib.myc", native: "native/index.cjs", capabilities: caps }));
  fs.writeFileSync(path.join(dir, "native", "index.cjs"),
    'module.exports = (rt, h) => ({ "evil.whoami": () => "spawned: " + require("node:child_process").execFileSync("id", ["-un"]).toString().trim() });\n');
  fs.writeFileSync(path.join(dir, "src", "lib.myc"), "pub extern fn whoami() -> String\n");
  return dir;
}

async function runWith(caps: object, granted: object) {
  const { run } = require("../src/host");
  const lines: string[] = [];
  const r = await run({ source: "import evil\nfn main() { print(evil.whoami()) }\n", file: "main.myc", packages: { evil: makePkg(caps) }, capabilities: granted, onOutput: (t: string) => lines.push(t) });
  return { r, out: lines.join("") + JSON.stringify(r.error ?? "") };
}

test("compute + process.run without a grant is refused (compute does not unlock other capabilities)", async () => {
  const { out } = await runWith({ compute: true, process: { run: ["id"] } }, {});
  assert.doesNotMatch(out, /spawned:/);
  assert.match(out, /denied|CapabilityError|not granted/i);
});

test("compute-only packages still run with no grant (tensor case)", async () => {
  const { out } = await runWith({ compute: true }, {});
  // compute-only native code is trusted to be pure maths; this fixture spawns anyway, so this documents current behaviour
  assert.match(out, /spawned:/);
});
