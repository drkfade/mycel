"use strict";
// How the extension starts `mycel`, per platform, with no vscode dependency so Windows rules are unit-tested on any OS
// (test/launch.test.js). Two Windows facts drive it:
//  * Node refuses to spawn a .cmd/.bat without a shell (EINVAL since the 2024 batch-file fix), and libuv's PATH search
//    only tries .com/.exe, so an npm-style `mycel.cmd` shim (or `ply.cmd`) never starts as a plain process.
//  * The Run terminal is PowerShell or cmd.exe by default; POSIX `'…'` quoting makes PowerShell print a quoted command
//    instead of running it, and cmd.exe treats single quotes as literal characters.
const nodePath = require("path");
const fs = require("fs");

const envGet = (env, name, windows) => {
  if (!windows) return env[name];
  const k = Object.keys(env).find((x) => x.toUpperCase() === name);
  return k === undefined ? undefined : env[k];
};

/** Absolute launcher for `cmd`, or undefined. Windows: PATHEXT order (launchable kinds only), then the per-user install dir. */
function resolveCommand(cmd, { platform = process.platform, env = process.env, isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } } } = {}) {
  const windows = platform === "win32";
  const p = windows ? nodePath.win32 : nodePath.posix;
  const exts = windows
    ? [...new Set(String(envGet(env, "PATHEXT", true) || ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.trim().toLowerCase()).filter((e) => [".com", ".exe", ".bat", ".cmd"].includes(e)).concat(".exe"))]
    : [""];
  const candidates = (base) => windows && !/\.(com|exe|bat|cmd)$/i.test(base) ? exts.map((e) => base + e) : [base];
  if (/[\\/]/.test(cmd) || (windows && /^[a-z]:/i.test(cmd))) return candidates(cmd).find(isFile);
  const dirs = String(envGet(env, "PATH", windows) || "").split(windows ? ";" : ":").map((d) => d.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean);
  const local = windows && envGet(env, "LOCALAPPDATA", true);
  if (local) dirs.push(p.join(local, "Mycel", "bin"));
  for (const d of dirs) for (const c of candidates(cmd)) { const f = p.join(d, c); if (isFile(f)) return f; }
  return undefined;
}

/** vscode-languageclient Executable for `<cmd> lsp`. */
function serverExecutable(cmd, opts = {}) {
  const platform = opts.platform || process.platform;
  if (platform !== "win32") return { command: cmd, args: ["lsp"] };
  const found = resolveCommand(cmd, opts) || cmd;
  // a batch launcher needs cmd.exe; quote it ourselves because Node joins shell command lines unquoted
  if (/\.(cmd|bat)$/i.test(found)) return { command: `"${found}"`, args: ["lsp"], options: { shell: true } };
  return { command: found, args: ["lsp"] };
}

/** Which quoting the Run terminal needs, from its shell path (vscode.env.shell). */
function shellKind(shellPath, platform = process.platform) {
  const base = nodePath.win32.basename(String(shellPath || "")).toLowerCase().replace(/\.exe$/, "");
  if (base === "pwsh" || base === "powershell") return "powershell";
  if (base === "cmd") return "cmd";
  if (!base) return platform === "win32" ? "powershell" : "posix"; // VS Code's Windows default profile is PowerShell
  return "posix";
}

const posixQuote = (s) => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
const pwshQuote = (s) => `'${s.replace(/['‘’‚‛]/g, (q) => q + q)}'`;
// `"` cannot occur in a Windows file name; cmd.exe still expands %VAR% inside quotes (documented limit)
const cmdQuote = (s) => /^[\w@+=:,./\\-]+$/.test(s) ? s : `"${s}"`;

/** The line typed into the Run terminal: `<mycel> <file>` in that shell's syntax. */
function runLine(mycel, file, shellPath, platform = process.platform) {
  switch (shellKind(shellPath, platform)) {
    case "powershell": return `& ${pwshQuote(mycel)} ${pwshQuote(file)}`;
    case "cmd": return `${cmdQuote(mycel)} ${cmdQuote(file)}`;
    default: return `${posixQuote(mycel)} ${posixQuote(file)}`;
  }
}

module.exports = { resolveCommand, serverExecutable, shellKind, runLine };
