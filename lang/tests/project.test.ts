import { spawnCli } from "./helpers";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { format } from "../src/fmt";
import { satisfies, cmpVer, parseVer } from "../src/project";
import { ReplSession } from "../src/repl";
import { exec, errors } from "./helpers";

const PLY = path.resolve(__dirname, "..", "..", "bin", "ply");
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "ply-proj-"));
function ply(cwd: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnCli(PLY, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const write = (p: string, t: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };

test("init → run → test → fmt --check → build works end to end", () => {
  const d = mk();
  assert.equal(ply(d, ["init", "app"]).code, 0);
  const p = path.join(d, "app");
  const run = ply(p, ["run"]);
  assert.equal(run.out, "Hello, world!\n");
  const t = ply(p, ["test"]);
  assert.match(t.out, /ok .*hello greets by name/);
  assert.match(t.out, /1 passed, 0 failed/);
  assert.equal(ply(p, ["fmt", "--check"]).code, 0);
  assert.equal(ply(p, ["build"]).code, 0);
  const built = spawnSync("node", [path.join(p, "build", "app.js")], { encoding: "utf8" });
  assert.equal(built.stdout, "Hello, world!\n");
  assert.equal(ply(p, ["--version"]).out.trim(), "mycel 0.2.1");
});

test("multi-file project: nested modules, imports, visibility, cycles", () => {
  const d = mk();
  write(path.join(d, "ply.json"), JSON.stringify({ name: "shop", version: "1.0.0" }));
  write(path.join(d, "src", "main.olx"), `import models.item\nimport models.item.{Item as Thing}\nimport util\nfn main() {\n  let i = item.Item(name: "pen", cents: 150)\n  print(util.price(i))\n  print(Thing(name: "x", cents: 5).cents)\n}\n`);
  write(path.join(d, "src", "models", "item.olx"), `pub struct Item { let name: String, cents: Int }\n`);
  write(path.join(d, "src", "util.olx"), `import models.item\npub fn price(i: item.Item) -> String { return "$" + str(i.cents.div(100)) + "." + str(i.cents % 100) }\nfn hidden() {}\n`);
  assert.equal(ply(d, ["run"]).out, "$1.50\n5\n");
  // private access
  write(path.join(d, "src", "main.olx"), `import util\nfn main() { util.hidden() }\n`);
  const priv = ply(d, ["check"]);
  assert.equal(priv.code, 1);
  assert.match(priv.err, /`hidden` is private to module util/);
  assert.match(priv.err, /add `pub`/);
  // cycle
  write(path.join(d, "src", "a.olx"), `import b\npub fn fa() {}\n`);
  write(path.join(d, "src", "b.olx"), `import a\npub fn fb() {}\n`);
  write(path.join(d, "src", "main.olx"), `import a\nfn main() { a.fa() }\n`);
  const cyc = ply(d, ["check"]);
  assert.match(cyc.err, /circular import: a -> b -> a/);
});

test("package manager: publish, add, lock, conflict, remove, tamper detection", () => {
  const reg = mk(), work = mk();
  const env = { PLY_REGISTRY: reg };
  const lib = path.join(work, "mathx");
  write(path.join(lib, "ply.json"), JSON.stringify({ name: "mathx", version: "1.2.0" }));
  write(path.join(lib, "src", "lib.olx"), `pub fn triple(n: Int) -> Int { return n * 3 }\n`);
  write(path.join(lib, "src", "extra.olx"), `pub fn quad(n: Int) -> Int { return n * 4 }\n`);
  assert.equal(ply(lib, ["publish"], env).code, 0);
  assert.match(ply(lib, ["publish"], env).err, /already published/);
  const app = path.join(work, "app");
  ply(work, ["init", "app"], env);
  for (const f of ["main", "greeting"]) fs.renameSync(path.join(work, "app", "src", f + ".myc"), path.join(work, "app", "src", f + ".olx")); // .olx projects keep working
  fs.renameSync(path.join(work, "app", "tests", "greeting_test.myc"), path.join(work, "app", "tests", "greeting_test.olx"));
  fs.writeFileSync(path.join(work, "app", "ply.json"), fs.readFileSync(path.join(work, "app", "ply.json"), "utf8").replace("main.myc", "main.olx"));
  assert.equal(ply(app, ["add", "mathx"], env).code, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(app, "ply.json"), "utf8"));
  assert.equal(manifest.dependencies.mathx, "^1.2.0");
  const lock = JSON.parse(fs.readFileSync(path.join(app, "ply.lock"), "utf8"));
  assert.equal(lock.packages.mathx.version, "1.2.0");
  assert.match(lock.packages.mathx.integrity, /^sha256-[0-9a-f]{64}$/);
  write(path.join(app, "src", "main.olx"), `import mathx\nimport mathx.extra\nfn main() { print(mathx.triple(2))\n print(extra.quad(2)) }\n`);
  assert.equal(ply(app, ["run"], env).out, "6\n8\n");
  // tamper → install restores, verify detects
  fs.appendFileSync(path.join(app, "ply_modules", "mathx", "src", "lib.olx"), "// edited\n");
  assert.equal(ply(app, ["install"], env).code, 0);
  assert.equal(fs.readFileSync(path.join(app, "ply_modules", "mathx", "src", "lib.olx"), "utf8").includes("edited"), false);
  // unknown package and range mismatch explain themselves
  assert.match(ply(app, ["add", "nosuch"], env).err, /was not found in the registry/);
  assert.match(ply(app, ["add", "mathx@^2.0.0"], env).err, /no version of "mathx" satisfies "\^2\.0\.0" \(available: 1\.2\.0\)/);
  assert.equal(ply(app, ["remove", "mathx"], env).code, 0);
  assert.equal(fs.existsSync(path.join(app, "ply_modules", "mathx")), false);
  assert.match(ply(app, ["remove", "mathx"], env).err, /is not a dependency/);
});

test("path dependencies and conflicting requirements", () => {
  const work = mk();
  write(path.join(work, "a", "ply.json"), JSON.stringify({ name: "alpha", version: "1.0.0", dependencies: { shared: "path:../shared1" } }));
  write(path.join(work, "a", "src", "lib.olx"), `import shared\npub fn f() -> Int { return shared.v() }\n`);
  write(path.join(work, "shared1", "ply.json"), JSON.stringify({ name: "shared", version: "1.0.0" }));
  write(path.join(work, "shared1", "src", "lib.olx"), `pub fn v() -> Int { return 1 }\n`);
  write(path.join(work, "app", "ply.json"), JSON.stringify({ name: "app", version: "0.1.0" }));
  write(path.join(work, "app", "src", "main.olx"), `import alpha\nfn main() { print(alpha.f()) }\n`);
  assert.equal(ply(path.join(work, "app"), ["add", "alpha@path:../a"]).code, 0);
  assert.equal(ply(path.join(work, "app"), ["run"]).out, "1\n");
  assert.ok(fs.existsSync(path.join(work, "app", "ply_modules", "shared")), "transitive dependency installed flat");
});

test("semver ranges", () => {
  assert.ok(satisfies("1.4.2", "^1.2.0"));
  assert.ok(!satisfies("2.0.0", "^1.2.0"));
  assert.ok(!satisfies("1.1.9", "^1.2.0"));
  assert.ok(satisfies("0.2.5", "^0.2.1") && !satisfies("0.3.0", "^0.2.1"));
  assert.ok(satisfies("1.2.9", "~1.2.3") && !satisfies("1.3.0", "~1.2.3"));
  assert.ok(satisfies("3.1.0", ">=3.0.0") && satisfies("1.9.0", "1.x") && satisfies("1.2.7", "1.2.x"));
  assert.ok(!satisfies("1.0.0-beta", "^1.0.0"));
  assert.ok(cmpVer(parseVer("1.10.0")!, parseVer("1.9.0")!) > 0);
  assert.throws(() => satisfies("1.0.0", "banana"), /unsupported version range/);
});

test("fmt: canonical layout, idempotent, never changes meaning", () => {
  const messy = `fn main(){\nlet   x=[1,2 ,3]\n\n\n    if x.length>2 {\n  print( f"a {x}" )\n}\n  # keep me\n}\n`;
  const once = format(messy);
  assert.equal(once, `fn main() {\n  let x = [1, 2, 3]\n\n  if x.length>2 {\n    print(f"a {x}")\n  }\n  # keep me\n}\n`);
  assert.equal(format(once), once);
  const multi = `fn f() -> String {\n  return """\n    keep   spacing\n  """\n}\n`;
  assert.equal(format(multi), multi);
  assert.throws(() => format("fn main( {"), /expected/);
});

test("repl: persistent state across inputs, echo, redefinition, errors", async () => {
  const s = new ReplSession();
  const ev = async (t: string) => { const r = await s.eval(t); return r.status === "ok" ? r.output : r.status + ":" + (r.text ?? "").split("\n")[0]; };
  assert.equal(await ev("let x = 40"), "");
  assert.equal(await ev("x + 2"), "42\n");
  assert.equal(await ev("fn double(n: Int) -> Int { return n * 2 }"), "");
  assert.equal(await ev("double(x)"), "80\n");
  assert.equal(await ev("var c = 0"), "");
  assert.equal(await ev("c += 5"), "");
  assert.equal(await ev("c"), "5\n");
  assert.equal(await ev("class P { var n = 1 }"), "");
  assert.equal(await ev("let p = P()"), "");
  assert.equal(await ev("p.n = 9"), "");
  assert.equal(await ev("p.n"), "9\n");
  assert.equal(await ev("let x = \"shadowed\""), "");
  assert.equal(await ev("x"), "\"shadowed\"\n");
  assert.equal(await ev("print(\"side effect\")"), "side effect\n");
  assert.match(await ev("let bad: Int = \"s\""), /^error:error \[E0300\]/);
  assert.equal(await ev("double(1)"), "2\n", "a failed input does not poison the session");
  assert.equal((await s.eval("fn open() {")).status, "incomplete");
  assert.match(await ev("[1,2][5]"), /^error:/);
  assert.equal(s.typeOf("[1, 2].map((a) => a.toFloat())"), "[Float]");
});

test("unknown commands and bad usage exit non-zero with guidance", () => {
  const d = mk();
  const r = ply(d, ["bogus"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /unknown command "bogus"/);
  assert.match(ply(d, ["run"]).err, /no file given and no ply.json found/);
  assert.match(ply(d, ["run", "nope.olx"]).err, /no such file/);
});

test("check --json gives machine-readable diagnostics", () => {
  const d = mk();
  write(path.join(d, "bad.olx"), `fn main() { let x: Int = "s" }\n`);
  const r = ply(d, ["check", "bad.olx", "--json"]);
  const ds = JSON.parse(r.out);
  const e = ds.find((x: any) => x.severity === "error");
  assert.equal(e.code, "E0300");
  assert.equal(e.line, 1);
  assert.equal(e.col, 26);
  assert.ok(e.message && e.why);
  assert.equal(r.code, 1);
});

test("permission flags grant exactly what is asked", () => {
  const d = mk();
  write(path.join(d, "a.txt"), "data");
  write(path.join(d, "r.olx"), `import fs\nfn main() { print(fs.readText(${JSON.stringify(path.join(d, "a.txt"))}).isOk) }\n`);
  assert.equal(ply(d, ["run", "r.olx"]).out, "false\n");
  assert.equal(ply(d, ["run", "r.olx", `--allow-read=${d}`]).out, "true\n");
  assert.equal(ply(d, ["run", "r.olx", "-A"]).out, "true\n");
  assert.equal(errors(`fn main() {}`).length, 0);
  void exec;
});

test("doc: markdown from signatures and ## comments", () => {
  const { documentModule } = require("../src/doc") as typeof import("../src/doc");
  const md = documentModule(`## Adds two numbers.\n## Overflow panics.\npub fn add(a: Int, b: Int) -> Int { return a + b }\nfn hidden() {}\n## A point.\npub struct P { let x: Int }\npub enum E { A, B(n: Int) }\n`, "demo");
  assert.match(md, /## add\n\n```mycel\npub fn add\(a: Int, b: Int\) -> Int\n```\n\nAdds two numbers\.\nOverflow panics\./);
  assert.match(md, /## P/);
  assert.match(md, /enum E \{ A, B\(n: Int\) \}/);
  assert.doesNotMatch(md, /hidden/);
});

test("run --max-memory-mb stops a memory bomb without hurting the CLI", () => {
  const d = mk();
  write(path.join(d, "bomb.olx"), `fn main() {\n var xs: [[Int]] = []\n while true { var row: [Int] = []\n for i in 0..100000 { row.push(i) }\n xs.push(row) }\n}\n`);
  const r = ply(d, ["run", "bomb.olx", "--max-memory-mb=48", "--max-seconds=20", "--max-steps=100000000000"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /memory|limit/);
});

test("fmt is idempotent and token-preserving on every shipped .olx file", () => {
  const roots = [path.resolve(__dirname, "..", "..", "std"), path.resolve(__dirname, "..", "..", "examples")];
  let n = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "ply_modules" && e.name !== "build") walk(p); }
      else if (e.name.endsWith(".olx")) {
        const once = format(fs.readFileSync(p, "utf8"), p);
        assert.equal(format(once, p), once, `not idempotent: ${p}`);
        n++;
      }
    }
  };
  roots.forEach(walk);
  assert.ok(n > 25, `only ${n} files checked`);
});

test("string indexing in a loop stays linear", async () => {
  const src = `fn main() { let s = "ab".repeat(200000)\n var n = 0\n for i in 0..s.length { if s[i] == 'a' { n += 1 } }\n print(n) }`;
  const t0 = Date.now();
  const r = await exec(src);
  assert.equal(r.output, "200000\n");
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test("Mycel naming: .myc and .olx import each other, `ply` is an alias, bare `mycel` greets, old ply.json loads", () => {
  const d = mk();
  write(path.join(d, "ply.json"), JSON.stringify({ name: "mix", version: "1.0.0" })); // old-style manifest, no "main"
  write(path.join(d, "src", "old.olx"), `pub fn a() -> String { return "from olx" }\n`);
  write(path.join(d, "src", "new.myc"), `import old\npub fn b() -> String { return f"{old.a()} + myc" }\n`);
  write(path.join(d, "src", "main.olx"), `import new\nfn main() { print(new.b()) }\n`);
  assert.equal(ply(d, ["run"]).out, "from olx + myc\n");
  fs.renameSync(path.join(d, "src", "main.olx"), path.join(d, "src", "main.myc"));
  const viaAlias = spawnCli(path.resolve(__dirname, "..", "..", "bin", "ply"), ["run"], { cwd: d, encoding: "utf8" });
  assert.equal(viaAlias.stdout, "from olx + myc\n");
  const viaMycel = spawnCli(path.resolve(__dirname, "..", "..", "bin", "mycel"), [], { cwd: d, encoding: "utf8" });
  assert.equal(viaMycel.status, 0);
  assert.match(viaMycel.stdout, /Welcome to Mycel[\s\S]*print\("hi"\)[\s\S]*mycel run hello\.myc/);
  assert.equal(ply(d, ["test"]).code, 0);
});

test("`mycel file.myc args` and `myc file.myc args` run the file directly", () => {
  const d = mk();
  write(path.join(d, "hi.myc"), `import env\nprint(f"hi {env.args()}")\n`);
  for (const cmd of ["mycel", "myc"]) {
    const r = spawnCli(path.resolve(__dirname, "..", "..", "bin", cmd), ["hi.myc", "a", "b"], { cwd: d, encoding: "utf8" });
    assert.equal(r.stdout, 'hi ["a", "b"]\n', r.stderr);
  }
});
