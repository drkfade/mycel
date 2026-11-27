import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parsePkgArgs, RUNTIMES, splitVersion } from "../src/pkgflags";

// Every alias in the WO111 item 9 table maps to exactly its runtime (flag before the package).
const TABLE: Record<string, string> = {
  python: "python", py: "python", pip: "python", javascript: "javascript", js: "javascript", npm: "javascript",
  typescript: "typescript", ts: "typescript", java: "java", maven: "java", mvn: "java", rust: "rust", rs: "rust",
  cargo: "rust", go: "go", golang: "go", swift: "swift",
};
for (const [flag, rt] of Object.entries(TABLE)) {
  test(`ply install --${flag} x → ${rt}`, () => {
    const r = parsePkgArgs("install", [`--${flag}`, "x", "y"]);
    assert.equal(r.runtime, rt);
    assert.deepEqual(r.packages.map((p) => p.name), ["x", "y"]);
  });
}
test("the flag table has exactly the spec's aliases", () => {
  assert.deepEqual(RUNTIMES.flatMap((r) => r.flags).sort(), Object.keys(TABLE).sort());
});
test("no flag = a Mycel package", () => assert.equal(parsePkgArgs("install", ["mathx"]).runtime, undefined));
test("versions: @ for every runtime, == for pip, :ver for Maven", () => {
  assert.deepEqual(splitVersion("requests@2.32.3", "python"), { name: "requests", version: "2.32.3" });
  assert.deepEqual(splitVersion("requests==2.32.3", "python"), { name: "requests", version: "2.32.3" });
  assert.deepEqual(splitVersion("com.google.code.gson:gson:2.11.0", "java"), { name: "com.google.code.gson:gson", version: "2.11.0" });
  assert.deepEqual(splitVersion("com.google.code.gson:gson@2.11.0", "java"), { name: "com.google.code.gson:gson", version: "2.11.0" });
  assert.deepEqual(splitVersion("@types/node@24.0.0", "typescript"), { name: "@types/node", version: "24.0.0" });
  assert.deepEqual(splitVersion("@types/node", "typescript"), { name: "@types/node" });
});
const fails = (args: string[], re: RegExp, cmd = "install") => assert.throws(() => parsePkgArgs(cmd, args), (e: Error) => { assert.match(e.message, re); return true; });
test("unknown flag lists the accepted flags and suggests the closest", () => fails(["--pyhton", "requests"], /unknown flag `--pyhton` — did you mean `--python`\?[\s\S]*accepted: --python --py --pip/));
test("flag after the package says to move it", () => fails(["requests", "--py"], /put the flag before the package: `ply install --py requests`/));
test("two runtimes in one command is an error", () => fails(["--py", "--js", "x"], /one runtime per command/));
test("--ply / --mycel / --olx: Mycel packages take no flag", () => { for (const f of ["--ply", "--mycel", "--olx"]) fails([f, "x"], /Mycel packages take no flag/); });
test("a runtime flag with no package names an example", () => fails(["--py"], /needs a package name: e.g. `ply install --py requests`/));
test("remove/update/why take the same flags", () => {
  assert.equal(parsePkgArgs("remove", ["--pip", "requests"]).runtime, "python");
  assert.equal(parsePkgArgs("why", ["--cargo", "serde"]).runtime, "rust");
  fails(["--pip"], /`ply remove --pip` needs a package name/, "remove");
});
