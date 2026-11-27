import { spawnCli } from "./helpers";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { run } from "../src/host";

const EX = path.resolve(__dirname, "..", "..", "examples");
const PLY = path.resolve(__dirname, "..", "..", "bin", "ply");

for (const f of fs.readdirSync(path.join(EX, "tour")).filter((x) => x.endsWith(".olx")).sort()) {
  test(`tour/${f} prints exactly its recorded output`, async () => {
    const src = fs.readFileSync(path.join(EX, "tour", f), "utf8");
    const r = await run({ source: src, file: f, capabilities: { fs: { read: [process.cwd()], write: [process.cwd()] } } });
    assert.equal(r.ok, true, r.error?.human);
    assert.equal(r.output, fs.readFileSync(path.join(EX, "tour", f.replace(/\.olx$/, ".out")), "utf8"));
  });
}

for (const [proj, expectPass] of [["calc", 3], ["todo", 3], ["api", 2], ["guestbook", 2], ["notes", 2]] as const) {
  test(`examples/${proj}: ply check is clean and its tests pass`, () => {
    const dir = path.join(EX, proj);
    const c = spawnCli(PLY, ["check", "--json"], { cwd: dir, encoding: "utf8" });
    const errs = JSON.parse(c.stdout).filter((d: any) => d.severity === "error");
    assert.deepEqual(errs, []);
    const t = spawnCli(PLY, ["test"], { cwd: dir, encoding: "utf8" });
    assert.match(t.stdout, new RegExp(`${expectPass} passed, 0 failed`), t.stdout + t.stderr);
    assert.equal(t.status, 0);
    fs.rmSync(path.join(dir, "data"), { recursive: true, force: true });
  });
}

test("examples/calc: the program evaluates its sample expressions", () => {
  const r = spawnCli(PLY, ["run"], { cwd: path.join(EX, "calc"), encoding: "utf8" });
  assert.equal(r.stdout, [
    "1 + 2 * 3 = 7.0", "2 ^ 3 ^ 2 = 512.0", "-(4 - 6) * sqrt(16) = 8.0", "max(3, pi) / 0 -> error: division by zero",
    "2 + -> error: unexpected end of input", "10 % 4 + foo -> error: unknown variable 'foo'", "",
  ].join("\n"));
  const args = spawnCli(PLY, ["run", "--", "2 * (3 + 4)"], { cwd: path.join(EX, "calc"), encoding: "utf8" });
  assert.equal(args.stdout, "2 * (3 + 4) = 14.0\n");
});

test("examples/api: the program talks to its own server", () => {
  const r = spawnCli(PLY, ["run"], { cwd: path.join(EX, "api"), encoding: "utf8" });
  assert.match(r.stdout, /POST \/notes -> 201 \{"id":1,"title":"write the docs"\}/);
  assert.match(r.stdout, /GET \/notes\/7 -> 404 .*does not exist/);
  assert.match(r.stdout, /DELETE \/notes\/1 -> 200 deleted/);
  assert.equal(r.status, 0, r.stderr);
});

test("examples/todo: add, complete and remove persist across runs", () => {
  const dir = path.join(EX, "todo");
  fs.rmSync(path.join(dir, "data"), { recursive: true, force: true });
  const ply = (...a: string[]) => spawnCli(PLY, ["run", "--", ...a], { cwd: dir, encoding: "utf8" }).stdout;
  assert.equal(ply("add", "buy", "milk"), "added #1\n");
  assert.equal(ply("add", "ship it"), "added #2\n");
  assert.equal(ply("done", "1"), "done #1\n");
  assert.equal(ply("list"), "[x] #1 buy milk\n[ ] #2 ship it\n");
  assert.equal(ply("rm", "7"), "error: no todo #7\n");
  fs.rmSync(path.join(dir, "data"), { recursive: true, force: true });
});

test("examples/notes: add, list, export and import work across runs", () => {
  const dir = path.join(EX, "notes");
  fs.rmSync(path.join(dir, "data"), { recursive: true, force: true });
  const ply = (...a: string[]) => spawnCli(PLY, ["run", "--", ...a], { cwd: dir, encoding: "utf8" }).stdout;
  assert.match(ply("add", "first", "hello world"), /saved note #1/);
  assert.match(ply("list"), /#1: first - hello world/);
  assert.equal(ply("export", "1", "data/exported"), `exported to ${path.join("data", "exported", "first.md")}\n`);
  assert.equal(fs.readFileSync(path.join(dir, "data", "exported", "first.md"), "utf8"), "hello world");
  assert.match(ply("import", "data/exported/first.md"), /imported note #2/);
  fs.rmSync(path.join(dir, "data"), { recursive: true, force: true });
});
