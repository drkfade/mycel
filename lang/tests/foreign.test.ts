// Task 55: Python and npm packages for real — offline against local fixtures (no network: pip has no index,
// npm is offline with a dead registry). Each assertion quotes what the CLI printed when it fails.
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { spawnCli, errors } from "./helpers";
import { parse } from "../src/parser";
import { Source } from "../src/diag";
import { ForeignInfo } from "../src/foreign";

const PLY = path.resolve(__dirname, "..", "..", "bin", "ply");
const FIX = path.resolve(__dirname, "..", "..", "tests", "fixtures");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ply-foreign-"));
const python = spawnSync("python3", ["-c", "import venv, ensurepip"], { encoding: "utf8" }).status === 0;
const npm = spawnSync("npm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).status === 0;

// offline package sources
const wheels = path.join(tmp, "wheels"), tgz = path.join(tmp, "tgz"), cache = path.join(tmp, "npm-cache");
if (python) spawnSync("python3", [path.join(FIX, "mkwheel.py"), wheels], { encoding: "utf8" });
if (npm) { fs.mkdirSync(tgz, { recursive: true }); for (const d of ["npm-greet", "npm-pad"]) spawnSync("npm", ["pack", path.join(FIX, d), "--pack-destination", tgz, "--cache", cache, "--offline", "--loglevel=error"], { encoding: "utf8", shell: process.platform === "win32" }); }
const ENV = { PIP_NO_INDEX: "1", PIP_FIND_LINKS: wheels, PIP_DISABLE_PIP_VERSION_CHECK: "1", npm_config_cache: cache, npm_config_offline: "true", npm_config_registry: "http://127.0.0.1:9/", npm_config_update_notifier: "false" };
function ply(cwd: string, args: string[]) {
  const r = spawnCli(PLY, args, { cwd, encoding: "utf8", env: { ...process.env, ...ENV } });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}\n${r.stderr}` };
}
const newProject = (name: string) => { const r = ply(tmp, ["new", name]); assert.equal(r.code, 0, r.all); return path.join(tmp, name); };
const setJson = (f: string, fn: (j: any) => void) => { const j = JSON.parse(fs.readFileSync(f, "utf8")); fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2)); };

const PY_MAIN = `import greetlib --python
from greetlib import hello as hi --python

fn main() {
  print(hi("Ada"))
  print(greetlib.hello("Bob", loud: true))
  print(greetlib.hello("Cy", "?"))
  print(greetlib.twice(21), greetlib.twice(21).asInt)
  let c = greetlib.Counter(start: 5)
  print(c.add(), c.add(k: 10), c, c.typeName)
  let d = greetlib.chatty()
  print(d["items"], d["big"], d["ok"].asBool, d["missing"].isNone)
  for n in greetlib.iter_nums(3) { print(n) }
  let box = greetlib.Box({"a": 1, "b": 2})
  print(len(box), box["b"])
  print(try greetlib.boom())
  print(try c.attr("__class__"))
}
`;
const PY_OUT = `hello Ada!
HELLO BOB!
hello Cy?
42 42
6 16 Counter(16) Counter
printed from python
[1, 2.5, nil, "x"] 1180591620717411303424 true true
0
10
20
2 2
Err(ForeignError: ValueError: fixture says no (python))
Err(ForeignError: AttributeError: \`__class__\` cannot be reached from Mycel (names starting with __ are blocked) (python))
`;

test("python: install pins + hashes, run is denied until granted, then calls work", { skip: python ? false : "python3 with venv not available" }, () => {
  const p = newProject("pyapp");
  const ins = ply(p, ["install", "mycel-fixture-greet", "--python"]); // flag after the package
  assert.equal(ins.code, 0, ins.all);
  // dist name != module name: ply says what to import
  assert.match(ins.out, /added mycel-fixture-greet 1\.0\.0 \(Python\) — use it with: import greetlib --python/);
  const m = JSON.parse(fs.readFileSync(path.join(p, "ply.json"), "utf8"));
  assert.deepEqual(m.python, { "mycel-fixture-greet": "1.0.0" });
  const lock = JSON.parse(fs.readFileSync(path.join(p, "ply.lock"), "utf8")).foreign.python;
  assert.deepEqual(Object.keys(lock).sort(), ["mycel-fixture-base", "mycel-fixture-greet"]);
  for (const e of Object.values<any>(lock)) assert.match(e.hashes[0], /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(lock["mycel-fixture-greet"].provides, ["greetlib"]);
  assert.equal(lock["mycel-fixture-base"].direct, false);

  fs.writeFileSync(path.join(p, "src", "main.myc"), PY_MAIN);
  const denied = ply(p, ["run"]);
  assert.equal(denied.code, 1, denied.all);
  assert.match(denied.err, /calling the Python package mycel-fixture-greet denied: .*"capabilities": \{ "packages": \{ "python": \["mycel-fixture-greet"\] \} \}/);
  setJson(path.join(p, "ply.json"), (j) => { j.capabilities = { packages: { python: ["mycel-fixture-greet"] } }; });
  const r = ply(p, ["run"]);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, PY_OUT);
  // `ply install` rebuilds the venv from ply.lock alone, hash-checked
  fs.rmSync(path.join(p, ".ply"), { recursive: true, force: true });
  const re = ply(p, ["install"]);
  assert.equal(re.code, 0, re.all);
  assert.match(re.out, /\+ 2 Python, 0 npm from ply\.lock/);
  assert.equal(ply(p, ["run"]).out, PY_OUT);
  // a tampered hash is refused
  setJson(path.join(p, "ply.lock"), (j) => { j.foreign.python["mycel-fixture-base"].hashes = ["sha256:" + "0".repeat(64)]; });
  fs.rmSync(path.join(p, ".ply"), { recursive: true, force: true });
  const bad = ply(p, ["install"]);
  assert.notEqual(bad.code, 0, bad.all);
  assert.match(bad.err, /HASH|hash/, bad.all);
});

test("python: import errors come from the recorded mapping and say what to type", { skip: python ? false : "python3 not available" }, () => {
  const p = path.join(tmp, "pyapp");
  if (!fs.existsSync(path.join(p, "ply.lock"))) return; // the install test above did not run
  const chk = (src: string) => { fs.writeFileSync(path.join(p, "src", "e.myc"), src + "\nprint(1)\n"); return ply(p, ["check", "src/e.myc"]).err; };
  assert.match(chk("import mycel_fixture_greet"), /`mycel_fixture_greet` is installed, but it is imported as `greetlib`[\s\S]*fix: import greetlib --python/);
  assert.match(chk("import greetlib"), /foreign import `greetlib` must end with `--python`[\s\S]*fix: import greetlib --python/);
  assert.match(chk("import greetlib --npm"), /`greetlib` is installed for Python, not npm[\s\S]*import greetlib --python/);
  assert.match(chk("import nothere --python"), /`nothere` is not installed for Python[\s\S]*ply install nothere --python/);
  assert.match(chk("import greetlib --pyton"), /unknown runtime flag `--pyton` — did you mean `--python`\?/);
  assert.match(chk("import greetlib --rust"), /Rust packages are recognised but not supported yet/);
  assert.match(chk("import greetlb"), /did you mean `greetlib`\?.*ply install greetlb --python/);
  // trailing flags pass; Python's stdlib needs `--python` and no install
  assert.doesNotMatch(chk("import greetlib --py\nfrom json import dumps --python"), /error/);
  const rm = ply(p, ["why", "basefix", "--python"]);
  assert.match(rm.out, /mycel-fixture-base@2\.1\.0 \(Python, provides basefix\) is needed by: mycel-fixture-greet@1\.0\.0/, rm.all);
  const gone = ply(p, ["remove", "--python", "mycel-fixture-greet"]);
  assert.equal(gone.code, 0, gone.all);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, "ply.lock"), "utf8")).foreign?.python ?? {}, {}); // its orphaned dependency went too
});

test("python: call overhead through the bridge", { skip: python ? false : "python3 not available" }, () => {
  const d = path.join(tmp, "bench.myc");
  fs.writeFileSync(d, `import time --python\nimport time as t\nfn main() {\n  let n = 2000\n  time.monotonic()\n  let t0 = t.monotonicMs()\n  for i in 0..n { time.monotonic() }\n  print(f"{(t.monotonicMs() - t0) * 1000.0 / n.toFloat()}")\n}\n`);
  const r = spawnCli(PLY, ["run", d, "--allow-pkg=time"], { cwd: tmp, encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const us = Number(r.stdout.trim());
  console.log(`python bridge overhead: ${us.toFixed(1)} µs/call (time.monotonic(), 2000 calls)`);
  assert.ok(us > 0 && us < 2000, `µs/call = ${r.stdout}`);
});

test("python: requests-style acceptance test, kwargs, proxy methods, did-you-mean, uncaught error trace", { skip: python ? false : "python3 with venv not available" }, () => {
  const p = newProject("reqapp");
  const ins = ply(p, ["install", "mycel-fixture-requests", "--python"]);
  assert.equal(ins.code, 0, ins.all);
  setJson(path.join(p, "ply.json"), (j) => { j.capabilities = { packages: { python: ["mycel-fixture-requests"] } }; });
  fs.writeFileSync(path.join(p, "src", "main.myc"), `import requests --python
let url = "https://example.test/api"
let r = requests.get(url, timeout: 10)
print(r.status_code)
print(r.text.split("\\n")[0])
print(r.json()["timeout"])
let code: Int = r.status_code
print(code + 1, r.ok == true)
try {
  requests.get("https://fail.test")
} catch e: ForeignError {
  print(e.message)
}
`);
  const r = ply(p, ["run"]);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, `200\nalpha\n10\n201 true\nrequests.ConnectionError: host unreachable (python)\n`);

  // runtime member did-you-mean + uncaught foreign panic trace with file:line
  fs.writeFileSync(path.join(p, "src", "main.myc"), `import requests --python
let r = requests.get("https://example.test", timeout: 5)
print(r.staus_cod)
`);
  const dym = ply(p, ["run"]);
  assert.notEqual(dym.code, 0);
  assert.match(dym.err, /ForeignError:.*has no attribute 'staus_cod' — did you mean `status_code`\? \(python\)/);
  assert.match(dym.err, /main\.myc:3/);

  fs.writeFileSync(path.join(p, "src", "main.myc"), `import requests --python
requests.get("https://fail.test")
`);
  const boom = ply(p, ["run"]);
  assert.notEqual(boom.code, 0);
  assert.match(boom.err, /ForeignError:.*ConnectionError: host unreachable \(python\)/);
  assert.match(boom.err, /main\.myc:2/);
});

const JS_MAIN = `import "@mycel-fixture/greet-js" as greet --npm
import "pad-fixture" as pad --npm
import foreign

async fn main() {
  print(greet.hello("Ada"), greet.hello("Bo", "?"))
  print(greet.opts("Ada", upper: true, times: 2))
  let s: Float = greet.sum([1, 2, 3.5])
  print(s, greet.sum([1, 2, 3.5]).asFloat)
  let i = greet.info()
  print(i["items"], i["nested"]["k"], i["ok"].asBool, i.keys)
  let c = greet.Counter(5)
  print(c.add(2), c, c.typeName)
  let bag = greet.Bag()
  for ch in bag { print(ch) }
  print(len(bag), bag.fetch("b"))
  print(try greet.boom())
  print(await foreign.resolve(greet.later(21)))
  print(pad.call("7", 3, "0"))
  print(try c.attr("constructor"))
}
`;
const JS_OUT = `hello Ada! hello Bo?
ADA ADA
6.5 6.5
[1, 2.5, nil, "x"] v true ["ok", "items", "nested"]
7 Counter(7) Counter
x
y
2 2
Err(ForeignError: RangeError: fixture says no (npm))
42
007
Err(ForeignError: Error: \`constructor\` cannot be reached from Mycel (npm))
`;

test("npm: install from tarballs with integrity, quoted names need `as`, calls gated and working", { skip: npm ? false : "npm not available" }, () => {
  const p = newProject("jsapp");
  const ins = ply(p, ["install", "--npm", path.join(tgz, "mycel-fixture-greet-js-1.0.0.tgz"), path.join(tgz, "pad-fixture-2.0.1.tgz")]);
  assert.equal(ins.code, 0, ins.all);
  assert.match(ins.out, /added @mycel-fixture\/greet-js 1\.0\.0 \(npm\) — use it with: import "@mycel-fixture\/greet-js" as greetJs --npm/);
  const lock = JSON.parse(fs.readFileSync(path.join(p, "ply.lock"), "utf8")).foreign;
  for (const e of Object.values<any>(lock.npm)) assert.match(e.integrity, /^sha512-/);
  assert.ok(fs.existsSync(path.join(p, ".ply", "node", "node_modules", "pad-fixture", "index.js")));
  fs.writeFileSync(path.join(p, "src", "main.myc"), JS_MAIN);
  const denied = ply(p, ["run"]);
  assert.match(denied.err, /calling the npm package @mycel-fixture\/greet-js denied/, denied.all);
  setJson(path.join(p, "ply.json"), (j) => { j.capabilities = { packages: { npm: ["@mycel-fixture/greet-js", "pad-fixture"] } }; });
  const r = ply(p, ["run"]);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, JS_OUT);
  fs.writeFileSync(path.join(p, "src", "e.myc"), `import "@mycel-fixture/greet-js" --npm\nprint(1)\n`);
  assert.match(ply(p, ["check", "src/e.myc"]).err, /is not a name you can use in code[\s\S]*fix: give it one: import "@mycel-fixture\/greet-js" as mycelFixtureGreetJs --npm/);
  // restore from ply.lock with npm ci
  fs.rmSync(path.join(p, ".ply"), { recursive: true, force: true });
  const re = ply(p, ["install"]);
  assert.equal(re.code, 0, re.all);
  assert.equal(ply(p, ["run"]).out, JS_OUT);
  assert.equal(ply(p, ["remove", "pad-fixture", "--npm"]).code, 0);
  assert.ok(!fs.existsSync(path.join(p, ".ply", "node", "node_modules", "pad-fixture")));
});

// ----- no installs needed -----
const decl = (src: string) => parse(new Source("t.myc", src)).decls[0] as any;
test("import syntax: trailing runtime flag required, non-trailing flag error + fix, from X import a, no brackets, no wildcard", () => {
  const ok1 = decl("import numpy as np --python");
  assert.deepEqual([ok1.path, ok1.alias, ok1.flag.name, !!ok1.flag.nonTrailing], [["numpy"], "np", "python", false]);
  for (const s of ["import --python numpy as np", "import numpy --python as np"]) {
    const d = decl(s);
    assert.equal(d.flag.nonTrailing, true, s);
    const e = errors(s + "\nprint(1)");
    assert.match(e[0].message, /runtime flags go at the end/);
    assert.match(e[0].suggestion!, /import numpy as np --python/);
  }
  const f = decl("from google.generativeai import GenerativeModel as GM, configure --py");
  assert.deepEqual([f.path, f.names.map((n: any) => [n.name, n.alias]), f.flag.name, f.fromForm, !!f.flag.nonTrailing], [["google", "generativeai"], [["GenerativeModel", "GM"], ["configure", undefined]], "py", true, false]);
  const q = decl(`import "@google/generative-ai" as genai --npm`);
  assert.deepEqual([q.path, q.alias, q.quoted, q.flag.name, !!q.flag.nonTrailing], [["@google/generative-ai"], "genai", true, "npm", false]);
  assert.equal(decl(`import --npm "@google/generative-ai" as genai`).flag.nonTrailing, true);
  // brackets & wildcards are clean errors
  assert.throws(() => parse(new Source("t.myc", "from math import [sqrt, sin]")), /takes no brackets[\s\S]*from math import sqrt, sin/);
  assert.throws(() => parse(new Source("t.myc", "import math.*")), /wildcard imports/);
  assert.throws(() => parse(new Source("t.myc", "from math import *")), /wildcard imports/);
  // `- -x` with spaces is still subtraction, not a flag
  assert.equal(decl("import a\nprint(1 - -x)").flag, undefined);
});

test("two runtimes provide the name: the flag is required and both fixes are given", () => {
  const foreign: ForeignInfo = { root: tmp, cacheDir: path.join(tmp, "cache"), lock: { python: { colors: { version: "1.0.0", provides: ["colors"], direct: true } }, npm: { colors: { version: "1.4.0", provides: ["colors"], direct: true } } } };
  const e = errors("import colors\nprint(1)", { foreign });
  assert.equal(e.length, 1, JSON.stringify(e));
  assert.match(e[0].message, /`colors` is installed for Python and npm/);
  assert.match(e[0].suggestion!, /import colors --python\n\s+import colors --npm/);
});

test("built-ins drop std., from X import Y works on Mycel, std. and .{ } are deprecated, and project shadowing errors", async () => {
  const { exec, diags } = await import("./helpers");
  const foreign: ForeignInfo = { root: tmp, cacheDir: path.join(tmp, "cache"), lock: { python: { mathpkg: { version: "1.0.0", provides: ["math"], direct: true } } } };
  assert.deepEqual(errors("import math\nfrom math import sqrt as sq\nprint(math.cos(0.0), sq(9.0))", { foreign }), []);
  const r = await exec("import json\nfrom math import sqrt\nprint(sqrt(16.0), json.stringify(json.Json.Num(2.0)))");
  assert.equal(r.output.trim(), "4.0 2");
  // std. prefix and .{...} compile with deprecation warnings
  const wStd = diags("import std.math\nprint(math.sqrt(4.0))").filter((d) => d.severity === "warning");
  assert.ok(wStd.some((d) => d.code === "W0202" && /import math/.test(d.suggestion ?? "")));
  const wBrace = diags("import math.{sqrt}\nprint(sqrt(4.0))").filter((d) => d.severity === "warning");
  assert.ok(wBrace.some((d) => d.code === "W0201" && /from math import sqrt/.test(d.suggestion ?? "")));
  // project file shadowing built-in name errors clearly
  const p = newProject("shadowapp");
  fs.writeFileSync(path.join(p, "src", "json.myc"), "pub fn hi() => 1\n");
  fs.writeFileSync(path.join(p, "src", "main.myc"), "import json\nprint(1)\n");
  const sh = ply(p, ["check"]);
  assert.notEqual(sh.code, 0);
  assert.match(sh.err, /conflicts with Mycel's built-in module `json`/);
});

test("java: offline headless JDK imports, JavaBridge, Maven install with sha256 + JAR provides", async () => {
  const javac = spawnSync("javac", ["-version"], { encoding: "utf8" }).status === 0;
  const jar = spawnSync("jar", ["--version"], { encoding: "utf8" }).status === 0;
  if (!javac || !jar) return;
  const p = newProject("javaapp");
  const repo = path.join(tmp, "mvn-repo");
  const msrc = path.join(tmp, "mvn-src");
  fs.mkdirSync(path.join(msrc, "demo"), { recursive: true });
  fs.writeFileSync(path.join(msrc, "demo", "Calc.java"), `package demo;\npublic class Calc {\n  public static String tag = "v1";\n  public int bias;\n  public Calc(int b) { this.bias = b; }\n  public int add(int a) { return a + this.bias; }\n  public static int mul(int a, int b) { return a * b; }\n}\n`);
  spawnSync("javac", ["-d", msrc, path.join(msrc, "demo", "Calc.java")], { encoding: "utf8" });
  const jarDir = path.join(repo, "org", "demo", "calc", "1.0.0");
  fs.mkdirSync(jarDir, { recursive: true });
  fs.writeFileSync(path.join(jarDir, "calc-1.0.0.pom"), `<project><dependencies></dependencies></project>`);
  spawnSync("jar", ["cf", path.join(jarDir, "calc-1.0.0.jar"), "-C", msrc, "demo/Calc.class"], { encoding: "utf8" });

  const ins = spawnCli(PLY, ["install", "org.demo:calc:1.0.0", "--java"], { cwd: p, encoding: "utf8", env: { ...process.env, PLY_MAVEN_REPO: repo } });
  assert.equal(ins.status, 0, ins.stdout + ins.stderr);
  assert.match(ins.stdout, /added org\.demo:calc 1\.0\.0 \(Java\)/);
  const lock = JSON.parse(fs.readFileSync(path.join(p, "ply.lock"), "utf8")).foreign.java;
  assert.match(lock["org.demo:calc"].hashes[0], /^sha256:[0-9a-f]{64}$/);
  assert.ok(lock["org.demo:calc"].provides.includes("demo"));

  fs.writeFileSync(path.join(p, "src", "main.myc"), `import java.time.LocalDate --java
from java.util import ArrayList --java
from demo import Calc --java

let d = LocalDate.of(2024, 1, 2)
print(d, d.isLeapYear())
let xs = ArrayList()
xs.add("first")
xs.add("second")
print(len(xs))
for x in xs { print(x) }
let c = Calc(10)
print(c.add(5), Calc.mul(3, 4), c.bias)
c.bias = 20
print(c.add(5))
`);
  const denied = ply(p, ["run"]);
  assert.notEqual(denied.code, 0);
  assert.match(denied.err, /Java.*denied.*"java": true/i);
  setJson(path.join(p, "ply.json"), (j) => { j.capabilities = { java: true }; });
  const okRun = spawnCli(PLY, ["run"], { cwd: p, encoding: "utf8", env: { ...process.env, MYCEL_JAVA_HEADLESS: "1" } });
  assert.equal(okRun.status, 0, okRun.stdout + okRun.stderr);
  assert.equal(okRun.stdout, `2024-01-02 true\n2\nfirst\nsecond\n15 12 10\n25\n`);
});

test("foreign.callModule refuses a package that does not provide the module (no spoofing via foreign)", async () => {
  const { exec } = await import("./helpers");
  const foreign: ForeignInfo = { root: tmp, cacheDir: path.join(tmp, "cache"), lock: { python: { greet: { version: "1.0.0", provides: ["greetlib"], direct: true } } } };
  const r = await exec(`import foreign\nfn main() { print(foreign.callModule("python", "greet", "os", "getcwd", [], [], {}, [], false)) }`, { foreign, capabilities: { packages: { python: ["greet"] } } });
  assert.equal(r.ok, false);
  assert.match(r.error?.human ?? "", /Python package greet does not provide module os/, r.output + (r.error?.human ?? ""));
});

test("npm: js method did-you-mean error is clear", { skip: npm ? false : "npm not available" }, () => {
  const p = path.join(tmp, "jsapp");
  if (!fs.existsSync(path.join(p, "ply.lock"))) return;
  fs.writeFileSync(path.join(p, "src", "main.myc"), `import "@mycel-fixture/greet-js" as greet --npm
let bag = greet.Bag()
print(bag.ftch("a"))
`);
  const r = ply(p, ["run"]);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /ForeignError:.*has no method `ftch` — did you mean `fetch`\? \(npm\)/);
});

test("python: the bridge process dying is a clear error on this and later calls, not a hang", { skip: python ? false : "python3 not available" }, () => {
  const d = path.join(tmp, "crash.myc");
  fs.writeFileSync(d, `import os --python\nimport time --python\nfn main() {\n  let exit = os.module().attr("_exit")\n  print(try exit.invoke(7))\n  print(try time.monotonic())\n}\n`);
  const t0 = Date.now();
  const r = spawnCli(PLY, ["run", d, "--allow-pkg=os,time"], { cwd: tmp, encoding: "utf8", timeout: 20000 });
  assert.ok(Date.now() - t0 < 15000, "took too long");
  assert.equal(r.stdout, "Err(ForeignError: Python bridge: the Python process exited (code 7) (python))\nErr(ForeignError: Python bridge: the Python process exited (code 7) (python))\n", r.stdout + r.stderr);
});
