import * as fs from "fs";
import * as os from "os";
import { portablePath, removeTree } from "./paths";
import * as path from "path";
import * as crypto from "crypto";
import { Capabilities } from "./stdlib";

export interface Manifest {
  name: string;
  version: string;
  description?: string;
  main?: string;
  dependencies?: Record<string, string>;
  capabilities?: Capabilities;
}
export interface Project { root: string; manifest: Manifest; srcDir: string; main: string; packages: Record<string, string> }

export class PlyError extends Error {}

// ---------- semver ----------
export interface Ver { major: number; minor: number; patch: number; pre: string }
export function parseVer(s: string): Ver | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(s.trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? "" } : undefined;
}
export function cmpVer(a: Ver, b: Ver): number {
  for (const k of ["major", "minor", "patch"] as const) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}
/** Supports 1.2.3, ^1.2.3, ~1.2.3, >=1.2.3, 1.x, 1.2.x and *. Pre-releases only match when named exactly. */
export function satisfies(version: string, range: string): boolean {
  const v = parseVer(version);
  if (!v) return false;
  const r = range.trim();
  if (r === "*" || r === "" || r === "latest") return !v.pre;
  let m: RegExpExecArray | null;
  if ((m = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(r))) {
    const lo = { major: +m[1], minor: +m[2], patch: +m[3], pre: "" };
    if (cmpVer(v, lo) < 0 || v.pre) return false;
    return lo.major > 0 ? v.major === lo.major : lo.minor > 0 ? v.major === 0 && v.minor === lo.minor : v.major === 0 && v.minor === 0 && v.patch === lo.patch;
  }
  if ((m = /^~(\d+)\.(\d+)\.(\d+)$/.exec(r))) return !v.pre && v.major === +m[1] && v.minor === +m[2] && v.patch >= +m[3];
  if ((m = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(r))) return !v.pre && cmpVer(v, { major: +m[1], minor: +m[2], patch: +m[3], pre: "" }) >= 0;
  if ((m = /^(\d+)\.(x|\*)$/.exec(r))) return !v.pre && v.major === +m[1];
  if ((m = /^(\d+)\.(\d+)\.(x|\*)$/.exec(r))) return !v.pre && v.major === +m[1] && v.minor === +m[2];
  const exact = parseVer(r);
  if (exact) return cmpVer(v, exact) === 0;
  throw new PlyError(`unsupported version range "${range}" (use 1.2.3, ^1.2.3, ~1.2.3, >=1.2.3, 1.x, 1.2.x or *)`);
}

// ---------- manifest ----------
const NAME_RE = /^[a-z][a-z0-9_]*$/;
export function validateManifest(m: any, where: string): Manifest {
  const bad = (msg: string): never => { throw new PlyError(`${where}: ${msg}`); };
  if (!m || typeof m !== "object") bad("the manifest must be a JSON object");
  if (typeof m.name !== "string" || !NAME_RE.test(m.name)) bad(`"name" must be lower-case letters, digits and underscores, starting with a letter (got ${JSON.stringify(m.name)}); it is the name other code imports`);
  if (typeof m.version !== "string" || !parseVer(m.version)) bad(`"version" must look like 1.2.3 (got ${JSON.stringify(m.version)})`);
  if (m.dependencies !== undefined) {
    if (typeof m.dependencies !== "object" || Array.isArray(m.dependencies)) bad('"dependencies" must be an object of name -> range');
    for (const [k, v] of Object.entries(m.dependencies)) {
      if (!NAME_RE.test(k)) bad(`dependency name "${k}" is not a valid package name`);
      if (typeof v !== "string") bad(`dependency "${k}" must be a version range or "path:<dir>"`);
    }
  }
  return m as Manifest;
}
export function readManifest(dir: string): Manifest {
  const f = path.join(dir, "ply.json");
  let text: string;
  try { text = fs.readFileSync(f, "utf8"); } catch { throw new PlyError(`${f} not found`); }
  let json: unknown;
  try { json = JSON.parse(text); } catch (e: any) { throw new PlyError(`${f} is not valid JSON: ${e.message}`); }
  return validateManifest(json, f);
}
export function writeManifest(dir: string, m: Manifest) {
  fs.writeFileSync(path.join(dir, "ply.json"), JSON.stringify(m, null, 2) + "\n");
}

export function findProject(from: string): Project | undefined {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, "ply.json"))) return loadProject(dir);
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}
export function loadProject(root: string): Project {
  const manifest = readManifest(root);
  const packages: Record<string, string> = {};
  const pm = path.join(root, "ply_modules");
  if (fs.existsSync(pm)) for (const n of fs.readdirSync(pm)) packages[n] = fs.realpathSync(path.join(pm, n));
  return { root, manifest, srcDir: path.join(root, "src"), main: path.join(root, manifest.main ?? (fs.existsSync(path.join(root, "src/main.myc")) ? "src/main.myc" : "src/main.olx")), packages };
}

// ---------- registry / install ----------
export const registryDir = () => process.env.PLY_REGISTRY ?? path.join(os.homedir(), ".ply", "registry");

export function listFilesRec(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === "ply_modules" || e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRec(p, base));
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}
export function integrity(dir: string): string {
  const h = crypto.createHash("sha256");
  for (const f of listFilesRec(dir)) { h.update(portablePath(f) + "\0"); h.update(fs.readFileSync(path.join(dir, f))); h.update("\0"); }
  return "sha256-" + h.digest("hex");
}
function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of listFilesRec(src)) { fs.mkdirSync(path.dirname(path.join(dst, f)), { recursive: true }); fs.copyFileSync(path.join(src, f), path.join(dst, f)); }
}

export function publish(dir: string): { name: string; version: string; dest: string } {
  const m = readManifest(dir);
  const dest = path.join(registryDir(), m.name, m.version);
  if (fs.existsSync(dest)) throw new PlyError(`${m.name}@${m.version} is already published; bump "version" in ply.json (published versions are immutable)`);
  if (!fs.existsSync(path.join(dir, "src"))) throw new PlyError(`${dir} has no src/ directory to publish`);
  copyDir(dir, dest);
  return { name: m.name, version: m.version, dest };
}

export interface LockEntry { version: string; source: string; integrity: string; dependencies: Record<string, string> }
export interface Lock { lockVersion: 1; packages: Record<string, LockEntry> }

interface Resolved { name: string; version: string; dir: string; source: string; deps: Record<string, string> }

function resolveSpec(name: string, spec: string, fromDir: string): Resolved {
  if (spec.startsWith("path:")) {
    const dir = path.resolve(fromDir, spec.slice(5));
    const m = readManifest(dir);
    if (m.name !== name) throw new PlyError(`dependency "${name}" points at ${dir}, whose ply.json is named "${m.name}"`);
    return { name, version: m.version, dir, source: `path:${spec.slice(5)}`, deps: m.dependencies ?? {} };
  }
  const base = path.join(registryDir(), name);
  const versions = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => parseVer(v)) : [];
  const ok = versions.filter((v) => { try { return satisfies(v, spec); } catch (e) { throw new PlyError(`dependency "${name}": ${(e as Error).message}`); } }).sort((a, b) => cmpVer(parseVer(a)!, parseVer(b)!));
  if (!ok.length) {
    throw new PlyError(versions.length
      ? `no version of "${name}" satisfies "${spec}" (available: ${versions.join(", ")})`
      : `package "${name}" was not found in the registry ${registryDir()} (publish it with \`ply publish\`, or depend on it with "path:<dir>")`);
  }
  const v = ok[ok.length - 1];
  const dir = path.join(base, v);
  return { name, version: v, dir, source: "registry", deps: readManifest(dir).dependencies ?? {} };
}

/** Resolve the dependency graph (flat: one version per package) and copy it into ply_modules/. */
export function install(root: string): Lock {
  const m = readManifest(root);
  const chosen = new Map<string, Resolved>();
  const wanted = new Map<string, { spec: string; by: string }[]>();
  const visit = (deps: Record<string, string>, by: string, fromDir: string, stack: string[]) => {
    for (const [name, spec] of Object.entries(deps)) {
      (wanted.get(name) ?? wanted.set(name, []).get(name)!).push({ spec, by });
      const prev = chosen.get(name);
      const r = resolveSpec(name, spec, fromDir);
      if (prev) {
        if (prev.version !== r.version && !spec.startsWith("path:")) {
          if (!satisfies(prev.version, spec)) throw new PlyError(`conflicting requirements for "${name}": ${wanted.get(name)!.map((w) => `${w.by} wants ${w.spec}`).join("; ")} — only one version can be installed (have ${prev.version})`);
        }
        continue;
      }
      if (stack.includes(name)) throw new PlyError(`dependency cycle: ${[...stack, name].join(" -> ")}`);
      chosen.set(name, r);
      visit(r.deps, `${name}@${r.version}`, r.dir, [...stack, name]);
    }
  };
  visit(m.dependencies ?? {}, m.name, root, []);
  const pmDir = path.join(root, "ply_modules");
  removeTree(pmDir, true); // not fs.rmSync: see removeTree (non-ASCII project paths on Windows)
  const lock: Lock = { lockVersion: 1, packages: {} };
  if (chosen.size) fs.mkdirSync(pmDir, { recursive: true });
  for (const [name, r] of [...chosen].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    copyDir(r.dir, path.join(pmDir, name));
    lock.packages[name] = { version: r.version, source: r.source, integrity: integrity(path.join(pmDir, name)), dependencies: r.deps };
  }
  fs.writeFileSync(path.join(root, "ply.lock"), JSON.stringify(lock, null, 2) + "\n");
  return lock;
}

/** Verify ply_modules against ply.lock (detects tampering / drift). */
export function verifyLock(root: string): string[] {
  const lf = path.join(root, "ply.lock");
  if (!fs.existsSync(lf)) return [];
  const lock = JSON.parse(fs.readFileSync(lf, "utf8")) as Lock;
  const problems: string[] = [];
  for (const [name, e] of Object.entries(lock.packages)) {
    const dir = path.join(root, "ply_modules", name);
    if (!fs.existsSync(dir)) { problems.push(`${name}@${e.version} is in ply.lock but not installed (run \`ply install\`)`); continue; }
    if (integrity(dir) !== e.integrity) problems.push(`${name}: installed files do not match ply.lock (modified after install? run \`ply install\` to restore)`);
  }
  return problems;
}

export function addDependency(root: string, spec: string): { name: string; range: string } {
  const at = spec.indexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  let range = at > 0 ? spec.slice(at + 1) : "";
  const m = readManifest(root);
  if (!range) {
    const base = path.join(registryDir(), name);
    const versions = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => parseVer(v) && !parseVer(v)!.pre).sort((a, b) => cmpVer(parseVer(a)!, parseVer(b)!)) : [];
    if (!versions.length) throw new PlyError(`package "${name}" was not found in the registry ${registryDir()} (use \`ply install ${name}@path:<dir>\` for a local package)`);
    range = "^" + versions[versions.length - 1];
  }
  resolveSpec(name, range, root); // validates before touching the manifest
  m.dependencies = { ...(m.dependencies ?? {}), [name]: range };
  writeManifest(root, m);
  install(root);
  return { name, range };
}
export function removeDependency(root: string, name: string) {
  const m = readManifest(root);
  if (!m.dependencies || !(name in m.dependencies)) throw new PlyError(`"${name}" is not a dependency of ${m.name} (dependencies: ${Object.keys(m.dependencies ?? {}).join(", ") || "none"})`);
  delete m.dependencies[name];
  writeManifest(root, m);
  install(root);
}

export function initProject(dir: string, name: string) {
  if (!NAME_RE.test(name)) throw new PlyError(`"${name}" is not a valid project name (lower-case letters, digits, underscores; start with a letter)`);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new PlyError(`${dir} already exists and is not empty`);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  writeManifest(dir, { name, version: "0.1.0", main: "src/main.myc", dependencies: {} });
  fs.writeFileSync(path.join(dir, "src", "main.myc"), `import ${name}.greeting\n\nfn main() {\n  print(greeting.hello("world"))\n}\n`.replace(`import ${name}.greeting`, "import greeting"));
  fs.writeFileSync(path.join(dir, "src", "greeting.myc"), `pub fn hello(name: String) -> String {\n  return f"Hello, {name}!"\n}\n`);
  fs.writeFileSync(path.join(dir, "tests", "greeting_test.myc"), `import std.test\nimport greeting\n\ntest "hello greets by name" {\n  test.assertEq(greeting.hello("Mycel"), "Hello, Mycel!")\n}\n`);
  fs.writeFileSync(path.join(dir, ".gitignore"), "ply_modules\nbuild\n");
}
