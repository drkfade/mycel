import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec, out, errors } from "./helpers";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ply-test-"));

test("std.json: parse, navigate, stringify, encode", async () => {
  const src = `
import json
struct P { let name: String, tags: [String] }
fn main() {
  let j = json.parse("{\\"a\\": [1, 2.5, \\"x\\", null, true], \\"b\\": {\\"c\\": 3}}").unwrap()
  print(j.get("b")?.get("c")?.asInt ?? -1)
  print(j.get("a")?.at(2)?.asString ?? "?")
  print(json.stringify(j))
  print(json.encode(P(name: "n", tags: ["a", "b"])))
  match json.parse("{bad") { .Err(e) => print(f"err: {typeName(e)}"), .Ok(_) => print("??") }
}`;
  assert.equal(await out(src), `3\nx\n{"a":[1,2.5,"x",null,true],"b":{"c":3}}\n{"name":"n","tags":["a","b"]}\nerr: ParseError`);
});

test("std.fs is denied without a grant and confined to granted roots", async () => {
  const dir = tmp(), other = tmp();
  fs.writeFileSync(path.join(other, "secret.txt"), "top secret");
  const src = (p: string) => `import fs\nfn main() { match fs.readText(${JSON.stringify(p)}) { .Ok(t) => print(f"read {t}"), .Err(e) => print(f"{typeName(e)}: {e.message}") } }`;
  const none = await exec(src(path.join(other, "secret.txt")));
  assert.match(none.output, /^CapabilityError: fs\.read of .* denied: this run was not granted read access/);
  const wrong = await exec(src(path.join(other, "secret.txt")), { capabilities: { fs: { read: [dir] } } });
  assert.match(wrong.output, /outside the granted read locations/);
  const escape = await exec(src(path.join(dir, "..", path.basename(other), "secret.txt")), { capabilities: { fs: { read: [dir] } } });
  assert.match(escape.output, /outside the granted/);
  // a symlink inside the granted root that points outside must not leak
  fs.symlinkSync(other, path.join(dir, "link"), process.platform === "win32" ? "junction" : "dir");
  const link = await exec(src(path.join(dir, "link", "secret.txt")), { capabilities: { fs: { read: [dir] } } });
  assert.match(link.output, /outside the granted/);
  fs.writeFileSync(path.join(dir, "ok.txt"), "fine");
  const ok = await exec(src(path.join(dir, "ok.txt")), { capabilities: { fs: { read: [dir] } } });
  assert.equal(ok.output, "read fine\n");
});

test("std.fs write/list/remove round trip inside a granted directory", async () => {
  const dir = tmp();
  const src = `
import fs
fn main() {
  let p = ${JSON.stringify(dir)} + "/a/b.txt"
  fs.mkdirs(${JSON.stringify(dir)} + "/a").unwrap()
  fs.writeText(p, "hello").unwrap()
  fs.appendText(p, " world").unwrap()
  print(fs.readText(p).unwrap())
  print(fs.list(${JSON.stringify(dir)} + "/a").unwrap())
  print(fs.size(p).unwrap())
  fs.remove(p).unwrap()
  print(fs.exists(p).unwrap())
}`;
  const caps = { fs: { read: [dir], write: [dir] } };
  assert.equal(await out(src, { capabilities: caps }), `hello world\n["b.txt"]\n11\nfalse`);
  const denied = await exec(src, { capabilities: { fs: { read: [dir] } } });
  assert.equal(denied.error!.kind, "panic");
  assert.match(denied.error!.message, /called unwrap\(\) on an Err: CapabilityError: fs\.write/);
});

test("env, process and network are denied by default with typed errors", async () => {
  const src = `
import env
import process
import http
async fn main() {
  match env.get("HOME") { .Err(e) => print(typeName(e)), .Ok(_) => print("leak") }
  match process.run("echo", ["hi"]) { .Err(e) => print(typeName(e)), .Ok(_) => print("leak") }
  match await http.get("http://127.0.0.1:1/") { .Err(e) => print(typeName(e)), .Ok(_) => print("leak") }
}`;
  assert.equal(await out(src), "CapabilityError\nCapabilityError\nCapabilityError");
});

test("std.process runs only granted programs, without a shell", async () => {
  const src = `
import process
fn main() {
  let r = process.run(${JSON.stringify(process.execPath)}, ["-e", ${JSON.stringify('process.stdout.write(process.argv.slice(1).join(" ") + "\\n")')}, "a b", "$HOME;ls"]).unwrap()
  print(r.stdout.trim())
  print(r.code)
}`;
  assert.equal(await out(src, { capabilities: { process: { run: [process.execPath] } } }), "a b $HOME;ls\n0");
  const other = await exec(src.replace(JSON.stringify(process.execPath), '"cat"'), { capabilities: { process: { run: [process.execPath] } } });
  assert.match(other.error!.message, /was not granted permission to start that program/);
});

test("std.env: args always, variables only when granted", async () => {
  process.env.PLY_TEST_VAR = "visible";
  const src = `import env\nfn main() { print(env.args())\n print(env.get("PLY_TEST_VAR").unwrap()) }`;
  assert.equal(await out(src, { args: ["x", "y"], capabilities: { env: { read: ["PLY_TEST_VAR"] } } }), `["x", "y"]\nvisible`);
  const r = await exec(src, { args: ["x"], capabilities: { env: { read: ["OTHER"] } } });
  assert.match(r.error!.message, /reading environment variable PLY_TEST_VAR denied/);
});

test("std.http: local server and client round trip", async () => {
  const src = `
import http
import json
async fn main() {
  let server = (await http.serve(0, (req) => {
    if req.path == "/json" { return http.jsonResponse(json.Json.Obj({"echo": json.Json.Str(req.body), "q": json.Json.Str(req.query["x"] ?? "")})) }
    return http.text(f"hello {req.method} {req.path}")
  })).unwrap()
  let base = f"http://127.0.0.1:{server.port}"
  let a = (await http.get(base + "/hi")).unwrap()
  print(f"{a.status} {a.body}")
  let b = (await http.post(base + "/json?x=1", "payload")).unwrap()
  print(b.json().unwrap().get("echo")?.asString ?? "?")
  print(b.json().unwrap().get("q")?.asString ?? "?")
  server.stop()
}`;
  const o = await out(src, { capabilities: { net: { hosts: ["127.0.0.1"], listen: true } } });
  assert.equal(o, "200 hello GET /hi\npayload\n1");
  const noListen = await exec(src, { capabilities: { net: { hosts: ["127.0.0.1"] } } });
  assert.match(noListen.error!.message, /starting an HTTP server denied/);
  const noHost = await exec(src, { capabilities: { net: { hosts: ["example.com"], listen: true } } });
  assert.match(noHost.error!.message, /127\.0\.0\.1:\d+ is not in the granted hosts/);
});

test("std.time, std.math, std.crypto, std.re, std.log", async () => {
  const src = `
import time
import math
import crypto
import re
import log
fn main() {
  print(time.iso(0))
  print(time.parts(86400000 * 365).year)
  print(math.hypot(3.0, 4.0))
  print(math.gcd(12, -18))
  print(crypto.sha256("abc"))
  print(crypto.base64Encode("hi"))
  let r = re.Regex.compile("(\\\\d+)-(?<w>[a-z]+)").unwrap()
  let m = r.find("x 42-abc y")!
  print(f"{m.text} {m.start} {m.groups[0] ?? "?"} {m.named["w"] ?? "?"}")
  print(r.replace("1-a 2-b", "X"))
  log.warn("careful")
  log.debug("hidden")
}`;
  assert.equal(await out(src), `1970-01-01T00:00:00.000Z\n1971\n5.0\n6\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad\naGk=\n42-abc 2 42 abc\nX X\n[warn] careful`);
  const bad = await out(`import re\nfn main() { print(re.Regex.compile("(").isErr) }`);
  assert.equal(bad, "true");
});

test("std.sqlite: queries return typed rows; files need a write grant", async () => {
  const src = `
import sqlite
fn main() {
  let db = sqlite.Db.open(":memory:").unwrap()
  db.exec("create table t(id integer, name text, score real)").unwrap()
  db.exec("insert into t values (?, ?, ?)", [1, "ann", 2.5]).unwrap()
  db.exec("insert into t values (?, ?, ?)", [2, "bob", nil]).unwrap()
  for row in db.query("select * from t order by id").unwrap() { print(row) }
  print(db.exec("selec bad").isErr)
}`;
  assert.equal(await out(src), `{"id": 1, "name": "ann", "score": 2.5}\n{"id": 2, "name": "bob", "score": nil}\ntrue`);
  const f = await exec(`import sqlite\nfn main() { print(sqlite.Db.open("/tmp/x.db").isErr) }`);
  assert.equal(f.output, "true\n");
});

test("std.test assertions fail the run with both values", async () => {
  const src = `import test\nfn main() { test.assertEq([1, 2], [1, 3], "lists") }`;
  const r = await exec(src);
  assert.match(r.error!.message, /lists: assertion failed: expected \[1, 3\], got \[1, 2\]/);
});

test("std.task channels and timeouts", async () => {
  const src = `
import task
async fn producer(c: task.Channel<Int>) { for i in 0..3 { c.send(i)\n await task.sleep(1) }\n c.close() }
async fn main() {
  let c = task.Channel<Int>()
  spawn producer(c)
  var got: [Int] = []
  while let v = await c.recv() { got.push(v) }
  print(got)
  let slow = task.sleep(200)
  print((await task.timeout(5, slow)).isErr)
}`;
  assert.equal(await out(src), "[0, 1, 2]\ntrue");
});

test("std.io.readLine reads host-provided stdin", async () => {
  const lines = ["alpha", "beta"];
  const src = `import io\nasync fn main() { while let l = await io.readLine() { print(l.upper()) } }`;
  const o = await out(src, { stdin: { readLine: async () => lines.shift() ?? null } });
  assert.equal(o, "ALPHA\nBETA");
});

test("host-supplied native modules", async () => {
  const src = `import olix\nfn main() { print(olix.double(21))\n print(olix.greet("x")) }`;
  const hostModules = { olix: { source: "pub extern fn double(n: Int) -> Int\npub extern fn greet(name: String) -> String", natives: { double: (n: bigint) => n * 2n, greet: (s: string) => `hello ${s}` } } };
  assert.equal(await out(src, { hostModules }), "42\nhello x");
});

test("type errors in std usage are explained", () => {
  const e = errors(`import fs\nfn main() { let t: String = fs.readText("a") }`);
  assert.equal(e[0].code, "E0300");
  assert.match(e[0].message, /expected String, found Result<String, Error>/);
});

test("std.ui: window, elements, row/column layout, and event handlers", async () => {
  const src = `
import ui

var clicks = 0
let statusText = ui.text("Ready")
let nameInput = ui.input(placeholder: "Name...")
let itemsList = ui.list([ui.text("Item 1")])

let win = ui.window("Test App", [
  statusText,
  nameInput,
  ui.row([
    ui.button("Click Me", onClick: () => {
      clicks += 1
      statusText.setText(f"Clicked {clicks} times")
    }),
    ui.image("https://example.com/logo.png", alt: "Logo"),
  ]),
  itemsList,
])

fn main() {
  print(win.title)
  print(statusText.text)
  itemsList.append(ui.text("Item 2"))
  print(itemsList.children.length)
}
`;
  const r = await exec(src);
  assert.equal(r.output, "Test App\nReady\n2\n");
  assert.ok(r.ui, "ui tree was captured");
  assert.equal(r.ui.title, "Test App");
  assert.equal(r.ui.content.kind, "column");
  const col = r.ui.content.children;
  assert.equal(col[0].kind, "text");
  assert.equal(col[1].kind, "input");
  assert.equal(col[2].kind, "row");
  assert.equal(col[3].kind, "list");
  assert.equal(col[3].children.length, 2);

  // Event dispatch test
  const { dispatchUiEvent } = require("../src/stdlib");
  const btnId = col[2].children[0].id;
  const updated1 = dispatchUiEvent(btnId, "click");
  assert.equal(updated1.content.children[0].text, "Clicked 1 times");
  const updated2 = dispatchUiEvent(btnId, "click");
  assert.equal(updated2.content.children[0].text, "Clicked 2 times");

  // Input event dispatch test
  const inpId = col[1].id;
  dispatchUiEvent(inpId, "input", "Alice");
  assert.equal(dispatchUiEvent(btnId, "click").content.children[0].text, "Clicked 3 times");
});

test("std.time: today, sleep, durations and formatting", async () => {
  const src = `
import time
async fn main() {
  let d = time.today()
  print(d.length == 10)
  let dur = time.seconds(1.5)
  print(dur.toMs())
  print(dur.toSeconds())
  print(time.minutes(2).toSeconds())
  print(time.hours(1).toMinutes())
  print(time.days(1).toHours())
  let t0 = time.now()
  await time.sleep(0.01)
  let t1 = time.now()
  print(t1 >= t0)
  print(time.format(0, "%Y/%m/%d %H:%M:%S"))
  print(time.format(0, "%F %T"))
}
`;
  const r = await out(src);
  assert.equal(r, "true\n1500\n1.5\n120.0\n60.0\n24.0\ntrue\n1970/01/01 00:00:00\n1970-01-01 00:00:00");
});

test("std.files: read, write, append, lines and Path navigation", async () => {
  const dir = tmp();
  const filePath = path.join(dir, "doc.txt");
  const src = `
import files
fn main() {
  let p = files.path(${JSON.stringify(filePath)})
  print(p.name)
  print(p.extension)
  print(p.stem)
  print(p.exists())
  p.write("line 1\\nline 2").unwrap()
  print(p.exists())
  print(p.isFile())
  print(p.size().unwrap())
  print(p.text().unwrap())
  p.append("\\nline 3").unwrap()
  let lines = files.lines(${JSON.stringify(filePath)}).unwrap()
  print(lines.length)
  print(lines[2])
  let sub = files.path(${JSON.stringify(dir)}).join("sub")
  sub.mkdir().unwrap()
  print(sub.isDir())
  p.remove().unwrap()
  print(p.exists())
}
`;
  const caps = { fs: { read: [dir], write: [dir] } };
  assert.equal(await out(src, { capabilities: caps }), `doc.txt\n.txt\ndoc\nfalse\ntrue\ntrue\n13\nline 1\nline 2\n3\nline 3\ntrue\nfalse`);

  // Capability denial check names --allow-read and --allow-write
  const deniedSrc = `
import files
fn main() {
  match files.read(${JSON.stringify(filePath)}) {
    .Ok(_) => print("unexpected ok"),
    .Err(e) => print(e.message)
  }
}
`;
  const deniedRun = await out(deniedSrc);
  assert.match(deniedRun, /--allow-read/);

  const deniedWrite = `
import files
fn main() {
  match files.write(${JSON.stringify(filePath)}, "data") {
    .Ok(_) => print("unexpected ok"),
    .Err(e) => print(e.message)
  }
}
`;
  const deniedWriteRun = await out(deniedWrite);
  assert.match(deniedWriteRun, /--allow-write/);
});

test("std.db: key-value store, tables, queries and write grant requirement", async () => {
  const dir = tmp();
  const dbFile = path.join(dir, "test.db");
  const src = `
import db
fn main() {
  let kv = db.openKV().unwrap()
  kv.set("lang", "mycel").unwrap()
  kv.set("mode", "fast").unwrap()
  print(kv.get("lang"))
  print(kv.get("missing", default: "none"))
  print(kv.has("lang"))
  print(kv.count())
  print(kv.keys().join(","))
  kv.remove("mode").unwrap()
  print(kv.count())
  kv.clear().unwrap()
  print(kv.count())
  kv.close()

  let d = db.open().unwrap()
  let users = d.table("users", {"id": "integer primary key", "name": "text", "age": "integer"}).unwrap()
  users.insert({"name": "Alice", "age": 30}).unwrap()
  users.insert({"name": "Bob", "age": 25}).unwrap()
  users.insert({"name": "Charlie", "age": 35}).unwrap()
  print(users.count().unwrap())
  print(users.count({"name": "Alice"}).unwrap())
  let found = users.find({"name": "Bob"}).unwrap()
  print(found.length)
  print(found[0]["name"])
  let one = users.findOne({"name": "Charlie"}).unwrap()
  print(one != nil)
  users.update({"name": "Bob"}, {"age": 26}).unwrap()
  let updatedBob = users.findOne({"name": "Bob"}).unwrap()!
  print(updatedBob["age"])
  users.delete({"name": "Alice"}).unwrap()
  print(users.count().unwrap())
  d.close()
}
`;
  assert.equal(await out(src), "mycel\nnone\ntrue\n2\nlang,mode\n1\n0\n3\n1\n1\nBob\ntrue\n26\n2");

  // Database on disk without write grant must be denied with --allow-write
  const diskDeniedSrc = `
import db
fn main() {
  match db.openKV(${JSON.stringify(dbFile)}) {
    .Ok(_) => print("unexpected ok"),
    .Err(e) => print(e.message)
  }
}
`;
  const diskDenied = await out(diskDeniedSrc);
  assert.match(diskDenied, /--allow-write/);
});
