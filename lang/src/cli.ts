import { runtimeSpecifier, withinPath } from "./paths";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { run, runIsolated, check, compile, execute, toBundle, fromBundle, Bundle, RunOptions, RunResult } from "./host";
import { renderDiagnostics } from "./modules";
import { CompileError, closest, formatDiagnostic } from "./diag";
import { isSrc, stripExt } from "./exts";
import { parsePkgArgs, INSTALL_HELP, FOREIGN_HINT, runtimeLabel, PkgRequest } from "./pkgflags";
import { HABITS_HELP } from "./habitsdoc";
import { explain, explainList, explainUnknown, explainHint } from "./explain";
import { format } from "./fmt";
import { migrateSource } from "./migrate";
import { Capabilities } from "./stdlib";
import { PlyError, Project, addDependency, findProject, initProject, install, listFilesRec, publish, readManifest, removeDependency, verifyLock } from "./project";
import { startRepl } from "./repl";
import { documentModule } from "./doc";

export const VERSION = "0.1.0";

const WELCOME = `Welcome to Mycel ${VERSION} — a friendly language for your first program and your hundredth.

  Try your first program:
    1. make a file called hello.myc containing one line:    print("hi")
    2. run it:                                              mycel run hello.myc

  Or start a whole project:   mycel new my_project
  Play with it live:          mycel repl
  Everything else:            mycel help
`;

const HELP = `mycel ${VERSION} — a friendly, typed language (files: .myc, and .olx keeps working)

usage: mycel <command> [options]      (packages: ply install --py requests — see \`ply help install\`)

  run [file] [-- args]   compile and run a file (default: the project's main)
  check [file]           type-check without running (--json for machine-readable output)
  test [filter]          run every  test "name" { ... }  block (project: src/ and tests/)
  build [file]           type-check and write build/<name>.js (runs with: node build/<name>.js)
  migrate [paths]        rewrite old "$\\{x}" strings to f"{x}" (same as fmt --fix, without reformatting)
  fmt [files] [--check] [--fix]  format source files in place (--fix rewrites old "$\\{x}" strings to f"{x}")
  repl                   interactive session
  new <name>             create a project   (init does the same)
  lsp                    language server for editors (stdio)
  explain [code]         a longer explanation of an error code, with an example (no code: list them all)
  doc [files]            Markdown reference of the pub declarations (/// comments); --out=<dir> writes files
  emit <file>            print the generated JavaScript
  help habits            habits from Python, JS/TS, Java, Go, Rust, Swift and the Mycel spelling

packages (ply = the package manager; same CLI):
  ply install <pkg>      add a Mycel package   (ply install --py requests for another language: \`ply help install\`)
  ply install            install everything in ply.json (writes ply.lock)
  ply remove|update|why  remove / re-resolve / explain a dependency (same flags as install)
  ply publish            publish this package to the local registry

permissions (a program can only touch what is granted; default: nothing):
  --allow-read=<paths>  --allow-write=<paths>  --allow-net[=<hosts>]  --allow-listen
  --allow-run[=<cmds>]  --allow-env[=<names>]  --allow-all (-A)
  (a project's ply.json "capabilities" are used when no flags are given)

limits:  --max-steps=<n>  --max-seconds=<n>  --max-output=<bytes>
         --isolated --max-memory-mb=<n>   run in a worker thread with a hard heap cap
         --json              errors as JSON (code, span, message, suggestion)
`;

interface Parsed { cmd: string; pos: string[]; flags: Map<string, string | true>; rest: string[] }
function parseArgs(argv: string[]): Parsed {
  const flags = new Map<string, string | true>();
  const pos: string[] = [];
  let rest: string[] = [];
  const cmd = argv[0] ?? "";
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { rest = argv.slice(i + 1); break; }
    if (a === "-A") flags.set("allow-all", true);
    else if (a.startsWith("--")) { const eq = a.indexOf("="); if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1)); else flags.set(a.slice(2), true); }
    else pos.push(a);
  }
  return { cmd, pos, flags, rest };
}

function capsFromFlags(f: Map<string, string | true>, project?: Project): Capabilities {
  const list = (v: string | true | undefined) => (typeof v === "string" ? v.split(",").filter(Boolean) : undefined);
  const caps: Capabilities = {};
  if (f.has("allow-all")) return { fs: { read: true, write: true }, net: { hosts: true, listen: true }, process: { run: true }, env: { read: true } };
  if (f.has("allow-read")) caps.fs = { ...(caps.fs ?? {}), read: list(f.get("allow-read")) ?? [process.cwd()] };
  if (f.has("allow-write")) caps.fs = { ...(caps.fs ?? {}), write: list(f.get("allow-write")) ?? [process.cwd()] };
  if (f.has("allow-net")) caps.net = { ...(caps.net ?? {}), hosts: list(f.get("allow-net")) ?? true };
  if (f.has("allow-listen")) caps.net = { ...(caps.net ?? {}), listen: true };
  if (f.has("allow-run")) caps.process = { run: list(f.get("allow-run")) ?? true };
  if (f.has("allow-env")) caps.env = { read: list(f.get("allow-env")) ?? true };
  if (Object.keys(caps).length === 0 && project?.manifest.capabilities) return resolveManifestCaps(project);
  return caps;
}
/** Relative paths in ply.json capabilities are relative to the project root. */
function resolveManifestCaps(p: Project): Capabilities {
  const c = JSON.parse(JSON.stringify(p.manifest.capabilities ?? {})) as Capabilities;
  const abs = (xs?: string[] | true) => xs === true ? true : xs?.map((x) => path.resolve(p.root, x));
  if (c.fs) { c.fs.read = abs(c.fs.read); c.fs.write = abs(c.fs.write); }
  return c;
}

function limitsFromFlags(f: Map<string, string | true>) {
  const num = (k: string) => { const v = f.get(k); if (typeof v !== "string") return undefined; const n = Number(v); if (!(n > 0)) throw new PlyError(`--${k} needs a positive number (got ${v})`); return n; };
  const secs = num("max-seconds");
  return { maxSteps: num("max-steps") ?? Infinity, maxMillis: secs ? secs * 1000 : Infinity, maxOutputBytes: num("max-output") ?? Infinity };
}

interface Target { file: string; text: string; opts: Pick<RunOptions, "file" | "roots" | "packages" | "entryName">; project?: Project }
function target(file: string | undefined): Target {
  const project = findProject(file ? path.dirname(path.resolve(file)) : process.cwd());
  const f = file ? path.resolve(file) : project?.main;
  if (!f) throw new PlyError("no file given and no ply.json found here — run `mycel run <file.myc>` or `ply init <name>`");
  if (!fs.existsSync(f)) throw new PlyError(`${file ?? f}: no such file`);
  const rel = path.relative(process.cwd(), f);
  const roots = project ? [project.srcDir, path.join(project.root, "tests"), path.dirname(f)] : [path.dirname(f)];
  let entryName = "main";
  if (project) {
    const r = path.relative(project.srcDir, f);
    if (withinPath(project.srcDir, f) && isSrc(r)) entryName = stripExt(r).split(path.sep).join(".");
    else entryName = "main_entry";
  }
  return { file: f, text: fs.readFileSync(f, "utf8"), project, opts: { file: rel.startsWith("..") ? f : rel, roots, packages: project?.packages, entryName } };
}

/** After compiler errors: one line naming `mycel explain <code>` (Rust's "try rustc --explain"). */
function printHint(ds: { code: string; severity: string }[]) {
  const h = explainHint(ds.filter((d) => d.severity === "error").map((d) => d.code));
  if (h) console.error("\n" + h);
}

function printFailure(r: RunResult, json: boolean) {
  if (json && r.diagnostics.length) { console.error(JSON.stringify(r.diagnostics, null, 2)); return; }
  if (r.error) console.error(r.error.human);
  if (r.error?.kind === "compile") printHint(r.diagnostics);
  for (const t of r.taskErrors) console.error("unobserved task error:\n" + t);
}

/** input(): a blocking read of one line from stdin (fd 0), so a beginner's program needs no async/await. */
let stdinRest = "";
function inputSync(): string | null {
  const buf = Buffer.alloc(4096);
  for (;;) {
    const nl = stdinRest.indexOf("\n");
    if (nl >= 0) { const line = stdinRest.slice(0, nl).replace(/\r$/, ""); stdinRest = stdinRest.slice(nl + 1); return line; }
    let n = 0;
    try { n = fs.readSync(0, buf, 0, buf.length, null); }
    catch (e: any) { if (e.code === "EAGAIN") { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); continue; } if (e.code === "EOF") n = 0; else throw e; }
    if (n === 0) { if (!stdinRest) return null; const last = stdinRest; stdinRest = ""; return last; }
    stdinRest += buf.toString("utf8", 0, n);
  }
}
const stdinReader = () => {
  let rl: readline.Interface | undefined;
  const queue: (string | null)[] = [];
  const waiters: ((v: string | null) => void)[] = [];
  return {
    readLine(): Promise<string | null> {
      if (!rl) {
        rl = readline.createInterface({ input: process.stdin });
        rl.on("line", (l) => { const w = waiters.shift(); if (w) w(l); else queue.push(l); });
        rl.on("close", () => { for (const w of waiters.splice(0)) w(null); queue.push(null); });
      }
      if (queue.length) return Promise.resolve(queue.shift()!);
      return new Promise((res) => waiters.push(res));
    },
    close() { rl?.close(); },
  };
};

// A packaged host may omit the source SDK used by JavaScript exports.
export async function main(argv: string[], options: { buildRuntime?: string | null } = {}): Promise<number> {
  // `mycel hello.myc [args]` runs the file, like `python hello.py` (no `run` needed)
  if (argv[0] && isSrc(argv[0]) && fs.existsSync(argv[0])) argv = ["run", argv[0], ...(argv.length > 1 ? ["--", ...argv.slice(1).filter((x, i) => !(i === 0 && x === "--"))] : [])];
  const a = parseArgs(argv);
  const json = a.flags.has("json");
  try {
    switch (a.cmd) {
      case "": console.log(WELCOME); return 0;
      case "help": case "--help": case "-h":
        if (a.pos[0] === "install") { console.log(INSTALL_HELP); return 0; }
        if (a.pos[0] === "habits") { console.log(HABITS_HELP); return 0; }
        console.log(options.buildRuntime === null ? HELP.replace(/^  build .*\n/m, "") : HELP); return 0;
      case "--version": case "-v": case "version": console.log(`mycel ${VERSION}`); return 0;
      case "run": {
        const t = target(a.pos[0]);
        if (a.flags.has("isolated") || a.flags.has("max-memory-mb")) {
          // worker thread with a hard heap cap and a wall-clock kill that also stops native code (no stdin in this mode)
          const mem = Number(a.flags.get("max-memory-mb") ?? 512);
          const r = await runIsolated({ source: t.text, ...t.opts, capabilities: capsFromFlags(a.flags, t.project), limits: limitsFromFlags(a.flags), onOutput: (s) => process.stdout.write(s), args: a.rest, maxMemoryMb: mem });
          if (!r.ok) printFailure(r, json);
          return r.ok ? 0 : 1;
        }
        const stdin = stdinReader();
        // if the event loop empties while the program is still awaiting, nothing can ever wake it: that is a deadlock, not success
        let finished = false;
        process.once("beforeExit", () => { if (!finished) { console.error("error: deadlock — the program is waiting for something that can never happen (e.g. receiving from a channel nobody sends to)"); process.exit(1); } });
        // std.ui has no desktop renderer in the CLI (no AppKit/Win32 backend yet): say so once instead of exiting 0 with nothing on screen
        let uiNoted = false;
        const onUi = (msg: any) => { if (uiNoted || msg?.type !== "ui:render") return; uiNoted = true; console.error(`note: this program opened a std.ui window (${JSON.stringify(String(msg.root?.title ?? ""))}); the mycel CLI has no desktop window renderer yet on ${process.platform}, so nothing is shown. Run it in the playground: https://ol1x.xyz/mycel/play/`); };
        const r = await run({ source: t.text, ...t.opts, capabilities: capsFromFlags(a.flags, t.project), limits: limitsFromFlags(a.flags), onOutput: (s) => process.stdout.write(s), args: a.rest, stdin, inputSync, onUi });
        finished = true;
        stdin.close();
        if (!r.ok) printFailure(r, json);
        else for (const w of r.taskErrors) console.error("unobserved task error:\n" + w);
        return r.ok ? 0 : 1;
      }
      case "check": {
        if (!a.pos[0]) {
          const project = findProject(process.cwd());
          if (project && !fs.existsSync(project.main)) return checkProject(project, json);
        }
        const t = target(a.pos[0]);
        const c = check({ source: t.text, ...t.opts });
        if (json) console.log(JSON.stringify(c.diagnostics, null, 2));
        else if (c.text) console.error(c.text);
        else console.log("no problems found");
        if (!json && !c.ok) printHint(c.diagnostics);
        return c.ok ? 0 : 1;
      }
      case "emit": {
        const t = target(a.pos[0]);
        const c = compile({ source: t.text, ...t.opts });
        if (!c.code) { console.error(renderDiagnostics(c.program.diagnostics)); return 1; }
        console.log(a.flags.has("all") ? c.code : c.code.slice(c.code.indexOf(`$M[${JSON.stringify(c.entry)}]`)));
        return 0;
      }
      case "build": {
        if (options.buildRuntime === null) throw new PlyError("JavaScript export requires the source SDK and Node; this standalone alpha supports `mycel run <file.myc>`.");
        const t = target(a.pos[0]);
        const c = compile({ source: t.text, ...t.opts });
        if (!c.code) { console.error(renderDiagnostics(c.program.diagnostics)); return 1; }
        const warnings = c.program.diagnostics.filter((d) => d.severity === "warning");
        if (warnings.length) console.error(renderDiagnostics(warnings));
        const name = t.project?.manifest.name ?? path.basename(stripExt(t.file));
        const outDir = path.join(t.project?.root ?? path.dirname(t.file), "build");
        fs.mkdirSync(outDir, { recursive: true });
        const out = path.join(outDir, `${name}.js`);
        const host = runtimeSpecifier(outDir, options.buildRuntime ?? path.resolve(__dirname, "host.js"));
        fs.writeFileSync(out, `#!/usr/bin/env node\n// Built by mycel ${VERSION}. Needs the Mycel runtime at ${host} (relative to this file).\nconst { runBundle } = require(${JSON.stringify(host)});\nrunBundle(${JSON.stringify(toBundle(c))}, process.argv.slice(2));\n`);
        fs.chmodSync(out, 0o755);
        console.log(`built ${path.relative(process.cwd(), out)}`);
        return 0;
      }
      case "explain": {
        if (!a.pos[0]) { console.log(explainList()); return 0; }
        const text = explain(a.pos[0]);
        if (!text) { console.error(explainUnknown(a.pos[0])); return 1; }
        console.log(text);
        return 0;
      }
      case "lsp": {
        // Editor language server (lsp/server.js, stdio JSON-RPC). It exits itself on `exit`/stdin end, so never resolve:
        // main()'s process.exit would otherwise kill it as soon as it starts.
        return new Promise<number>(() => { require(path.join(__dirname, "..", "..", "lsp", "server.js")).serve(process.stdin); });
      }
      case "doc": {
        const project = findProject(process.cwd());
        let files = a.pos.map((p) => path.resolve(p));
        if (!files.length) {
          if (!project) throw new PlyError("no files given and no ply.json found");
          files = listFilesRec(project.srcDir).filter(isSrc).map((f) => path.join(project.srcDir, f));
        }
        const outDir = typeof a.flags.get("out") === "string" ? path.resolve(a.flags.get("out") as string) : undefined;
        if (outDir) fs.mkdirSync(outDir, { recursive: true });
        for (const f of files) {
          const rel = project ? path.relative(project.srcDir, f) : path.basename(f);
          const name = stripExt(rel).split(path.sep).join(".");
          const md = documentModule(fs.readFileSync(f, "utf8"), name, path.relative(process.cwd(), f), a.flags.has("all"));
          if (outDir) fs.writeFileSync(path.join(outDir, name + ".md"), md); else process.stdout.write(md + "\n");
        }
        return 0;
      }
      case "test": return await runTests(a);
      case "fmt": return doFmt(a);
      case "migrate": {
        // Rewrites old "$\\{x}" strings to f"{x}" in place (files or directories, .olx and .myc).
        let n = 0;
        const visit = (f: string) => {
          if (fs.statSync(f).isDirectory()) { for (const e of fs.readdirSync(f)) if (e !== "node_modules" && !e.startsWith(".")) visit(path.join(f, e)); return; }
          if (!/\.(olx|myc)$/.test(f)) return;
          const t = fs.readFileSync(f, "utf8"), o = migrateSource(t);
          if (o !== t) { fs.writeFileSync(f, o); n++; console.log(`migrated ${path.relative(process.cwd(), f)}`); }
        };
        for (const p of a.pos.length ? a.pos : ["."]) visit(path.resolve(p));
        console.log(`${n} file(s) migrated`);
        return 0;
      }
      case "repl": return await startRepl({ capabilities: capsFromFlags(a.flags) });
      case "new": case "init": {
        if (!a.pos[0]) throw new PlyError("usage: mycel new <name>");
        const dir = path.resolve(a.pos[0]);
        initProject(dir, path.basename(dir));
        console.log(`created ${a.pos[0]}/ — try:\n  cd ${a.pos[0]} && mycel run && mycel test`);
        return 0;
      }
      case "add": case "install": case "remove": case "update": case "why": return pkgCommand(a.cmd, argv.slice(1));
      case "publish": {
        const root = findProject(process.cwd())?.root;
        if (!root) throw new PlyError("no ply.json found: run this inside a project");
        const project = findProject(process.cwd())!;
        if (checkProject(project, false, true) !== 0) throw new PlyError("fix the errors above before publishing");
        const p = publish(root);
        console.log(`published ${p.name}@${p.version} to ${p.dest}`);
        return 0;
      }
      default:
        { const near = closest(a.cmd, ["run", "check", "test", "build", "migrate", "fmt", "repl", "new", "init", "doc", "emit", "explain", "help", "install", "remove", "update", "why", "publish"]); console.error(`mycel: unknown command "${a.cmd}"${near ? ` — did you mean \`${near}\`?` : ""} (see \`mycel help\`)`); }
        return 2;
    }
  } catch (e) {
    if (e instanceof PlyError) { console.error(`ply: ${e.message}`); return 1; }
    if (e instanceof CompileError) { console.error(json ? JSON.stringify(e.diagnostics.map((d) => d), null, 2) : e.message); return 1; }
    throw e;
  }
}

/** Type-check every module under src/ (libraries have no main file). */
/** `ply install|add|remove|update|why [--<lang>] [packages]` (WO111 item 9; table in pkgflags.ts). */
function pkgCommand(cmd: string, args: string[]): number {
  const req: PkgRequest = parsePkgArgs(cmd === "add" ? "install" : cmd, args);
  if (cmd === "add" && !req.packages.length) throw new PlyError("usage: ply install <package>  (or ply install --<lang> <package>, see `ply help install`)");
  const root = findProject(process.cwd())?.root;
  if (!root) throw new PlyError("no ply.json found: run this inside a project (`mycel new <name>` makes one)");
  if (req.runtime) {
    // The flag table, versions and errors are final; fetching foreign packages is WO111 phase B (py/npm first).
    console.error(`ply: understood: ${cmd} ${runtimeLabel(req.runtime)} package${req.packages.length > 1 ? "s" : ""} ${req.packages.map((p) => p.name + (p.version ? ` ${p.version}` : "")).join(", ")}.\n  ${cmd === "install" || cmd === "add" ? "Installing" : "Managing"} ${runtimeLabel(req.runtime)} packages is not available yet (Mycel phase B) — nothing was changed.`);
    return 2;
  }
  const withHint = (f: () => void) => { try { f(); } catch (e) { if (e instanceof PlyError && /not found in the registry/.test(e.message)) throw new PlyError(`${e.message}\n  ${FOREIGN_HINT}`); throw e; } };
  switch (cmd) {
    case "add": case "install": {
      if (!req.packages.length) {
        const lock = install(root);
        const problems = verifyLock(root);
        if (problems.length) throw new PlyError(problems.join("\n"));
        console.log(`installed ${Object.keys(lock.packages).length} package(s)`);
        return 0;
      }
      for (const p of req.packages) withHint(() => { const r = addDependency(root, p.version ? `${p.name}@${p.version}` : p.name); console.log(`added ${r.name} ${r.range}`); });
      return 0;
    }
    case "remove": {
      if (!req.packages.length) throw new PlyError("usage: ply remove <package>");
      for (const p of req.packages) { removeDependency(root, p.name); console.log(`removed ${p.name}`); }
      return 0;
    }
    case "update": {
      const lock = install(root);
      console.log(`updated: ${Object.entries(lock.packages).map(([n, e]) => `${n} ${e.version}`).join(", ") || "no packages"}`);
      return 0;
    }
    default: { // why
      if (!req.packages.length) throw new PlyError("usage: ply why <package>");
      const m = readManifest(root);
      const lf = path.join(root, "ply.lock");
      const lock = fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, "utf8")) as { packages: Record<string, { version: string; dependencies?: Record<string, string> }> } : { packages: {} };
      for (const p of req.packages) {
        const e = lock.packages[p.name];
        if (!e) throw new PlyError(`"${p.name}" is not installed in ${m.name}`);
        const by = Object.entries(lock.packages).filter(([, x]) => x.dependencies && p.name in x.dependencies).map(([n, x]) => `${n}@${x.version}`);
        const direct = m.dependencies && p.name in m.dependencies ? [`${m.name} (ply.json: ${m.dependencies[p.name]})`] : [];
        console.log(`${p.name}@${e.version} is needed by: ${[...direct, ...by].join(", ")}`);
      }
      return 0;
    }
  }
}

function checkProject(project: Project, json: boolean, quiet = false): number {
  let errors = 0;
  const all: unknown[] = [];
  for (const f of listFilesRec(project.srcDir)) {
    if (!isSrc(f)) continue;
    const file = path.join(project.srcDir, f);
    const name = stripExt(f).split(path.sep).join(".");
    const c = check({ source: fs.readFileSync(file, "utf8"), file: path.relative(process.cwd(), file), roots: [project.srcDir], packages: project.packages, entryName: name });
    errors += c.errors;
    all.push(...c.diagnostics);
    if (!json && c.text) console.error(c.text);
  }
  if (json) console.log(JSON.stringify(all, null, 2));
  else if (!errors && !quiet) console.log("no problems found");
  return errors ? 1 : 0;
}

async function runTests(a: Parsed): Promise<number> {
  const project = findProject(process.cwd());
  const files: string[] = [];
  const filter = a.pos[0] && !fs.existsSync(a.pos[0]) ? a.pos[0] : undefined;
  if (a.pos[0] && fs.existsSync(a.pos[0])) files.push(path.resolve(a.pos[0]));
  else if (project) for (const d of ["src", "tests"]) { const dir = path.join(project.root, d); if (fs.existsSync(dir)) for (const f of listFilesRec(dir)) if (isSrc(f)) files.push(path.join(dir, f)); }
  else throw new PlyError("no ply.json found: pass a file, `mycel test file.myc`");
  let pass = 0, fail = 0;
  const caps = capsFromFlags(a.flags, project);
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!/^\s*test\s+"/m.test(text)) continue;
    const t = target(f);
    const r = await run({ source: text, ...t.opts, entryName: t.opts.entryName === "main" ? "main" : t.opts.entryName, capabilities: caps, limits: limitsFromFlags(a.flags), onOutput: () => {}, mode: "test", testFilter: filter });
    if (r.error?.kind === "compile") { console.error(r.error.human); fail++; continue; }
    for (const tr of r.tests ?? []) {
      if (tr.ok) { pass++; console.log(`  ok    ${path.basename(f)}: ${tr.name} (${tr.millis} ms)`); }
      else { fail++; console.log(`  FAIL  ${path.basename(f)}: ${tr.name}`); console.log(tr.message!.split("\n").map((l) => "        " + l).join("\n")); }
    }
    if (r.error && (r.error.kind as string) !== "compile") { console.error(r.error.human); fail++; }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  return fail ? 1 : 0;
}

function doFmt(a: Parsed): number {
  const project = findProject(process.cwd());
  let files = a.pos.map((p) => path.resolve(p));
  if (!files.length) {
    if (!project) throw new PlyError("no files given and no ply.json found");
    for (const d of ["src", "tests"]) { const dir = path.join(project.root, d); if (fs.existsSync(dir)) for (const f of listFilesRec(dir)) if (isSrc(f)) files.push(path.join(dir, f)); }
  }
  const checkOnly = a.flags.has("check");
  let changed = 0, failed = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    try {
      const out = format(a.flags.has("fix") ? migrateSource(text) : text, path.relative(process.cwd(), f));
      if (out !== text) { changed++; if (checkOnly) console.log(`would reformat ${path.relative(process.cwd(), f)}`); else fs.writeFileSync(f, out); }
    } catch (e) {
      failed++;
      console.error(e instanceof CompileError ? e.diagnostics.map(formatDiagnostic).join("\n") : (e as Error).message);
    }
  }
  console.log(`${changed} file(s) ${checkOnly ? "need formatting" : "reformatted"}, ${files.length - changed - failed} already formatted${failed ? `, ${failed} could not be parsed` : ""}`);
  return failed || (checkOnly && changed) ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e?.stack ?? e); process.exit(70); });
}
export { execute, fromBundle, Bundle };
