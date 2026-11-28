/**
 * `ply install|remove|update|why --python|--npm` (task 55). Python: a per-project venv (.ply/python/venv), pip with
 * `--report` (pinned versions + sha256 of every archive into ply.lock), reinstalls with `--require-hashes`.
 * npm: `npm install --ignore-scripts` into .ply/node (install scripts are a supply-chain route, so they never run);
 * ply.lock keeps npm's own lock entries (integrity sha512) and `ply install` restores them with `npm ci`.
 * pip and npm read their usual environment (PIP_INDEX_URL, PIP_FIND_LINKS, npm_config_*), which is how the tests
 * run offline against local fixtures.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import { PlyError, readManifest, writeManifest } from "./project";
import { suggestAlias, toolFile, FRuntime, ForeignLock, ForeignPkg, introspect, nodeDir, pythonFor, readForeign, bindingSource, internalName, label, flagOf } from "./foreign";
import { installMaven, scanJarProvides } from "./bridges";

const normPy = (n: string) => n.replace(/[-_.]+/g, "-").toLowerCase();
const venvDir = (root: string) => path.join(root, ".ply", "python", "venv");

function sh(cmd: string, args: string[], cwd: string, what: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 256 << 20, env: process.env, shell: process.platform === "win32" && cmd === "npm" });
  if (r.error) throw new PlyError(`${what}: could not run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    const tail = `${r.stderr ?? ""}\n${r.stdout ?? ""}`.trim().split("\n").filter((l) => l.trim()).slice(-6).join("\n  ");
    throw new PlyError(`${what} failed (${cmd} exited ${r.status}):\n  ${tail}`);
  }
  return r.stdout;
}

function writeLock(root: string, foreign: ForeignLock) {
  const lf = path.join(root, "ply.lock");
  let lock: any = { lockVersion: 1, packages: {} };
  try { lock = JSON.parse(fs.readFileSync(lf, "utf8")); } catch { /* new */ }
  for (const k of Object.keys(foreign) as (keyof ForeignLock)[]) if (foreign[k] && !Object.keys(foreign[k]!).length) delete foreign[k];
  if (Object.keys(foreign).length) lock.foreign = foreign; else delete lock.foreign;
  fs.writeFileSync(lf, JSON.stringify(lock, null, 2) + "\n");
}
function ignorePly(root: string) {
  const gi = path.join(root, ".gitignore");
  const t = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  if (!/^\.ply\/?$/m.test(t)) fs.writeFileSync(gi, t + (t && !t.endsWith("\n") ? "\n" : "") + ".ply\n");
}

// ---------------------------------------------------------------- Python ----------
function ensureVenv(root: string): string {
  const have = pythonFor(root);
  if (fs.existsSync(venvDir(root)) && have.startsWith(venvDir(root))) return have;
  const base = process.env.PLY_PYTHON || (process.platform === "win32" ? "python" : "python3");
  fs.mkdirSync(path.dirname(venvDir(root)), { recursive: true });
  sh(base, ["-m", "venv", venvDir(root)], root, "creating the project's Python environment (.ply/python/venv)");
  ignorePly(root);
  return pythonFor(root);
}
const pip = (py: string, root: string, args: string[], what: string) => sh(py, ["-m", "pip", "--disable-pip-version-check", ...args], root, what);

/** Read what is installed in the venv now and rebuild the python section of the lock (keeping known hashes). */
function refreshPython(root: string, py: string, old: Record<string, ForeignPkg>, report: any | undefined, direct: Set<string>): Record<string, ForeignPkg> {
  const now = JSON.parse(sh(py, [toolFile("pyprovides.py")], root, "reading the installed Python packages")) as Record<string, { name: string; version: string; provides: string[]; requires: string[] }>;
  const fromReport = new Map<string, any>();
  for (const it of report?.install ?? []) fromReport.set(normPy(it.metadata.name), it);
  const out: Record<string, ForeignPkg> = {};
  for (const [k, d] of Object.entries(now).sort()) {
    const it = fromReport.get(k), prev = old[k];
    const hashes = it ? Object.entries(it.download_info?.archive_info?.hashes ?? {}).map(([alg, h]) => `${alg}:${h}`) : prev?.version === d.version ? prev.hashes : undefined;
    const url = it ? it.download_info?.url : prev?.version === d.version ? prev.url : undefined;
    out[k] = { version: d.version, provides: d.provides, direct: direct.has(k), requires: d.requires, ...(hashes?.length ? { hashes } : {}), ...(url ? { url } : {}) };
  }
  return out;
}

export function pythonInstall(root: string, pkgs: { spec: string; name: string; version?: string }[], upgrade = false): string[] {
  const py = ensureVenv(root);
  const m = readManifest(root) as any;
  const specs = pkgs.map((p) => (/[\\/]/.test(p.spec) || /\.(whl|tar\.gz|zip)$/.test(p.spec) ? path.resolve(p.spec) : p.version ? `${p.name}==${p.version}` : p.name));
  const rep = path.join(os.tmpdir(), `ply-pip-report-${process.pid}-${Date.now()}.json`);
  pip(py, root, ["install", ...(upgrade ? ["--upgrade"] : []), "--report", rep, ...specs], `pip install ${specs.join(" ")}`);
  let report: any;
  try { report = JSON.parse(fs.readFileSync(rep, "utf8")); } catch { report = undefined; } finally { fs.rmSync(rep, { force: true }); }
  const info = readForeign(root);
  // the direct packages: what ply.json already lists + what was asked for now (by the name pip resolved)
  const asked = new Map<string, string>();
  for (const it of report?.install ?? []) if (it.requested) asked.set(normPy(it.metadata.name), it.metadata.name);
  for (const p of pkgs) if (!/[\\/]/.test(p.spec)) asked.set(normPy(p.name), p.name);
  const direct = new Set([...Object.keys(m.python ?? {}).map(normPy), ...asked.keys()]);
  const lock = refreshPython(root, py, info.lock.python ?? {}, report, direct);
  m.python = { ...(m.python ?? {}) };
  const lines: string[] = [];
  for (const k of asked.keys()) {
    const e = lock[k];
    if (!e) throw new PlyError(`pip did not install ${asked.get(k)} (nothing by that name is in .ply/python/venv)`);
    const shown = Object.keys(m.python).find((n) => normPy(n) === k) ?? asked.get(k)!;
    m.python[shown] = e.version;
    lines.push(useLine("python", shown, e));
  }
  writeManifest(root, m);
  writeLock(root, { ...info.lock, python: lock });
  warmBindings(root, "python", [...asked.keys()].flatMap((k) => lock[k]?.provides ?? []));
  return lines;
}

export function pythonRemove(root: string, names: string[]): string[] {
  const m = readManifest(root) as any;
  const info = readForeign(root);
  const py = pythonFor(root);
  const out: string[] = [];
  for (const n of names) {
    const key = Object.keys(m.python ?? {}).find((x) => normPy(x) === normPy(n));
    if (!key) throw new PlyError(`"${n}" is not a Python dependency of ${m.name} (Python dependencies: ${Object.keys(m.python ?? {}).join(", ") || "none"})`);
    delete m.python[key];
    out.push(`removed ${key} (Python)`);
  }
  // uninstall what nothing else needs any more: the named packages and their now-orphaned dependencies
  const keep = new Set<string>();
  const lock = info.lock.python ?? {};
  const visit = (k: string) => { if (keep.has(k) || !lock[k]) return; keep.add(k); for (const r of lock[k].requires ?? []) visit(r); };
  for (const k of Object.keys(m.python ?? {})) visit(normPy(k));
  const drop = Object.keys(lock).filter((k) => !keep.has(k));
  if (drop.length && fs.existsSync(venvDir(root))) pip(py, root, ["uninstall", "-y", ...drop.map((k) => lock[k] ? k : k)], `pip uninstall ${drop.join(" ")}`);
  writeManifest(root, m);
  writeLock(root, { ...info.lock, python: fs.existsSync(venvDir(root)) ? refreshPython(root, py, lock, undefined, new Set(Object.keys(m.python ?? {}).map(normPy))) : {} });
  return out;
}

/** `ply install` with no package: rebuild .ply/python/venv exactly from ply.lock (hash-checked). */
export function pythonRestore(root: string): number {
  const info = readForeign(root);
  const lock = info.lock.python ?? {};
  if (!Object.keys(lock).length) return 0;
  const py = ensureVenv(root);
  const req = path.join(os.tmpdir(), `ply-requirements-${process.pid}-${Date.now()}.txt`);
  const lines = Object.entries(lock).map(([k, e]) => {
    if (!e.hashes?.length) throw new PlyError(`ply.lock has no hash for Python package ${k} ${e.version}: run \`ply update ${k} --python\` to record one`);
    const spec = e.url?.startsWith("file:") ? `${k} @ ${e.url}` : `${k}==${e.version}`;
    return `${spec} ${e.hashes.map((h) => `--hash=${h}`).join(" ")}`;
  });
  fs.writeFileSync(req, lines.join("\n") + "\n");
  try { pip(py, root, ["install", "--require-hashes", "--no-deps", "-r", req], "pip install from ply.lock"); } finally { fs.rmSync(req, { force: true }); }
  return lines.length;
}

// ---------------------------------------------------------------- npm ----------
function ensureNodeDir(root: string) {
  const d = nodeDir(root);
  fs.mkdirSync(d, { recursive: true });
  const pj = path.join(d, "package.json");
  if (!fs.existsSync(pj)) fs.writeFileSync(pj, JSON.stringify({ name: "ply-npm-packages", private: true, description: "managed by ply from ply.json \"npm\"; do not edit", dependencies: {} }, null, 2) + "\n");
  ignorePly(root);
  return d;
}
const npmArgs = ["--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"];

function refreshNpm(root: string, direct: Set<string>): { pkgs: Record<string, ForeignPkg>; npmLock: Record<string, unknown> } {
  const d = nodeDir(root);
  const pl = JSON.parse(fs.readFileSync(path.join(d, "package-lock.json"), "utf8"));
  const pkgs: Record<string, ForeignPkg> = {};
  for (const [k, e] of Object.entries<any>(pl.packages ?? {})) {
    if (!k.startsWith("node_modules/") || k.slice(13).includes("node_modules/")) continue; // top level of the flat tree
    const name = k.slice(13);
    pkgs[name] = { version: e.version, provides: [name], direct: direct.has(name), ...(e.integrity ? { integrity: e.integrity } : {}), ...(e.resolved ? { url: e.resolved } : {}), requires: Object.keys(e.dependencies ?? {}).sort() };
  }
  return { pkgs, npmLock: pl.packages ?? {} };
}

export function npmInstall(root: string, pkgs: { spec: string; name: string; version?: string }[], upgrade = false): string[] {
  const d = ensureNodeDir(root);
  const m = readManifest(root) as any;
  const specs = pkgs.map((p) => (/[\\/]/.test(p.spec) && !p.spec.startsWith("@") || /\.tgz$/.test(p.spec) ? path.resolve(p.spec) : p.version ? `${p.name}@${p.version}` : p.name));
  const before = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8")).dependencies ?? {};
  sh("npm", [upgrade ? "update" : "install", ...npmArgs, ...(upgrade ? [] : ["--save-exact"]), ...specs], d, `npm ${upgrade ? "update" : "install"} ${specs.join(" ")}`);
  const after = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8")).dependencies ?? {};
  const asked = Object.keys(after).filter((k) => upgrade ? pkgs.some((p) => p.name === k) : !(k in before) || pkgs.some((p) => p.name === k) || after[k] !== before[k]);
  const info = readForeign(root);
  const { pkgs: lock, npmLock } = refreshNpm(root, new Set(Object.keys(after)));
  m.npm = { ...(m.npm ?? {}) };
  const lines: string[] = [];
  for (const k of asked) { m.npm[k] = String(after[k]).startsWith("file:") ? after[k] : lock[k]?.version ?? after[k]; if (lock[k]) lines.push(useLine("npm", k, lock[k])); }
  writeManifest(root, m);
  writeLock(root, { ...info.lock, npm: lock, npmLock });
  warmBindings(root, "npm", asked);
  return lines;
}

export function npmRemove(root: string, names: string[]): string[] {
  const m = readManifest(root) as any;
  for (const n of names) if (!(m.npm && n in m.npm)) throw new PlyError(`"${n}" is not an npm dependency of ${m.name} (npm dependencies: ${Object.keys(m.npm ?? {}).join(", ") || "none"})`);
  const d = ensureNodeDir(root);
  sh("npm", ["uninstall", ...npmArgs, ...names], d, `npm uninstall ${names.join(" ")}`);
  for (const n of names) delete m.npm[n];
  writeManifest(root, m);
  const info = readForeign(root);
  const { pkgs, npmLock } = refreshNpm(root, new Set(Object.keys(m.npm ?? {})));
  writeLock(root, { ...info.lock, npm: pkgs, npmLock });
  return names.map((n) => `removed ${n} (npm)`);
}

/** `ply install` with no package: rebuild .ply/node exactly from ply.lock with `npm ci` (integrity-checked). */
export function npmRestore(root: string): number {
  const info = readForeign(root);
  const m = readManifest(root) as any;
  if (!info.lock.npmLock || !Object.keys(info.lock.npm ?? {}).length) return 0;
  const d = ensureNodeDir(root);
  const deps = { ...(m.npm ?? {}) };
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "ply-npm-packages", private: true, description: "managed by ply from ply.json \"npm\"; do not edit", dependencies: deps }, null, 2) + "\n");
  const packages: any = { ...info.lock.npmLock, "": { name: "ply-npm-packages", dependencies: deps } };
  fs.writeFileSync(path.join(d, "package-lock.json"), JSON.stringify({ name: "ply-npm-packages", lockfileVersion: 3, requires: true, packages }, null, 2) + "\n");
  sh("npm", ["ci", ...npmArgs], d, "npm ci from ply.lock");
  return Object.keys(info.lock.npm ?? {}).length;
}

// ---------------------------------------------------------------- Java (Maven) ----------
function sha256File(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

export async function javaInstall(root: string, pkgs: { spec: string; name: string; version?: string }[], _upgrade = false): Promise<string[]> {
  const m = readManifest(root) as any;
  const info = readForeign(root);
  const lock: Record<string, ForeignPkg> = { ...(info.lock.java ?? {}) };
  m.java = { ...(m.java ?? {}) };
  const lines: string[] = [];
  for (const p of pkgs) {
    const spec = p.version && !p.spec.includes(":") ? `${p.name}:${p.version}` : p.spec;
    let entries;
    try { entries = await installMaven(spec, root); }
    catch (e: any) { throw new PlyError(`Maven install ${spec} failed: ${e?.message ?? e}`); }
    ignorePly(root);
    for (let idx = 0; idx < entries.length; idx++) {
      const e = entries[idx];
      const key = `${e.group}:${e.artifact}`;
      const jarPath = path.join(root, ".ply", "java", e.file);
      let scanned: string[] = [];
      try { scanned = scanJarProvides(jarPath); } catch { /* mock fixture */ }
      const provides = scanned.length ? scanned : [e.group];
      const isDirect = idx === 0 || Object.prototype.hasOwnProperty.call(m.java, key);
      lock[key] = { version: e.version, provides, direct: isDirect, hashes: [`sha256:${e.sha256}`], url: e.file };
      if (idx === 0) {
        m.java[key] = e.version;
        lines.push(useLine("java", key, lock[key]));
      }
    }
  }
  writeManifest(root, m);
  writeLock(root, { ...info.lock, java: lock });
  return lines;
}

export function javaRemove(root: string, names: string[]): string[] {
  const m = readManifest(root) as any;
  const info = readForeign(root);
  const lock: Record<string, ForeignPkg> = { ...(info.lock.java ?? {}) };
  const out: string[] = [];
  for (const n of names) {
    if (!(m.java && n in m.java)) throw new PlyError(`"${n}" is not a Java dependency of ${m.name} (Java dependencies: ${Object.keys(m.java ?? {}).join(", ") || "none"})`);
    delete m.java[n];
    const entry = lock[n];
    if (entry?.url) fs.rmSync(path.join(root, ".ply", "java", entry.url), { force: true });
    delete lock[n];
    out.push(`removed ${n} (Java)`);
  }
  writeManifest(root, m);
  writeLock(root, { ...info.lock, java: lock });
  return out;
}

export function javaRestore(root: string): number {
  const info = readForeign(root);
  const lock = info.lock.java ?? {};
  const keys = Object.keys(lock);
  if (!keys.length) return 0;
  for (const k of keys) {
    const e = lock[k];
    if (!e.hashes?.length || !e.url) throw new PlyError(`ply.lock has no hash/jar for Java package ${k} ${e.version}`);
    const jarPath = path.join(root, ".ply", "java", e.url);
    if (!fs.existsSync(jarPath)) throw new PlyError(`missing Java JAR ${e.url} in .ply/java: run \`ply install ${k}:${e.version} --java\``);
    const got = `sha256:${sha256File(jarPath)}`;
    if (!e.hashes.includes(got)) throw new PlyError(`Java package ${k} hash mismatch (expected ${e.hashes[0]}, got ${got})`);
  }
  return keys.length;
}

// ---------------------------------------------------------------- shared ----------
function useLine(rt: FRuntime, name: string, e: ForeignPkg): string {
  const mods = e.provides;
  const fl = flagOf(rt);
  const imp = rt === "java"
    ? (mods.length ? [`from ${mods[0]} import <Class> ${fl}`] : [`import <group.Class> ${fl}`])
    : mods.map((mod) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(mod) ? `import ${mod} ${fl}` : `import ${JSON.stringify(mod)} as ${suggestAlias(mod.split("/").pop()!)} ${fl}`));
  const grant = rt === "java"
    ? `"capabilities": { "java": true }   (or run with --allow-java)`
    : `"capabilities": { "packages": { "${rt}": [${JSON.stringify(normKey(rt, name))}] } }   (or run with --allow-pkg=${normKey(rt, name)})`;
  return `added ${name} ${e.version} (${label(rt)}) — use it with: ${imp.join("  or  ") || "(it provides no importable module)"}\n  to let your code call it, add to ply.json: ${grant}`;
}
const normKey = (rt: FRuntime, n: string) => (rt === "python" ? normPy(n) : n);

/** Generate the bindings right away, so a broken package shows up at install, not at the first `mycel run`. */
function warmBindings(root: string, rt: FRuntime, mods: string[]) {
  const info = readForeign(root);
  for (const m of mods) bindingSource(info, internalName(rt, m));
}

/** `ply why <pkg> --python|--npm` */
export function foreignWhy(root: string, rt: FRuntime, name: string): string {
  const lock = readForeign(root).lock[rt] ?? {};
  // the install name, or the name you import (`ply why PIL --python` finds pillow)
  const k = lock[rt === "python" ? normPy(name) : name] ? (rt === "python" ? normPy(name) : name) : Object.keys(lock).find((n) => lock[n].provides.includes(name)) ?? name;
  const e = lock[k];
  if (!e) throw new PlyError(`"${name}" is not installed for ${label(rt)} in this project`);
  const by = Object.entries(lock).filter(([, x]) => x.requires?.includes(k)).map(([n, x]) => `${n}@${x.version}`);
  return `${k}@${e.version} (${label(rt)}, provides ${e.provides.join(", ") || "nothing importable"}) is needed by: ${[...(e.direct ? ["ply.json"] : []), ...by].join(", ") || "nothing (an orphan; ply remove cleans it up)"}`;
}

export { introspect };
