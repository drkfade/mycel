import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { withinPath, ordinaryWindowsPath, portablePath, runtimeSpecifier } from "../src/paths";
import { format } from "../src/fmt";
import { Source } from "../src/diag";
import { lex } from "../src/lexer";
import { run, check } from "../src/host";
import { integrity, registryDir } from "../src/project";
import { spawnCli } from "./helpers";

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "mycel Ω spaces "));
const bin = path.resolve(__dirname, "../../bin");

test("Windows capability boundaries: drives, UNC, case, siblings and traversal", () => {
  for (const [root, file, expected] of [
    ["C:\\Data", "c:/DATA/sub/item.txt", true],
    ["C:\\Data", "C:\\data", true],
    ["C:\\Data", "C:\\Database\\item.txt", false],
    ["C:\\Data", "D:\\Data\\item.txt", false],
    ["C:\\Data", "C:\\Data\\..\\outside.txt", false],
    ["C:\\", "c:\\child.txt", true],
    ["\\\\server\\share\\Data", "\\\\SERVER\\SHARE\\data\\sub\\file", true],
    ["\\\\server\\share", "\\\\server\\other\\file", false],
    ["\\\\server\\share", "\\\\elsewhere\\share\\file", false],
  ] as const) assert.equal(withinPath(root, file, path.win32), expected, `${root} -> ${file}`);
  assert.equal(withinPath("/data", "/DATA/file", path.posix), false);
  assert.equal(withinPath("/data", "/data/file", path.posix), true);
});

test("Windows grants exclude namespace, stream and DOS device aliases", () => {
  for (const file of ["C:\\data\\note:stream", "\\\\?\\C:\\data\\file", "\\\\.\\NUL", "C:\\data\\NUL.txt", "C:\\data\\COM1", "C:\\data.\\file", "C:\\data\\name "]) assert.equal(ordinaryWindowsPath(file), false, file);
  for (const file of ["C:\\data\\normal.txt", "\\\\server\\share\\a.txt", "C:relative.txt", "folder/../a"]) assert.equal(ordinaryWindowsPath(file), true, file);
});

test("portable package names and cross-drive runtime requires", () => {
  assert.equal(portablePath("src\\nested\\lib.myc", path.win32), "src/nested/lib.myc");
  assert.equal(runtimeSpecifier("C:\\app\\build", "D:\\sdk\\host.js", path.win32), "D:/sdk/host.js");
  assert.equal(runtimeSpecifier("C:\\app\\build", "C:\\sdk\\host.js", path.win32), "../../sdk/host.js");
  const dir = temporary();
  try {
    fs.mkdirSync(path.join(dir, "src", "nested"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "nested", "lib.myc"), "pub fn value() -> Int => 9\n");
    const hash = createHash("sha256").update("src/nested/lib.myc\0").update("pub fn value() -> Int => 9\n").update("\0").digest("hex");
    assert.equal(integrity(dir), "sha256-" + hash);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  if (!process.env.PLY_REGISTRY) assert.equal(registryDir(), path.join(os.homedir(), ".ply", "registry"));
});

test("CRLF lexer, JSON/text diagnostics retain original offsets and columns", async () => {
  const text = '// comment\r\nlet x = 4\r\nprint(x + 2)\r\n';
  const tokens = lex(new Source("C:\\sample.myc", text));
  const print = tokens.find(t => t.v === "print")!;
  assert.equal(print.start, text.indexOf("print"));
  assert.deepEqual(new Source("", text).pos(print.start), { line: 3, col: 1 });
  const result = await run({ source: text });
  assert.equal(result.output, "6\n", result.error?.human);
  const bad = 'let x = 1\r\nlet y: Int = "bad"\r\n';
  const checked = check({ source: bad, file: "C:\\bad.myc" });
  const diagnostic = checked.diagnostics.find(d => d.severity === "error")!;
  assert.equal(diagnostic.line, 2);
  assert.equal(diagnostic.col, 14);
  assert.match(checked.text, /C:\\bad.myc:2:14/);
  assert.doesNotMatch(checked.text, /\r/);
});

test("CRLF formatting preserves literal bytes, mixed newlines and idempotence", async () => {
  for (const text of [
    'let  message = """first\r\n  second\r\nthird"""\r\nprint(message)\r\n',
    'let  message = """first\r\n  second\nthird"""\r\nprint(message)\n',
    'let  message = f"""value {2 + 3}\r\n  next"""\r\nprint(message)\r\n',
  ]) {
    const before = await run({ source: text });
    const formatted = format(text);
    assert.equal(format(formatted), formatted);
    const after = await run({ source: formatted });
    assert.equal(after.ok, true, after.error?.human);
    assert.equal(after.output, before.output);
  }
  assert.equal(format('let  x=1\r\nprint(x)\r\n'), 'let x = 1\r\nprint(x)\r\n');
});

test("realpath rejects symlink escapes and dangling write targets", async () => {
  const dir = temporary(), outside = temporary();
  try {
    fs.symlinkSync(outside, path.join(dir, "link"), process.platform === "win32" ? "junction" : "dir");
    const missing = path.join(outside, "not-created");
    fs.mkdirSync(missing);
    fs.symlinkSync(missing, path.join(dir, "dangling"), process.platform === "win32" ? "junction" : "dir");
    fs.rmdirSync(missing);
    for (const file of [path.join(dir, "link", "escape.txt"), path.join(dir, "dangling", "escape.txt")]) {
      const r = await run({ source: `import std.fs\nmatch fs.writeText(${JSON.stringify(file)}, "secret") { .Err(e) => print(typeName(e)), .Ok(_) => print("written") }`, capabilities: { fs: { write: [dir] } } });
      assert.equal(r.output, "CapabilityError\n", r.error?.human);
    }
    assert.equal(fs.existsSync(path.join(outside, "escape.txt")), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("both source aliases run CRLF nested mixed-extension imports with literal argv", () => {
  const dir = temporary();
  try {
    fs.mkdirSync(path.join(dir, "nested"));
    fs.writeFileSync(path.join(dir, "nested", "greet.olx"), 'pub fn value() -> String => "hi Ω"\r\n');
    fs.writeFileSync(path.join(dir, "main.myc"), 'import nested.greet\r\nimport std.env\r\nprint(greet.value())\r\nprint(env.args())\r\n');
    for (const command of ["mycel", "ply"]) {
      const r = spawnCli(path.join(bin, command), ["run", "main.myc", "--", "a b", "&whoami", "100%"], { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, 'hi Ω\n["a b", "&whoami", "100%"]\n');
    }
    if (process.platform === "win32") {
      for (const command of ["mycel", "ply"]) {
        const r = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `""${path.join(bin, command + ".cmd")}" --version"`], { cwd: dir, encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
        // verbatim: Node would otherwise re-quote the /c string ("\"\"C:\\…\\mycel.cmd\" --version\"" is not recognized)
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout.trim(), "mycel 0.1.0");
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("std.fs.remove deletes files and directories under a non-ASCII path", () => {
  // First real-Windows CI run: tour/07_files under "mycel corpus Ω" printed "exists after remove: true" because
  // Node's C++ fs.rmSync skips non-ASCII Windows paths without an error (nodejs/node#56049).
  const dir = temporary();
  try {
    fs.writeFileSync(path.join(dir, "main.myc"), [
      "import std.fs",
      "fn main() {",
      '  fs.writeText("übung Ω.txt", "x").unwrap()',
      '  fs.mkdirs("tree ä/inner").unwrap()',
      '  fs.writeText("tree ä/inner/leaf.txt", "y").unwrap()',
      '  fs.remove("übung Ω.txt").unwrap()',
      '  fs.remove("tree ä").unwrap()',
      '  print(f"{fs.exists("übung Ω.txt").unwrap()} {fs.exists("tree ä").unwrap()}")',
      "}", ""].join("\r\n"));
    const r = spawnCli(path.join(bin, "mycel"), ["run", "main.myc", "--allow-read=.", "--allow-write=."], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "false false\n");
    assert.deepEqual(fs.readdirSync(dir), ["main.myc"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("process arguments stay literal with spaces, quotes and cmd metacharacters", async () => {
  const args = ["a b", 'a"b', "tail\\", "& whoami", "%USERPROFILE%", "$(id)", "|", "^", ""];
  const script = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';
  const src = `import std.process\nlet result = process.run(${JSON.stringify(process.execPath)}, ${JSON.stringify(["-e", script, ...args])}).unwrap()\nprint(result.stdout)`;
  const result = await run({ source: src, capabilities: { process: { run: [process.execPath] } } });
  assert.equal(result.ok, true, result.error?.human);
  assert.equal(result.output, JSON.stringify(args) + "\n");
});

test("std.files and std.fs path operations use the host's path semantics", async () => {
  const paths = process.platform === "win32" ? ["C:\\work\\src\\main.myc", "\\\\server\\share\\data\\file.txt"] : ["/work/src/main.myc", "/volumes/share/data/file.txt"];
  for (const file of paths) {
    const source = `import std.files\nimport std.fs\nlet p = files.path(${JSON.stringify(file)})\nprint(p.name)\nprint(p.parent.raw)\nprint(p.parent.join("next.myc").raw)`;
    const r = await run({ source });
    assert.equal(r.ok, true, r.error?.human);
    assert.equal(r.output, [path.basename(file), path.dirname(file), path.join(path.dirname(file), "next.myc"), ""].join("\n"));
  }
});

// Load unchanged compiled modules with Windows built-ins. This exercises the actual
// capability/hash/spawn wiring on a Mac, without pretending to execute a Windows PE.
function windowsModule(name: string, overrides: Record<string, any> = {}): any {
  const vm = require("node:vm") as typeof import("node:vm");
  const file = path.resolve(__dirname, "../src", name + ".js");
  const module = { exports: {} };
  const load = (id: string): any => {
    if (id in overrides) return overrides[id];
    if (id === "path" || id === "node:path") return path.win32;
    if (id === "./paths") return windowsModule("paths", overrides);
    if (id.startsWith(".")) return require(path.resolve(path.dirname(file), id));
    return require(id);
  };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require: load, __dirname: path.dirname(file), __filename: file, Buffer, process: { platform: "win32", env: { PATH: "C:\\tools", SystemRoot: "C:\\Windows" } }, setTimeout, clearTimeout }, { filename: file });
  return module.exports;
}

test("Windows package integrity hashes canonical names through the real implementation", () => {
  const entry = (name: string, directory: boolean) => ({ name, isDirectory: () => directory, isFile: () => !directory });
  const files: Record<string, any> = { "C:\\pkg": [entry("src", true)], "C:\\pkg\\src": [entry("lib.myc", false)] };
  const project = windowsModule("project", { fs: { readdirSync: (p: string) => files[p], readFileSync: () => Buffer.from("source bytes") } });
  const expected = createHash("sha256").update("src/lib.myc\0source bytes\0").digest("hex");
  assert.equal(project.integrity("C:\\pkg"), "sha256-" + expected);
});

test("Windows native grants and process spawning use platform rules without a shell", () => {
  const calls: any[] = [];
  class Err { message = ""; $init(message: string) { this.message = message; return this; } }
  class Output { $init(code: bigint, stdout: string, stderr: string) { return { code, stdout, stderr }; } }
  const prelude = { Result$Ok: { of: (value: any) => ({ ok: true, value }) }, Result$Err: { of: (error: any) => ({ ok: false, error }) }, IoError: Err, CapabilityError: Err };
  const stdlib = windowsModule("stdlib", {
    fs: { realpathSync: (p: string) => path.win32.normalize(p), statSync: () => ({ size: 8 }), readFileSync: () => "contents" },
    child_process: { spawnSync: (...args: any[]) => { calls.push(args); return { status: 0, stdout: "literal", stderr: "" }; } },
  });
  const rt = { ctx: { M: { prelude, "std.process": { Output } } } };
  const natives = stdlib.stdNatives(rt, { fs: { read: ["C:\\Data", "\\\\host\\share\\Data"] }, process: { run: true } }, []);
  assert.equal(natives["std.fs.readText"]("c:/DATA/file.txt").ok, true);
  assert.equal(natives["std.fs.readText"]("\\\\HOST\\SHARE\\data\\file.txt").ok, true);
  for (const p of ["D:\\Data\\file", "C:\\Database\\file", "C:\\Data\\file:stream", "\\\\?\\C:\\Data\\file"]) assert.equal(natives["std.fs.readText"](p).ok, false, p);
  assert.equal(natives["std.fs.dirname"]("C:\\Data\\file.txt"), "C:\\Data");
  assert.equal(natives["std.fs.basename"]("\\\\host\\share\\file.txt"), "file.txt");
  assert.equal(natives["std.fs.join"]("C:\\Data", "file.txt"), "C:\\Data\\file.txt");
  const argv = ['a"b', "a b", "&whoami", "%HOME%"];
  assert.equal(natives["std.process.run"]("C:\\tools\\tool.exe", argv).ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], argv);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].windowsHide, true);
  assert.equal(calls[0][2].env.SystemRoot, "C:\\Windows");
  assert.equal(natives["std.process.run"]("tool.cmd", argv).ok, false);
  assert.equal(calls.length, 1, "batch commands must never be routed through cmd.exe");
});


test("Windows module resolution uses drive and UNC roots with either source extension", () => {
  const files: Record<string, string> = {
    "C:\\work\\src\\nested\\item.olx": "pub let value = 7",
    "D:\\pkg\\src\\lib.myc": "pub let value = 8",
    "\\\\host\\share\\src\\leaf.myc": "pub let value = 9",
    "C:\\std\\prelude.olx": "// prelude",
    "C:\\std\\time.olx": "// time",
  };
  const modules = windowsModule("modules", { fs: { existsSync: (p: string) => p in files, readFileSync: (p: string) => files[p] } });
  const resolve = modules.makeResolver({ roots: ["C:\\work\\src", "\\\\host\\share\\src"], packages: { supply: "D:\\pkg" }, stdDir: "C:\\std" });
  for (const [name, file] of [["nested.item", "C:\\work\\src\\nested\\item.olx"], ["supply", "D:\\pkg\\src\\lib.myc"], ["leaf", "\\\\host\\share\\src\\leaf.myc"], ["prelude", "C:\\std\\prelude.olx"], ["std.time", "C:\\std\\time.olx"]]) {
    assert.equal(resolve(name).file, file);
    assert.equal(resolve(name).text, files[file]);
  }
});

test("Windows env grants match names case-insensitively; POSIX stays exact", () => {
  class Err { message = ""; $init(message: string) { this.message = message; return this; } }
  const prelude = { Result$Ok: { of: (value: any) => ({ ok: true, value }) }, Result$Err: { of: (error: any) => ({ ok: false, error }) }, IoError: Err, CapabilityError: Err };
  const stdlib = windowsModule("stdlib");
  const natives = stdlib.stdNatives({ ctx: { M: { prelude } } }, { env: { read: ["Path"] } }, []);
  assert.deepEqual(natives["std.env.get"]("PATH"), { ok: true, value: "C:\\tools" });
  assert.equal(natives["std.env.get"]("SystemRoot").ok, false);
  // The real module is the POSIX one only off Windows (on a Windows host it is the case-insensitive one above).
  if (process.platform !== "win32") {
    const posix = require("../src/stdlib").stdNatives({ ctx: { M: { prelude } } }, { env: { read: ["Path"] } }, []);
    assert.equal(posix["std.env.get"]("PATH").ok, false);
  }
});

test("mycel run says a std.ui window is not shown instead of exiting silently", () => {
  const dir = temporary();
  try {
    const file = path.join(dir, "ui.myc");
    fs.writeFileSync(file, 'import std.ui\r\nfn main() {\r\n  ui.window("Counter", [ui.text("hi")])\r\n  print("after")\r\n}\r\n');
    const r = spawnSync(process.execPath, [path.join(bin, "mycel"), "run", file], { encoding: "utf8", input: "" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "after\n");
    assert.match(r.stderr, /opened a std\.ui window \("Counter"\); the mycel CLI has no desktop window renderer yet/);
    assert.equal(r.stderr.split("std.ui window").length, 2, "notice printed once");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
