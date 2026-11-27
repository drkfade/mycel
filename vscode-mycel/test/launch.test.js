"use strict";
// Windows launch rules with an injected platform/env/file set (no VS Code needed). Real shells are exercised where present.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolveCommand, serverExecutable, shellKind, runLine } = require("../launch");

const env = { Path: 'C:\\Windows\\system32;"C:\\Program Files\\nodejs";C:\\Users\\Ana\\AppData\\Roaming\\npm', LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local" };
const win = (files, e = env) => ({ platform: "win32", env: e, isFile: (p) => files.includes(p) });

test("win32: mycel.exe from the per-user install dir starts as a plain process", () => {
  const o = win(["C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe"]);
  assert.equal(resolveCommand("mycel", o), "C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe");
  assert.deepEqual(serverExecutable("mycel", o), { command: "C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe", args: ["lsp"] });
});

test("win32: a .cmd shim (npm, ply.cmd, repo lang\\bin) goes through cmd.exe, quoted", () => {
  const o = win(["C:\\Users\\Ana\\AppData\\Roaming\\npm\\mycel.cmd"]);
  assert.deepEqual(serverExecutable("mycel", o), { command: '"C:\\Users\\Ana\\AppData\\Roaming\\npm\\mycel.cmd"', args: ["lsp"], options: { shell: true } });
  const spaced = win(["D:\\My Tools\\mycel\\bin\\ply.cmd"]);
  assert.deepEqual(serverExecutable("D:\\My Tools\\mycel\\bin\\ply.cmd", spaced), { command: '"D:\\My Tools\\mycel\\bin\\ply.cmd"', args: ["lsp"], options: { shell: true } });
  // an explicit path without extension resolves by PATHEXT; quoted PATH entries are unquoted
  assert.equal(resolveCommand("D:\\src\\olx\\lang\\bin\\mycel", win(["D:\\src\\olx\\lang\\bin\\mycel", "D:\\src\\olx\\lang\\bin\\mycel.cmd"])), "D:\\src\\olx\\lang\\bin\\mycel.cmd");
  assert.equal(resolveCommand("mycel", win(["C:\\Program Files\\nodejs\\mycel.exe"])), "C:\\Program Files\\nodejs\\mycel.exe");
  assert.equal(resolveCommand("mycel", win(["C:\\Program Files\\nodejs\\mycel.ps1"], { ...env, PATHEXT: ".EXE;.PS1" })), undefined);
  // not found: hand the name through unchanged so the client reports the real spawn error
  assert.deepEqual(serverExecutable("mycel", win([])), { command: "mycel", args: ["lsp"] });
});

test("posix: unchanged behaviour", () => {
  assert.deepEqual(serverExecutable("/opt/mycel/bin/mycel", { platform: "darwin" }), { command: "/opt/mycel/bin/mycel", args: ["lsp"] });
  assert.equal(runLine("mycel", "/Users/a b/it's.myc", "/bin/zsh", "darwin"), `mycel '/Users/a b/it'\\''s.myc'`);
});

test("Run line is quoted for the terminal's shell", () => {
  assert.equal(shellKind("C:\\Program Files\\PowerShell\\7\\pwsh.exe", "win32"), "powershell");
  assert.equal(shellKind("C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "win32"), "powershell");
  assert.equal(shellKind("C:\\WINDOWS\\System32\\cmd.exe", "win32"), "cmd");
  assert.equal(shellKind("C:\\Program Files\\Git\\bin\\bash.exe", "win32"), "posix");
  assert.equal(shellKind(undefined, "win32"), "powershell");
  const exe = "C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe", file = "C:\\Users\\Ana\\My Code\\Ana's (1).myc";
  assert.equal(runLine(exe, file, "pwsh.exe", "win32"), `& 'C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe' 'C:\\Users\\Ana\\My Code\\Ana''s (1).myc'`);
  assert.equal(runLine(exe, file, "cmd.exe", "win32"), `C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe "C:\\Users\\Ana\\My Code\\Ana's (1).myc"`);
  assert.equal(runLine("mycel", "C:\\a\\b.myc", "cmd.exe", "win32"), "mycel C:\\a\\b.myc");
});

// The PowerShell line really runs (and passes literal arguments) in pwsh where available: PWSH=/path/to/pwsh.
test("PowerShell executes the Run line with literal arguments", (t) => {
  const pwsh = process.env.PWSH; if (!pwsh) { t.skip("set PWSH to a pwsh binary"); return; }
  const file = "/tmp/Ana's (1) $HOME `x ‘q’.myc";
  const line = runLine(process.execPath, file, "pwsh", "darwin");
  const r = spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-Command", line.replace(/ '\/tmp/, " '-p' 'process.argv[1]' '/tmp")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), file);
});
