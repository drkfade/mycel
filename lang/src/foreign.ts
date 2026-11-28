/**
 * Packages from Python and npm (task 55). `ply install requests --python` records the package, its pinned version,
 * hashes and the modules it PROVIDES in ply.lock ("foreign"); `import requests` then resolves from there:
 *
 *   import requests                 the runtime comes from ply.lock (flag optional when exactly one runtime has it)
 *   import numpy as np --python     a runtime flag (same table as `ply install`) may stand anywhere in the statement
 *   from requests import get        Python's form
 *   import "@scope/pkg" as x        a name that is not an identifier is quoted and needs `as`
 *
 * Each foreign module becomes a generated Mycel module ("binding", cached under .ply/bindings/) whose functions call
 * std.foreign.callModule. Calls are refused unless ply.json grants the package (capabilities.packages) — a package
 * runs with the full power of the user's account, so granting it is a trust decision, not a sandbox.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import * as A from "./ast";
import { Diagnostic, closest } from "./diag";
import { KEYWORDS } from "./lexer";
import { RUNTIMES, runtimeLabel, Runtime } from "./pkgflags";
import { Panic, Runtime as Rt, I64_MIN, I64_MAX, PlyRange, kindOf, display } from "./runtime";
import { PyBridge } from "./pybridge";
import { SyncJavaBridge } from "./bridges";

export type FRuntime = "python" | "npm" | "java";
export const FRUNTIMES: FRuntime[] = ["python", "npm", "java"];
export interface ForeignPkg {
  version: string;
  /** importable modules/packages this package provides */
  provides: string[];
  /** listed in ply.json (false = installed as a dependency of one) */
  direct: boolean;
  /** python/java: sha256 hashes of the archive; npm: npm's integrity (sha512) */
  hashes?: string[];
  integrity?: string;
  /** where it came from (index URL, file:..., registry tarball, jar filename) */
  url?: string;
  /** names of the packages it depends on */
  requires?: string[];
}
export interface ForeignLock { python?: Record<string, ForeignPkg>; npm?: Record<string, ForeignPkg>; npmLock?: Record<string, unknown>; java?: Record<string, ForeignPkg> }
export interface ForeignInfo { root: string; lock: ForeignLock; /** where generated bindings are cached */ cacheDir: string }

export const TOOLS_DIR = path.resolve(__dirname, "..", "..", "tools");
/** A helper script as a real file a child process can run. In the packaged release the scripts are embedded
 *  (release/bundle.mjs serves them to fs.readFileSync only), so they are written once to a hashed temp path. */
export function toolFile(name: string): string {
  const p = path.join(TOOLS_DIR, name);
  try { if (fs.statSync(p).isFile()) return p; } catch { /* embedded */ }
  const text = fs.readFileSync(p, "utf8");
  const dir = path.join(os.tmpdir(), `mycel-tools-${crypto.createHash("sha256").update(text).digest("hex").slice(0, 12)}`);
  const out = path.join(dir, name);
  if (!fs.existsSync(out)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(out + ".tmp", text); fs.renameSync(out + ".tmp", out); }
  return out;
}
export const label = (r: FRuntime) => (r === "python" ? "Python" : r === "java" ? "Java" : "npm");
export const flagOf = (r: FRuntime) => (r === "python" ? "--python" : r === "java" ? "--java" : "--npm");
const venvPython = (root: string) => {
  const v = path.join(root, ".ply", "python", "venv");
  const p = process.platform === "win32" ? path.join(v, "Scripts", "python.exe") : path.join(v, "bin", "python");
  return fs.existsSync(p) ? p : undefined;
};
export const pythonFor = (root: string | undefined) => (root && venvPython(root)) || process.env.PLY_PYTHON || (process.platform === "win32" ? "python" : "python3");
export const nodeDir = (root: string) => path.join(root, ".ply", "node");
export const isJavaJdk = (mod: string) => /^(?:java|javax|jdk|org\.w3c\.dom|org\.xml\.sax)(?:\.|$)/.test(mod);

/** The project's foreign packages; a loose file (no ply.json) can still use Python's stdlib or Java's JDK with a flag. */
export function readForeign(root: string, loose = false): ForeignInfo {
  let lock: ForeignLock = {};
  if (!loose) try { lock = (JSON.parse(fs.readFileSync(path.join(root, "ply.lock"), "utf8")).foreign ?? {}) as ForeignLock; } catch { /* no lock yet */ }
  return { root, lock, cacheDir: loose ? path.join(os.tmpdir(), "mycel-bindings") : path.join(root, ".ply", "bindings") };
}

/** Which installed package provides module/class `mod` for a runtime. */
export function providerOf(info: ForeignInfo, rt: FRuntime, mod: string): string | undefined {
  if (rt === "java") {
    const pkg = mod.includes(".") ? mod.slice(0, mod.lastIndexOf(".")) : mod;
    for (const [name, p] of Object.entries(info.lock.java ?? {})) {
      if (p.provides.some((pr) => mod === pr || pkg === pr || mod.startsWith(pr + "."))) return name;
    }
    return undefined;
  }
  const top = rt === "npm" ? npmTop(mod) : mod.split(".")[0];
  for (const [name, p] of Object.entries(info.lock[rt] ?? {})) if (p.provides.includes(top)) return name;
  return undefined;
}
const npmTop = (m: string) => (m.startsWith("@") ? m.split("/").slice(0, 2).join("/") : m.split("/")[0]);

// ---------------------------------------------------------------- import resolution ----------
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isIdent = (s: string) => IDENT.test(s) && !KEYWORDS.has(s);
const runtimeOfFlag = (f: string): Runtime | undefined => RUNTIMES.find((r) => r.flags.includes(f))?.runtime;
export const internalName = (rt: FRuntime, mod: string) => `${rt}:${mod}`;

/**
 * Rewrite the foreign imports of one parsed module to their bindings (`python:requests`), or report what to type.
 * `mycelHas(name)` says whether a Mycel module (std, project, package) of that dotted name exists; Mycel wins
 * when no flag is given.
 */
export function resolveForeignImports(ast: A.Module, info: ForeignInfo | undefined, mycelHas: (name: string) => boolean): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const err = (d: A.Decl, message: string, suggestion: string, why?: string) => diags.push({ severity: "error", code: "E0207", message, span: (d as any).flag?.span ?? d.span, suggestion, why });
  for (const d of ast.decls) {
    if (d.k !== "import") continue;
    const modPath = d.path.join(".");
    const shownImport = (fl: string) => `${d.fromForm ? `from ${q(d)} import ${(d.names ?? []).map((n) => n.name + (n.alias ? ` as ${n.alias}` : "")).join(", ") || "*"}` : `import ${q(d)}${d.alias ? ` as ${d.alias}` : ""}`} ${fl}`;
    let rt: FRuntime | undefined;
    if (d.flag) {
      if (d.flag.nonTrailing) {
        err(d, `runtime flags go at the end of the import (move \`--${d.flag.name}\`)`, shownImport(`--${d.flag.name}`));
        continue;
      }
      const r = runtimeOfFlag(d.flag.name);
      if (!r) {
        const near = closest(d.flag.name, RUNTIMES.flatMap((x) => x.flags));
        err(d, `unknown runtime flag \`--${d.flag.name}\`${near ? ` — did you mean \`--${near}\`?` : ""}`, "the flags are the same as `ply install`: --python (--py --pip), --npm (--js), --java (--maven --mvn), --ts, --rust, --go, --swift");
        continue;
      }
      if (r !== "python" && r !== "javascript" && r !== "java") {
        err(d, `${runtimeLabel(r)} packages are recognised but not supported yet`, "Python (--python), npm (--npm), and Java (--java) packages work today", "only Python, npm, and Java imports can run in this version");
        continue;
      }
      rt = r === "python" ? "python" : r === "java" ? "java" : "npm";
    }
    // Mycel's own modules take no flag; foreign imports must ALWAYS end with --<lang>
    if (!rt && !d.quoted && (mycelHas(modPath) || (d.path.length > 1 && mycelHas(d.path.slice(0, -1).join("."))))) continue;
    if (!rt) {
      if (d.quoted) {
        err(d, `foreign import \`"${modPath}"\` must end with its runtime flag`, shownImport("--npm"));
        continue;
      }
      if (info) {
        const have = FRUNTIMES.filter((r) => providerOf(info, r, modPath));
        if (have.length > 1) { err(d, `\`${modPath}\` is installed for ${have.map(label).join(" and ")}`, `end the import with its runtime flag:\n  ${have.map((r) => shownImport(flagOf(r))).join("\n  ")}`); continue; }
        if (have.length === 1) { err(d, `foreign import \`${modPath}\` must end with \`${flagOf(have[0])}\``, shownImport(flagOf(have[0]))); continue; }
        // installed under another name? (`import pillow` when pillow provides PIL) — from the recorded mapping
        let foundDist = false;
        for (const r of FRUNTIMES) {
          const nm = (x: string) => x.toLowerCase().replace(/[-_.]+/g, "_");
          const p = info.lock[r]?.[d.path[0]] ?? Object.entries(info.lock[r] ?? {}).find(([n]) => nm(n) === nm(d.path[0]))?.[1];
          if (p && p.provides.length) {
            err(d, `\`${d.path[0]}\` is installed, but it is imported as \`${p.provides[0]}\``, `import ${p.provides[0]} ${flagOf(r)}${p.provides.length > 1 ? `   (it provides: ${p.provides.join(", ")})` : ""}`);
            foundDist = true; break;
          }
        }
        if (foundDist) continue;
      }
      if (isJavaJdk(modPath)) { err(d, `Java imports must end with \`--java\``, shownImport("--java")); continue; }
      continue; // the checker reports "cannot find module" for unknown Mycel modules
    }
    const have = FRUNTIMES.filter((r) => info && providerOf(info, r, modPath));
    if (!have.includes(rt)) {
      const other = have.find((r) => r !== rt);
      const top = d.path[0];
      const stdlibPython = rt === "python" && !d.quoted && pythonStdlib().has(top);
      const jdkJava = rt === "java" && !d.quoted && isJavaJdk(modPath);
      if (!stdlibPython && !jdkJava) {
        if (other) err(d, `\`${modPath}\` is installed for ${label(other)}, not ${label(rt)}`, `${shownImport(flagOf(other))}   (or install it: ply install ${top} ${flagOf(rt)})`);
        else err(d, `\`${modPath}\` is not installed for ${label(rt)}`, `install it with: ply install ${rt === "npm" ? npmTop(modPath) : rt === "java" ? "<group:artifact>" : top} ${flagOf(rt)}`);
        continue;
      }
    }
    if (d.quoted && !d.alias && !d.names && !d.all) { err(d, `\`"${modPath}"\` is not a name you can use in code`, `give it one: import "${modPath}" as ${suggestAlias(modPath)} ${flagOf(rt)}`); continue; }
    const last = rt === "npm" ? modPath.split("/").pop()! : d.path[d.path.length - 1];
    if (!d.alias && !d.names && !d.all && !isIdent(last)) { err(d, `\`${last}\` is not a name you can use in code`, `give it one: import ${q(d)} as ${suggestAlias(last)} ${flagOf(rt)}`); continue; }
    (d as any).foreign = { runtime: rt, module: modPath };
    d.alias = d.alias ?? (d.names || d.all ? undefined : last);
    d.path = [internalName(rt, modPath)];
  }
  return diags;
}
const q = (d: Extract<A.Decl, { k: "import" }>) => (d.quoted ? JSON.stringify(d.path.join(".")) : d.path.join("."));
export const suggestAlias = (s: string) => { const w = s.split(/[^A-Za-z0-9]+/).filter(Boolean); const id = w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x)).join(""); return /^[A-Za-z_]/.test(id) && !KEYWORDS.has(id) ? id : "pkg"; };

let stdlibCache: Set<string> | undefined;
/** Python's own standard library (`from datetime import datetime --python` needs no install). */
export function pythonStdlib(): Set<string> {
  if (stdlibCache) return stdlibCache;
  const pyCode = 'import sys,json,pkgutil,os;n=getattr(sys,"stdlib_module_names",None) or (set(sys.builtin_module_names)|{m.name for m in pkgutil.iter_modules([os.path.dirname(os.__file__),os.path.join(os.path.dirname(os.__file__),"lib-dynload")])});print(json.dumps(sorted(n)))';
  const r = spawnSync(pythonFor(undefined), ["-c", pyCode], { encoding: "utf8", timeout: 10000 });
  try { stdlibCache = new Set(JSON.parse(r.stdout)); } catch { stdlibCache = new Set(); }
  return stdlibCache;
}

// ---------------------------------------------------------------- bindings ----------
interface Member { name: string; kind: "fn" | "class" | "module" | "value"; params?: { name: string; kind: string; default: boolean }[] | null; arity?: number }

/** The Mycel source of `python:requests` / `npm:lodash`: generated from the installed package, cached by version. */
export function bindingSource(info: ForeignInfo, name: string): string | undefined {
  const i = name.indexOf(":");
  const rt = name.slice(0, i) as FRuntime, mod = name.slice(i + 1);
  if (!FRUNTIMES.includes(rt)) return undefined;
  const pkg = providerOf(info, rt, mod) ?? (rt === "python" ? mod.split(".")[0] : rt === "java" && isJavaJdk(mod) ? "jdk" : undefined);
  if (!pkg) return undefined;
  const version = info.lock[rt]?.[pkg]?.version ?? (rt === "java" ? "jdk" : "stdlib");
  const jarDir = rt === "java" ? path.join(info.root, ".ply", "java") : "";
  const jarsKey = rt === "java" && fs.existsSync(jarDir) ? fs.readdirSync(jarDir).filter((x) => x.endsWith(".jar")).sort().join(",") : "";
  const key = crypto.createHash("sha256").update(`${rt}\0${pkg}\0${version}\0${mod}\0${rt === "python" ? pythonFor(info.root) : jarsKey}\0v3`).digest("hex").slice(0, 16);
  const file = path.join(info.cacheDir, rt, `${encodeURIComponent(mod)}.myc`);
  try { const t = fs.readFileSync(file, "utf8"); if (t.includes(`# ply-binding ${key}`)) return t; } catch { /* generate */ }
  const intro = introspect(info.root, rt, [mod])[mod];
  const src = generateBinding(rt, pkg, mod, version, key, intro);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, src); } catch { /* read-only project: still usable */ }
  return src;
}

export function introspect(root: string, rt: FRuntime, mods: string[]): Record<string, { members?: Member[]; self?: string; error?: string }> {
  if (rt === "npm") return npmIntrospect(nodeDir(root), mods);
  if (rt === "java") return javaIntrospect(root, mods);
  const r = spawnSync(pythonFor(root), [toolFile("pyintrospect.py"), ...mods], { cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 64 << 20 });
  try { return JSON.parse(r.stdout); } catch { return Object.fromEntries(mods.map((m) => [m, { error: (r.error?.message ?? r.stderr ?? "").trim().split("\n").pop() || "could not read the package" }])); }
}

function javaIntrospect(root: string, mods: string[]): Record<string, { members?: Member[]; self?: string; error?: string }> {
  const jarDir = path.join(root, ".ply", "java");
  const jars = fs.existsSync(jarDir) ? fs.readdirSync(jarDir).filter((x) => x.endsWith(".jar")).sort().map((x) => path.join(jarDir, x)) : [];
  const cpArgs = jars.length ? ["-cp", jars.join(path.delimiter)] : [];
  const r = spawnSync("javap", ["-public", ...cpArgs, ...mods], { cwd: root, encoding: "utf8", timeout: 15000 });
  const out: Record<string, { members?: Member[]; self?: string; error?: string }> = {};
  const text = r.stdout ?? "";
  if (r.status !== 0 && !text.trim()) {
    const errMsg = (r.error?.message ?? r.stderr ?? "").trim().split("\n").pop() || "could not inspect Java class";
    for (const m of mods) out[m] = { self: "class", error: errMsg, members: [] };
    return out;
  }
  const seen = new Map<string, Member>();
  let hasCtor = false;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("Compiled from")) continue;
    const sm = /\bstatic\b.*?\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(l);
    if (sm) {
      if (!seen.has(sm[1])) seen.set(sm[1], { name: sm[1], kind: "fn" });
      continue;
    }
    const sf = /\bstatic\b[^({]*?\b([A-Za-z_$][A-Za-z0-9_$]*)\s*;/.exec(l);
    if (sf) {
      if (!seen.has(sf[1])) seen.set(sf[1], { name: sf[1], kind: "value" });
      continue;
    }
    if (/^public\s+[A-Za-z0-9_$.]+\(/.test(l)) hasCtor = true;
  }
  for (const m of mods) out[m] = { self: hasCtor || seen.size === 0 ? "class" : "value", members: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  return out;
}

/** In-process: the package is loaded into this process at call time anyway, and in the packaged release
 *  process.execPath is mycel itself, so there is no `node` to spawn. */
function npmIntrospect(dir: string, mods: string[]): Record<string, { members?: Member[]; self?: string; error?: string }> {
  const req = createRequire(path.join(dir, "package.json"));
  const out: Record<string, { members?: Member[]; self?: string; error?: string }> = {};
  for (const m of mods) {
    try {
      let mod = req(m);
      if (mod && mod.__esModule && mod.default !== undefined && Object.keys(mod).length === 1) mod = mod.default;
      const members: Member[] = [];
      if (mod !== null && (typeof mod === "object" || typeof mod === "function")) {
        for (const k of Object.keys(mod).sort()) {
          if (k.startsWith("_")) continue;
          let v: unknown; try { v = mod[k]; } catch { continue; }
          members.push({ name: k, kind: isJsClass(v) ? "class" : typeof v === "function" ? "fn" : "value", arity: typeof v === "function" ? (v as Function).length : 0 });
        }
      }
      out[m] = { self: typeof mod === "function" ? (isJsClass(mod) ? "class" : "fn") : "value", members };
    } catch (e: any) { out[m] = { error: `${e?.name ?? "Error"}: ${e?.message ?? e}` }; }
  }
  return out;
}

export function generateBinding(rt: FRuntime, pkg: string, mod: string, version: string, key: string, intro: { members?: Member[]; self?: string; error?: string } | undefined): string {
  const L: string[] = [
    `# ${label(rt)} module ${mod} (package ${pkg} ${version}) — generated by ply, do not edit`,
    `# ply-binding ${key}`,
    `import foreign`,
    ``,
  ];
  const head = (n: string) => `foreign.callModule(${JSON.stringify(rt)}, ${JSON.stringify(pkg)}, ${JSON.stringify(mod)}, ${JSON.stringify(n)}`;
  const R = "foreign.Value";
  const used = new Set<string>();
  if (intro?.error) L.push(`# could not read the module's names (${intro.error.replace(/\n/g, " ")}); use module().attr("name")`);
  const skipped: string[] = [];
  for (const m of intro?.members ?? []) {
    if (!isIdent(m.name) || m.name === "module") { skipped.push(m.name); continue; }
    used.add(m.name);
    if (m.kind === "value" || m.kind === "module") { L.push(`## ${m.kind === "module" ? "submodule" : "value"} ${m.name}`, `pub fn ${m.name}() -> ${R} => ${head(m.name)}, [], [], {}, [], false)`); continue; }
    L.push(`pub fn ${m.name}(${sig(rt, m, head(m.name))}`);
  }
  if (intro?.self === "fn" || intro?.self === "class" || rt === "java") L.push(`## construct or invoke this class/function`, `pub fn call(named: {String: Any} = {}, ...args: Any) -> ${R} => ${head("()")}, [], [], named, args, true)`);
  if (skipped.length) L.push(`# not callable by name from Mycel (not identifiers): ${skipped.slice(0, 40).join(", ")} — use module().attr("name")`);
  L.push(`## the module/class itself, for anything not listed above: module().attr("name")`, `pub fn module() -> ${R} => ${head("")}, [], [], {}, [], false)`);
  return L.join("\n") + "\n";

  function sig(rt: FRuntime, m: Member, call: string): string {
    const generic = `named: {String: Any} = {}, ...args: Any) -> ${R} => ${call}, [], [], named, args, true)`;
    if (rt === "npm" || rt === "java" || !m.params) return generic;
    const ps: string[] = [], vals: string[] = [], names: string[] = [];
    let hasVar = false, hasVarKw = false, needNamed = false;
    const taken = new Set<string>();
    for (const p of m.params) {
      if (p.kind === "var") { hasVar = true; continue; }
      if (p.kind === "varkw") { hasVarKw = true; continue; }
      const ok = isIdent(p.name) && !["named", "rest"].includes(p.name);
      if (!ok) { if (p.default || p.kind === "kwonly") { needNamed = true; continue; } if (p.kind === "posonly" || p.kind === "pos") { const n = `arg${ps.length + 1}`; ps.push(`${n}: Any`); vals.push(n); names.push("/" + n); taken.add(n); continue; } return generic; }
      // with *args, positional values fill in order, so named-only parameters move to `named:`
      if (p.kind === "kwonly" && m.params.some((x) => x.kind === "var")) { needNamed = true; continue; }
      ps.push(`${p.name}: Any${p.default || p.kind === "kwonly" ? " = foreign.unset()" : ""}`);
      vals.push(p.name); names.push((p.kind === "posonly" ? "/" : p.kind === "kwonly" ? "*" : "") + p.name);
      taken.add(p.name);
    }
    if (hasVarKw || needNamed) ps.push(`named: {String: Any} = {}`);
    if (hasVar) ps.push(`...rest: Any`);
    return `${ps.join(", ")}) -> ${R} => ${call}, [${vals.join(", ")}], ${JSON.stringify(names)}, ${hasVarKw || needNamed ? "named" : "{}"}, ${hasVar ? "rest" : "[]"}, ${hasVar})`;
  }
}

// ---------------------------------------------------------------- values + natives ----------
const UNSET = Object.freeze({ $unset: true });
/** Never reachable from Mycel on a JavaScript value: the routes from any object to Function/eval. Defence in depth
 *  only — a granted package already runs with the user's power. */
const JS_BLOCKED = new Set(["constructor", "__proto__", "prototype", "caller", "callee", "arguments"]);
const jsBlocked = (n: string) => JS_BLOCKED.has(n) || n.startsWith("__");

export interface PyOps {
  req(msg: Record<string, unknown>): any;
  fromPy(v: any): any;
  fail(msg: string): never;
}
export interface JavaOps {
  req(op: string, fields: Record<string, unknown>): any;
  fromJava(v: any): any;
  toJava(v: any): any;
  fail(msg: string): never;
}

/** A foreign value. Python: tagged JSON data or handle ({$h}); npm: JS value; Java: handle ({$h, type}). */
export class FValue {
  constructor(readonly rt: FRuntime, readonly v: any, readonly bridge?: PyBridge, readonly pyOps?: PyOps, readonly javaOps?: JavaOps) {}
  toString_(): string { return valueString(this); }
  $eq(other: any): boolean {
    if (other instanceof FValue) {
      if (this.rt !== other.rt) return false;
      if (this.rt === "java") return this.v?.$h === other.v?.$h && this.v?.$h !== undefined;
      const th = pyTag(this.v)?.$h, oh = pyTag(other.v)?.$h;
      if (th !== undefined && oh !== undefined) return th === oh;
      return this.v === other.v;
    }
    if (this.rt === "python" && typeof other === "bigint") {
      const s = pyTag(this.v)?.$i;
      return s !== undefined && BigInt(s) === other;
    }
    if (this.rt === "npm" && typeof other === "bigint" && typeof this.v === "bigint") return this.v === other;
    return false;
  }
  $num(): any {
    if (this.rt === "python") {
      const t = pyTag(this.v);
      if (t?.$i !== undefined) { const b = BigInt(t.$i); return b >= I64_MIN && b <= I64_MAX ? b : Number(t.$i); }
      if (t?.$f !== undefined) return typeof t.$f === "number" ? t.$f : t.$f === "nan" ? NaN : t.$f === "inf" ? Infinity : -Infinity;
    }
    if (this.rt === "npm" && (typeof this.v === "number" || typeof this.v === "bigint")) return this.v;
    return this;
  }
  *[Symbol.iterator](): Iterator<any> {
    if (this.rt === "python") {
      if (Array.isArray(this.v)) { for (const x of this.v) yield this.pyOps ? this.pyOps.fromPy(x) : x; return; }
      const t = pyTag(this.v);
      if (t?.$d) { for (const k of Object.keys(t.$d)) yield k; return; }
      if (t?.$h !== undefined && this.pyOps) {
        const it = this.pyOps.req({ op: "iter", h: t.$h });
        const ih = pyTag(it)?.$h;
        if (ih === undefined) return;
        for (;;) {
          const step = this.pyOps.req({ op: "next", h: ih });
          if (!Array.isArray(step) || !step[0]) break;
          yield this.pyOps.fromPy(step[1]);
        }
        return;
      }
      throw new Panic(`Python ${t?.$t ?? "object"} is not iterable`);
    }
    if (this.rt === "java") {
      if (this.v?.$h !== undefined && this.javaOps) {
        const items = this.javaOps.req("iter", { target: { $h: this.v.$h }, max: 100000 });
        for (const x of Array.isArray(items) ? items : []) yield this.javaOps.fromJava(x);
        return;
      }
      throw new Panic(`Java ${this.v?.type ?? "object"} is not iterable`);
    }
    if (Array.isArray(this.v) || (this.v && typeof this.v[Symbol.iterator] === "function")) {
      for (const x of this.v) yield fromJsVal(x);
      return;
    }
    throw new Panic(`JavaScript ${jsTypeName(this.v)} is not iterable`);
  }
  /** len(value) on foreign data or Python/JS/Java collection handles */
  get length(): bigint | undefined {
    const v = this.v;
    if (typeof v === "string") return BigInt([...v].length);
    if (Array.isArray(v)) return BigInt(v.length);
    if (this.rt === "python") {
      const t = pyTag(v);
      if (t?.$d) return BigInt(Object.keys(t.$d).length);
      if (t?.$h !== undefined && this.pyOps) {
        const n = this.pyOps.req({ op: "len", h: t.$h });
        const s = pyTag(n)?.$i ?? n;
        return typeof s === "bigint" ? s : typeof s === "string" || typeof s === "number" ? BigInt(s) : undefined;
      }
      return undefined;
    }
    if (this.rt === "java") {
      if (v?.$h !== undefined && this.javaOps) {
        try { const n = this.javaOps.req("call", { target: { $h: v.$h }, name: "size", args: [] }); return typeof n === "number" ? BigInt(n) : typeof n === "bigint" ? n : BigInt(n.$int ?? 0); } catch { /* not Collection/Map */ }
        try { const n = this.javaOps.req("call", { target: { $h: v.$h }, name: "length", args: [] }); return typeof n === "number" ? BigInt(n) : typeof n === "bigint" ? n : BigInt(n.$int ?? 0); } catch { /* not CharSequence */ }
      }
      return undefined;
    }
    if (v && typeof v.size === "number") return BigInt(v.size);
    if (v && typeof v.length === "number") return BigInt(v.length);
    const d = isPlainObj(v) ? v : undefined;
    return d ? BigInt(Object.keys(d).length) : undefined;
  }
}
/** A JavaScript class can only be called with `new` (Python has no such split, so Mycel code never says it). */
const isJsClass = (f: any) => typeof f === "function" && /^class[\s{]/.test(Function.prototype.toString.call(f));
const callJs = (f: any, self: any, args: any[]) => (isJsClass(f) ? new f(...args) : f.apply(self, args));
const isPlainObj = (o: any) => o !== null && typeof o === "object" && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const pyTag = (v: any) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined);
const jsTypeName = (v: any) => (v === null ? "null" : Array.isArray(v) ? "Array" : typeof v === "object" ? (v.constructor?.name ?? "Object") : typeof v);

function fromJsVal(v: any, depth = 0): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "bigint") return v >= I64_MIN && v <= I64_MAX ? v : new FValue("npm", v);
  if (typeof v === "number") return Number.isSafeInteger(v) && !Object.is(v, -0) ? BigInt(v) : v;
  if (depth < 32 && Array.isArray(v)) return v.map((x) => fromJsVal(x, depth + 1));
  if (depth < 32 && isPlainObj(v)) return new Map(Object.entries(v).map(([k, x]) => [k, fromJsVal(x, depth + 1)]));
  return new FValue("npm", v);
}

function jsCandidates(obj: any): string[] {
  if (obj === null || obj === undefined) return [];
  const out = new Set<string>();
  let cur = typeof obj === "object" ? obj : Object(obj);
  for (let d = 0; cur && cur !== Object.prototype && cur !== Function.prototype && d < 6; d++) {
    for (const k of Object.getOwnPropertyNames(cur)) {
      if (k === "constructor" || k.startsWith("_") || jsBlocked(k)) continue;
      out.add(k);
    }
    cur = Object.getPrototypeOf(cur);
  }
  return [...out];
}

function valueString(x: FValue): string {
  const v = x.v;
  if (x.rt === "npm") {
    if (typeof v === "string") return v;
    if (v === undefined) return "undefined";
    try { if (Array.isArray(v) || isPlainObj(v)) return JSON.stringify(v, (_k, y) => (typeof y === "bigint" ? y.toString() : y)); } catch { /* cyclic */ }
    return String(v);
  }
  if (x.rt === "java") {
    if (v?.$h !== undefined && x.javaOps) {
      try { const s = x.javaOps.req("call", { target: { $h: v.$h }, name: "toString", args: [] }); return typeof s === "string" ? s : String(s); } catch { return `<${v.type ?? "JavaObject"}>`; }
    }
    return String(v);
  }
  const t = pyTag(v);
  if (t?.$h !== undefined) { try { const r = x.bridge!.request({ op: "str", h: t.$h }); return r.err ? `<${t.$t}>` : r.ok; } catch { return `<${t.$t}>`; } }
  return typeof v === "string" ? v : pyRepr(v);
}
function pyRepr(v: any): string {
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(", ")}]`;
  if (v.$i !== undefined) return v.$i;
  if (v.$f !== undefined) { const f = v.$f; return typeof f === "string" ? f : Number.isInteger(f) ? `${f}.0` : String(f); }
  if (v.$d !== undefined) return `{${Object.entries(v.$d).map(([k, y]) => `${pyRepr(k)}: ${pyRepr(y)}`).join(", ")}}`;
  if (v.$h !== undefined) return `<${v.$t}>`;
  return String(v);
}

export interface ForeignGrant { python?: string[] | true; npm?: string[] | true; java?: string[] | true }

export function foreignNatives(rt: Rt, grant: ForeignGrant | undefined, info: ForeignInfo | undefined): Record<string, (...a: any[]) => any> {
  const ctx = rt.ctx;
  const P = () => ctx.M["prelude"];
  const failForeign = (runtime: string, msg: string): never => {
    const labelMsg = `${msg} (${runtime})`;
    const FE = P()?.ForeignError;
    if (FE) throw Object.assign(new FE().$init(labelMsg), { $stack: new Error().stack });
    throw new Panic(labelMsg);
  };
  let bridge: PyBridge | undefined;
  let jBridge: SyncJavaBridge | undefined;
  const jClasses = new Map<string, any>();
  const registry = new FinalizationRegistry<number>((h) => bridge?.pendingFree.push(h));
  const jRegistry = new FinalizationRegistry<number>((h) => jBridge?.pendingFree.push(h));
  const cleanups: (() => void)[] = ((ctx as any).cleanups ??= []);
  cleanups.push(() => bridge?.close());
  cleanups.push(() => jBridge?.close());
  const write = (text: string) => {
    ctx.outputBytes += text.length;
    if (ctx.outputBytes > ctx.limits.maxOutputBytes) throw new Panic(`output limit of ${ctx.limits.maxOutputBytes} bytes exceeded`, "limit", "output");
    ctx.write(text);
  };
  const py = (): PyBridge => (bridge ??= new PyBridge(pythonFor(info?.root), toolFile("pybridge.py"), info?.root ?? process.cwd()));
  const javaB = (): SyncJavaBridge => (jBridge ??= new SyncJavaBridge({ projectDir: info?.root ?? process.cwd() }));
  const formatJavaErr = (err: { type: string; message: string; trace?: string }, nearName?: string) => {
    let m = err.message || "unknown error";
    const memMatch = /;\s*members:\s*\[([^\]]+)\]/.exec(m);
    if (memMatch && nearName) {
      const cands = memMatch[1].split(",").map((s) => s.trim().replace(/^.*\./, "").replace(/\(.*$/, "")).filter(Boolean);
      const near = closest(nearName, cands);
      if (near) m = m.replace(/;\s*members:[\s\S]*$/, ` — did you mean \`${near}\`?`);
    }
    return `${err.type}: ${m}`;
  };
  const javaReqRaw = (op: string, fields: Record<string, unknown>, nearName?: string): any => {
    let r: any;
    try { r = javaB().request(op, fields); } catch (e: any) { failForeign("java", `Java bridge: ${e.message}`); }
    if (!r.ok) failForeign("java", formatJavaErr(r.error ?? { type: "JavaError", message: "unknown error" }, nearName));
    return r.value;
  };
  const fromJava = (v: any, depth = 0): any => {
    if (v === null || v === undefined || typeof v === "boolean" || typeof v === "string") return v ?? null;
    if (typeof v === "number") return Number.isSafeInteger(v) && !Object.is(v, -0) ? BigInt(v) : v;
    if (Array.isArray(v)) return depth < 32 ? v.map((x) => fromJava(x, depth + 1)) : v;
    if (typeof v === "object") {
      if (typeof v.$h === "number") return wrapJava(v);
      if (v.$int !== undefined) { const b = BigInt(v.$int); return b >= I64_MIN && b <= I64_MAX ? b : wrapJava(v); }
      if (v.$bytes !== undefined) return Array.from(Buffer.from(v.$bytes, "base64"), (b) => BigInt(b));
      if (depth < 32) return new Map(Object.entries(v).map(([k, x]) => [k, fromJava(x, depth + 1)]));
    }
    return wrapJava(v);
  };
  const toJava = (v: any, depth = 0): any => {
    if (depth > 64) throw new Error("the value is nested too deeply to pass to Java");
    if (v === null || v === undefined || typeof v === "string" || typeof v === "boolean") return v ?? null;
    if (typeof v === "bigint") return { $int: v.toString() };
    if (typeof v === "number") return v;
    if (Array.isArray(v)) return v.map((x) => toJava(x, depth + 1));
    if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), toJava(x, depth + 1)]));
    if (v instanceof Set) return [...v].map((x) => toJava(x, depth + 1));
    if (v instanceof FValue) { if (v.rt !== "java") throw new Error(`a ${label(v.rt)} value cannot be passed to Java`); return v.v?.$h !== undefined ? { $h: v.v.$h } : v.v; }
    throw new Error(`a ${typeof v === "function" ? "function" : "Mycel object"} cannot be passed to Java`);
  };
  const javaOps: JavaOps = { req: javaReqRaw, fromJava, toJava, fail: (m) => failForeign("java", m) };
  const wrapJava = (v: any): FValue => {
    const f = new FValue("java", v, undefined, undefined, javaOps);
    if (v && typeof v.$h === "number") jRegistry.register(f, v.$h);
    return f;
  };
  const javaClass = (mod: string) => {
    let h = jClasses.get(mod);
    if (!h) { h = javaReqRaw("import", { module: mod }); jClasses.set(mod, h); }
    return h;
  };
  const pyReqRaw = (msg: Record<string, unknown>) => {
    let r: any;
    try { r = py().request(msg); } catch (e: any) { failForeign("python", `Python bridge: ${e.message}`); }
    if (r.out) write(r.out);
    if (r.err) failForeign("python", r.err.msg);
    return r.ok;
  };
  const fromPy = (v: any, depth = 0): any => {
    if (v === null || v === undefined || typeof v === "boolean" || typeof v === "string") return v ?? null;
    if (Array.isArray(v)) return depth < 32 ? v.map((x) => fromPy(x, depth + 1)) : wrapPy(v);
    if (typeof v === "object") {
      if (v.$i !== undefined) { const b = BigInt(v.$i); return b >= I64_MIN && b <= I64_MAX ? b : wrapPy(v); }
      if (v.$f !== undefined) { const f = v.$f; return typeof f === "number" ? f : f === "nan" ? NaN : f === "inf" ? Infinity : -Infinity; }
      if (v.$d !== undefined && depth < 32) return new Map(Object.entries(v.$d).map(([k, val]) => [k, fromPy(val, depth + 1)]));
      return wrapPy(v);
    }
    return wrapPy(v);
  };
  const pyOps: PyOps = { req: pyReqRaw, fromPy, fail: (m) => failForeign("python", m) };
  const wrapPy = (v: any): FValue => { const f = new FValue("python", v, bridge, pyOps); const t = pyTag(v); if (t?.$h !== undefined) registry.register(f, t.$h); return f; };
  /** the bridge target of a Python Value: its handle, or the copied data itself */
  const pyTarget = (x: FValue) => { const h = pyTag(x.v)?.$h; return h !== undefined ? { h } : { val: x.v }; };
  const pyReq = (msg: Record<string, unknown>) => fromPy(pyReqRaw(msg));

  // ----- Mycel → Python / JavaScript -----
  const toPy = (v: any, depth = 0): any => {
    if (depth > 64) throw new Error("the value is nested too deeply to pass to Python");
    if (v === null || v === undefined || typeof v === "string" || typeof v === "boolean") return v ?? null;
    if (typeof v === "bigint") return { $i: v.toString() };
    if (typeof v === "number") return { $f: Number.isNaN(v) ? "nan" : v === Infinity ? "inf" : v === -Infinity ? "-inf" : v };
    if (Array.isArray(v)) return v.map((x) => toPy(x, depth + 1));
    if (v instanceof Map) return { $d: [...v].map(([k, x]) => [toPy(k, depth + 1), toPy(x, depth + 1)]) };
    if (v instanceof Set) return { $s: [...v].map((x) => toPy(x, depth + 1)) };
    if (v instanceof FValue) { if (v.rt !== "python") throw new Error("a JavaScript value cannot be passed to Python"); return v.v; }
    throw new Error(`a ${typeof v === "function" ? "function" : "Mycel object"} cannot be passed to Python (only nil, Bool, Int, Float, String, lists, maps, sets and Python values)`);
  };
  const toJs = (v: any, depth = 0): any => {
    if (depth > 64) throw new Error("the value is nested too deeply to pass to JavaScript");
    if (v === null || v === undefined || typeof v === "string" || typeof v === "boolean" || typeof v === "number") return v ?? null;
    if (typeof v === "bigint") return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    if (Array.isArray(v)) return v.map((x) => toJs(x, depth + 1));
    if (v instanceof Map) { const o: Record<string, unknown> = {}; for (const [k, x] of v) o[String(k)] = toJs(x, depth + 1); return o; }
    if (v instanceof Set) return [...v].map((x) => toJs(x, depth + 1));
    if (v instanceof FValue) { if (v.rt !== "npm") throw new Error("a Python value cannot be passed to JavaScript"); return v.v; }
    throw new Error(`a ${typeof v === "function" ? "function" : "Mycel object"} cannot be passed to JavaScript (only nil, Bool, Int, Float, String, lists, maps, sets and JavaScript values)`);
  };
  const jsCall = (f: () => any) => {
    try { return fromJsVal(f()); }
    catch (e: any) { failForeign("npm", e instanceof Error ? `${e.name}: ${e.message}` : String(e)); }
  };
  let req: NodeRequire | undefined;
  const jsRequire = (m: string) => (req ??= createRequire(path.join(nodeDir(info!.root), "package.json")))(m);

  const granted = (r: FRuntime, pkg: string): string | undefined => {
    const g = grant?.[r];
    if (g === true || (Array.isArray(g) && g.includes(pkg))) return undefined;
    if (r === "java") return `calling Java package ${pkg} denied: this run was not granted Java access — add "capabilities": { "java": true } to ply.json, or run with --allow-java`;
    const snippet = `"capabilities": { "packages": { "${r}": [${JSON.stringify(pkg)}] } }`;
    return `calling the ${label(r)} package ${pkg} denied: this run was not granted it — add ${snippet} to ply.json, or run with --allow-pkg=${pkg} (a package runs with the full power of your account)`;
  };

  const nativeIdx = (x: any, k: any): any => {
    if (x instanceof FValue) {
      if (x.rt === "python") {
        if (Array.isArray(x.v) && typeof k === "bigint") {
          let i = Number(k); if (i < 0) i += x.v.length;
          return i >= 0 && i < x.v.length ? fromPy(x.v[i]) : null;
        }
        if (typeof k === "string" && pyTag(x.v)?.$d) {
          const d = pyTag(x.v).$d;
          return Object.prototype.hasOwnProperty.call(d, k) ? fromPy(d[k]) : null;
        }
        return pyReq({ op: "item", ...pyTarget(x), key: toPy(k) });
      }
      return jsCall(() => {
        if (typeof k === "bigint" && Array.isArray(x.v)) {
          let i = Number(k); if (i < 0) i += x.v.length;
          return i >= 0 && i < x.v.length ? x.v[i] : null;
        }
        const kj = toJs(k);
        if (typeof kj === "string" && jsBlocked(kj)) throw new Error(`\`${kj}\` cannot be reached from Mycel`);
        return x.v instanceof Map ? (x.v.get(kj) ?? null) : (x.v?.[kj] ?? null);
      });
    }
    if (Array.isArray(x)) {
      if (k instanceof PlyRange) return rt.helpers.$slice(x, k);
      const bi = typeof k === "bigint" ? k : typeof k === "number" && Number.isSafeInteger(k) ? BigInt(k) : undefined;
      if (bi === undefined) throw new Panic(`cannot index Array with ${kindOf(k)}`);
      return rt.helpers.$ai(x, bi);
    }
    if (x instanceof Map) {
      const key = typeof k === "number" && Number.isSafeInteger(k) ? BigInt(k) : k;
      const v = x.get(key);
      return v === undefined ? null : v;
    }
    if (typeof x === "string") {
      if (k instanceof PlyRange) return rt.helpers.$slice(x, k);
      const bi = typeof k === "bigint" ? k : typeof k === "number" && Number.isSafeInteger(k) ? BigInt(k) : undefined;
      if (bi === undefined) throw new Panic(`cannot index String with ${kindOf(k)}`);
      return rt.helpers.$si(x, bi);
    }
    throw new Panic(`${kindOf(x)} cannot be indexed`);
  };

  const n: Record<string, (...a: any[]) => any> = {
    "std.foreign.unset": () => UNSET,
    "std.foreign.callModule": (r: FRuntime, pkg: string, mod: string, attr: string, values: any[], names: string[], named: Map<string, any>, rest: any[], hasRest: boolean) => {
      const why = granted(r, pkg);
      if (why) throw new Panic(why);
      // std.foreign is importable by any code: the package named must really provide the module (ply.lock), and only
      // Python's own standard library may be called without an install
      const inLock = info?.lock[r]?.[pkg];
      const allowedNoLock = (r === "python" && mod.split(".")[0] === pkg && pythonStdlib().has(pkg)) || (r === "java" && pkg === "jdk" && isJavaJdk(mod));
      if (inLock ? (r === "java" ? !providerOf(info!, "java", mod) : !inLock.provides.includes(r === "npm" ? npmTop(mod) : mod.split(".")[0])) : !allowedNoLock)
        throw new Panic(`${label(r)} package ${pkg} does not provide module ${mod} (ply.lock)`);
      const pos: any[] = [], kw = new Map<string, any>();
      let skipped = false;
      for (let i = 0; i < values.length; i++) {
        const v = values[i], nm = names[i] ?? "";
        if (v === UNSET) { skipped = true; continue; }
        const posOnly = nm.startsWith("/"), kwOnly = nm.startsWith("*"), bare = nm.replace(/^[/*]/, "");
        if (kwOnly || (skipped && !hasRest)) { if (posOnly) failForeign(r, `${bare} can only be given by position, after the arguments before it`); kw.set(bare, v); }
        else if (skipped) failForeign(r, `${bare} needs the arguments before it (this function also takes extra positional arguments)`);
        else pos.push(v);
      }
      pos.push(...rest);
      for (const [k, v] of named ?? []) kw.set(k, v);
      try {
        if (r === "python") {
          if (attr !== "" && attr.startsWith("__")) failForeign(r, `\`${attr}\` cannot be reached from Mycel`);
          return pyReq({ op: "call", mod, attr: attr === "()" ? "" : attr, args: pos.map((x) => toPy(x)), kw: Object.fromEntries([...kw].map(([k, x]) => [k, toPy(x)])) });
        }
        if (r === "java") {
          if (kw.size) failForeign("java", "Java methods take no named arguments");
          const cls = javaClass(mod);
          if (attr === "") return wrapJava(cls);
          if (attr === "()") return fromJava(javaReqRaw("new", { target: { $h: cls.$h }, args: pos.map((x) => toJava(x)) }));
          if (!hasRest && pos.length === 0) return fromJava(javaReqRaw("get", { target: { $h: cls.$h }, name: attr }, attr));
          return fromJava(javaReqRaw("call", { target: { $h: cls.$h }, name: attr, args: pos.map((x) => toJava(x)) }, attr));
        }
        return jsCall(() => {
          const m = jsRequire(mod);
          const jsArgs = pos.map((x) => toJs(x));
          if (kw.size) jsArgs.push(Object.fromEntries([...kw].map(([k, x]) => [k, toJs(x)])));
          if (attr === "") return m;
          if (attr === "()") return callJs(m, undefined, jsArgs);
          if (jsBlocked(attr)) throw new Error(`\`${attr}\` cannot be reached from Mycel`);
          const f = m[attr];
          return typeof f === "function" && hasRest ? callJs(f, m, jsArgs) : f;
        });
      } catch (e: any) {
        if (e?.constructor?.$name === "ForeignError" || e instanceof Panic) throw e;
        failForeign(r, e.message);
      }
    },
    "std.foreign.resolve": async (v: any) => {
      if (!(v instanceof FValue) || v.rt !== "npm" || !(v.v && typeof v.v.then === "function")) return v;
      try { return fromJsVal(await v.v); }
      catch (e: any) { failForeign("npm", e instanceof Error ? `${e.name}: ${e.message}` : String(e)); }
    },
    "std.foreign.Value.get_runtime": (x: any) => (x instanceof FValue ? x.rt : "mycel"),
    "std.foreign.Value.get_typeName": (x: any) => {
      if (!(x instanceof FValue)) return kindOf(x);
      const v = x.v;
      if (x.rt === "java") return String(v?.type ?? (v?.$int !== undefined ? "BigInteger" : "JavaObject"));
      if (x.rt === "python") { const t = pyTag(v); return v === null ? "NoneType" : typeof v === "boolean" ? "bool" : typeof v === "string" ? "str" : Array.isArray(v) ? "list" : t.$i !== undefined ? "int" : t.$f !== undefined ? "float" : t.$d !== undefined ? "dict" : t.$t; }
      return jsTypeName(v);
    },
    "std.foreign.Value.get_isNone": (x: any) => x === null || x === undefined || (x instanceof FValue && (x.v === null || x.v === undefined)),
    "std.foreign.Value.get_asString": (x: any) => (typeof x === "string" ? x : x instanceof FValue && typeof x.v === "string" ? x.v : null),
    "std.foreign.Value.get_asInt": (x: any) => {
      if (typeof x === "bigint") return x <= I64_MAX && x >= I64_MIN ? x : null;
      if (typeof x === "number") return Number.isSafeInteger(x) ? BigInt(x) : null;
      if (!(x instanceof FValue)) return null;
      const v = x.v;
      if (x.rt === "python") { const s = pyTag(v)?.$i; if (s === undefined) return null; const b = BigInt(s); return b > I64_MAX || b < I64_MIN ? null : b; }
      return typeof v === "bigint" ? v : typeof v === "number" && Number.isSafeInteger(v) ? BigInt(v) : null;
    },
    "std.foreign.Value.get_asFloat": (x: any) => {
      if (typeof x === "number") return x;
      if (typeof x === "bigint") return Number(x);
      if (!(x instanceof FValue)) return null;
      const v = x.v;
      if (x.rt === "python") { const t = pyTag(v); if (t?.$i !== undefined) return Number(t.$i); if (t?.$f !== undefined) return typeof t.$f === "number" ? t.$f : t.$f === "nan" ? NaN : t.$f === "inf" ? Infinity : -Infinity; return null; }
      return typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null;
    },
    "std.foreign.Value.get_asBool": (x: any) => (typeof x === "boolean" ? x : x instanceof FValue && typeof x.v === "boolean" ? x.v : null),
    "std.foreign.Value.get_asList": (x: any) => (Array.isArray(x) ? x : x instanceof FValue && Array.isArray(x.v) ? x.v.map((e: any) => (x.rt === "python" ? fromPy(e) : fromJsVal(e))) : null),
    "std.foreign.Value.get_asMap": (x: any) => {
      if (x instanceof Map) { const out = new Map<string, any>(); for (const [k, v] of x) out.set(String(k), v); return out; }
      if (!(x instanceof FValue)) return null;
      const o = entries(x);
      return o ? new Map(o.map(([k, v]) => [k, x.rt === "python" ? fromPy(v) : fromJsVal(v)])) : null;
    },
    "std.foreign.Value.get_keys": (x: any) => (x instanceof Map ? [...x.keys()].map(String) : x instanceof FValue ? (entries(x) ?? []).map(([k]) => k) : []),
    "std.foreign.Value.get_length": (x: any) => {
      if (typeof x === "string") return BigInt([...x].length);
      if (Array.isArray(x)) return BigInt(x.length);
      if (x instanceof Map) return BigInt(x.size);
      return x instanceof FValue ? (x.length ?? 0n) : 0n;
    },
    "std.foreign.Value.[]": nativeIdx,
    "std.foreign.Value.attr": (x: any, name: string) => n["std.foreign.$attr"](x, name),
    "std.foreign.Value.call": (x: any, method: string, ...args: any[]) => n["std.foreign.$call"](x, method, args, new Map()),
    "std.foreign.Value.callKw": (x: any, method: string, args: any[], named: Map<string, any>) => n["std.foreign.$call"](x, method, args, named),
    "std.foreign.Value.invoke": (x: any, ...args: any[]) => n["std.foreign.$invoke"](x, args, new Map()),
    "std.foreign.Value.item": (x: any, key: any) => nativeIdx(x, key),
    "std.foreign.Value.toString": (x: any) => (x instanceof FValue ? valueString(x) : display(x)),

    // ----- Direct dynamic proxy helpers emitted for foreign.Value syntax -----
    "std.foreign.$attr": (x: any, name: string) => {
      if (x instanceof FValue) {
        if (x.rt === "python") return pyReq({ op: "attr", ...pyTarget(x), name });
        if (x.rt === "java") {
          if (x.v?.$h === undefined) failForeign("java", `Java value ${display(x)} has no attributes`);
          return fromJava(javaReqRaw("get", { target: { $h: x.v.$h }, name }, name));
        }
        return jsCall(() => {
          if (jsBlocked(name)) throw new Error(`\`${name}\` cannot be reached from Mycel`);
          if (x.v === null || x.v === undefined) throw new TypeError(`cannot read \`${name}\` of ${x.v}`);
          if (!(name in Object(x.v))) {
            const cands = jsCandidates(x.v);
            const near = closest(name, cands);
            throw new TypeError(`${jsTypeName(x.v)} has no attribute \`${name}\`${near ? ` — did you mean \`${near}\`?` : ""}`);
          }
          const val = x.v[name];
          return typeof val === "function" && !isJsClass(val) ? val.bind(x.v) : val;
        });
      }
      if (x instanceof Map) {
        if (x.has(name)) return x.get(name);
        const near = closest(name, [...x.keys()].map(String));
        failForeign("mycel", `key \`${name}\` not found${near ? ` — did you mean \`${near}\`?` : ""}`);
      }
      const kind = kindOf(x);
      const getter = rt.natives[`${kind}.get_${name}`];
      if (getter) return getter(x);
      const avail = Object.keys(rt.natives).filter((k) => k.startsWith(`${kind}.get_`)).map((k) => k.slice(kind.length + 5));
      const near = closest(name, avail);
      failForeign("mycel", `${kind} has no attribute \`${name}\`${near ? ` — did you mean \`${near}\`?` : ""}`);
    },
    "std.foreign.$call": (x: any, method: string, args: any[], named: Map<string, any>) => {
      if (x instanceof FValue) {
        if (x.rt === "python") {
          return pyReq({ op: "callm", ...pyTarget(x), name: method, args: (args ?? []).map((a) => toPy(a)), kw: Object.fromEntries([...(named ?? [])].map(([k, v]) => [k, toPy(v)])) });
        }
        if (x.rt === "java") {
          if (named && named.size) failForeign("java", "Java methods take no named arguments");
          if (x.v?.$h === undefined) failForeign("java", `Java value has no method \`${method}\``);
          return fromJava(javaReqRaw("call", { target: { $h: x.v.$h }, name: method, args: (args ?? []).map((a) => toJava(a)) }, method));
        }
        return jsCall(() => {
          if (jsBlocked(method)) throw new Error(`\`${method}\` cannot be reached from Mycel`);
          const f = x.v?.[method];
          if (typeof f !== "function") {
            const cands = jsCandidates(x.v);
            const near = closest(method, cands);
            throw new TypeError(`${jsTypeName(x.v)} has no method \`${method}\`${near ? ` — did you mean \`${near}\`?` : ""}`);
          }
          const jsArgs = (args ?? []).map((a) => toJs(a));
          if (named && named.size) jsArgs.push(Object.fromEntries([...named].map(([k, v]) => [k, toJs(v)])));
          return f.apply(x.v, jsArgs);
        });
      }
      const kind = kindOf(x);
      if (typeof x === "string" && method === "split" && (!args || args.length === 0)) {
        return x.trim() ? x.trim().split(/\s+/) : [];
      }
      const nat = rt.natives[`${kind}.${method}`];
      if (nat) return nat(x, ...(args ?? []));
      const ext = rt.extReg.get(kind)?.get(method);
      if (ext) return ext(x, ...(args ?? []));
      const avail = Object.keys(rt.natives)
        .filter((k) => k.startsWith(`${kind}.`) && !k.includes(".get_") && !k.startsWith(`${kind}.operator`))
        .map((k) => k.slice(kind.length + 1));
      const near = closest(method, avail);
      failForeign("mycel", `${kind} has no method \`${method}\`${near ? ` — did you mean \`${near}\`?` : ""}`);
    },
    "std.foreign.$invoke": (x: any, args: any[], named: Map<string, any>) => {
      if (x instanceof FValue) {
        if (x.rt === "python") {
          return pyReq({ op: "invoke", ...pyTarget(x), args: (args ?? []).map((a) => toPy(a)), kw: Object.fromEntries([...(named ?? [])].map(([k, v]) => [k, toPy(v)])) });
        }
        if (x.rt === "java") {
          if (named && named.size) failForeign("java", "Java constructors take no named arguments");
          if (x.v?.$h === undefined) failForeign("java", "this Java value is not callable");
          return fromJava(javaReqRaw("new", { target: { $h: x.v.$h }, args: (args ?? []).map((a) => toJava(a)) }));
        }
        return jsCall(() => {
          if (typeof x.v !== "function") throw new TypeError("this value is not a function");
          const jsArgs = (args ?? []).map((a) => toJs(a));
          if (named && named.size) jsArgs.push(Object.fromEntries([...named].map(([k, v]) => [k, toJs(v)])));
          return callJs(x.v, undefined, jsArgs);
        });
      }
      failForeign("mycel", `${kindOf(x)} is not callable`);
    },
    "std.foreign.$idx": nativeIdx,
    "std.foreign.$setAttr": (x: any, name: string, val: any) => {
      if (x instanceof FValue) {
        if (x.rt === "python") {
          if (name.startsWith("__")) failForeign("python", `\`${name}\` cannot be reached from Mycel`);
          pyReq({ op: "setattr", ...pyTarget(x), name, val: toPy(val) });
          return undefined;
        }
        if (x.rt === "java") {
          if (x.v?.$h === undefined) failForeign("java", `cannot set attribute \`${name}\``);
          javaReqRaw("set", { target: { $h: x.v.$h }, name, value: toJava(val) }, name);
          return undefined;
        }
        jsCall(() => {
          if (jsBlocked(name)) throw new Error(`\`${name}\` cannot be reached from Mycel`);
          x.v[name] = toJs(val);
          return null;
        });
        return undefined;
      }
      if (x instanceof Map) { x.set(name, val); return undefined; }
      failForeign("mycel", `cannot set attribute \`${name}\` on ${kindOf(x)}`);
    },
    "std.foreign.$setIdx": (x: any, key: any, val: any) => {
      if (x instanceof FValue) {
        if (x.rt === "python") { pyReq({ op: "setitem", ...pyTarget(x), key: toPy(key), val: toPy(val) }); return undefined; }
        jsCall(() => {
          const k = toJs(key);
          if (typeof k === "string" && jsBlocked(k)) throw new Error(`\`${k}\` cannot be reached from Mycel`);
          if (x.v instanceof Map) x.v.set(k, toJs(val));
          else x.v[k] = toJs(val);
          return null;
        });
        return undefined;
      }
      if (Array.isArray(x)) { rt.helpers.$as(x, BigInt(Math.trunc(Number(key))), val); return undefined; }
      if (x instanceof Map) { x.set(typeof key === "number" && Number.isSafeInteger(key) ? BigInt(key) : key, val); return undefined; }
      failForeign("mycel", `cannot index-assign ${kindOf(x)}`);
    },
    "std.foreign.$coerce": (v: any, target: string) => {
      if (target.endsWith("?")) { if (v === null || v === undefined) return null; target = target.slice(0, -1); }
      switch (target) {
        case "Int": {
          const b = n["std.foreign.Value.get_asInt"](v);
          if (b !== null) return b;
          throw new Panic(`expected Int from foreign value, got ${kindOf(v)} (${display(v, true)})`);
        }
        case "Float": {
          const f = n["std.foreign.Value.get_asFloat"](v);
          if (f !== null) return f;
          throw new Panic(`expected Float from foreign value, got ${kindOf(v)} (${display(v, true)})`);
        }
        case "String": {
          const s = n["std.foreign.Value.get_asString"](v);
          if (s !== null) return s;
          throw new Panic(`expected String from foreign value, got ${kindOf(v)} (${display(v, true)})`);
        }
        case "Bool": {
          const b = n["std.foreign.Value.get_asBool"](v);
          if (b !== null) return b;
          throw new Panic(`expected Bool from foreign value, got ${kindOf(v)} (${display(v, true)})`);
        }
        case "Array": {
          const xs = n["std.foreign.Value.get_asList"](v);
          if (xs !== null) return xs;
          throw new Panic(`expected Array from foreign value, got ${kindOf(v)} (${display(v, true)})`);
        }
        case "Map": {
          const m = n["std.foreign.Value.get_asMap"](v);
          if (m !== null) return m;
          throw new Panic(`expected Map from foreign value, got ${kindOf(v)} (${display(v, true)})`);
        }
      }
      return v;
    },
  };
  return n;

  function entries(x: FValue): [string, any][] | undefined {
    const v = x.v;
    if (x.rt === "python") { const d = pyTag(v)?.$d; return d ? Object.entries(d) : undefined; }
    if (v instanceof Map) return [...v].filter(([k]) => typeof k === "string") as [string, any][];
    return isPlainObj(v) ? Object.keys(v).map((k) => [k, v[k]]) : undefined;
  }
}
