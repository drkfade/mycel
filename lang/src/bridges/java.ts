import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as crypto from "crypto";
import * as https from "https";

export interface JavaOptions { projectDir: string; capabilities?: { java?: boolean }; timeoutMs?: number; source?: string; java?: string; headless?: boolean; }
type WireHandle = { $h: number; type: string };
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
export class JavaBridgeError extends Error {
  constructor(public foreignType: string, message: string, public trace = "", public location = "") {
    super(`${foreignType}: ${message} (java)${trace ? ` at ${trace}` : ""}${location ? ` at ${location}` : ""}`); this.name = "JavaBridgeError";
  }
}

/** One bridge per program; no Java process exists until the first request. */
export class JavaBridge {
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<number, Pending>(); private id = 0; private callbackId = 0;
  private callbacks = new Map<number, Function>(); private closed = false;
  private finalizer = new FinalizationRegistry<number>((id) => { if (this.child && !this.closed) void this.request("release", { handles: [id] }).catch(() => {}); });
  private exitHook = () => this.close();
  constructor(private options: JavaOptions) {}
  private start() {
    if (this.closed) throw new Error("Java bridge is closed");
    if (this.options.capabilities?.java !== true) throw new Error('Java capability denied; add "capabilities": { "java": true } to ply.json');
    if (this.child) return;
    const jarDir = path.join(this.options.projectDir, ".ply", "java");
    const jars = fs.existsSync(jarDir) ? fs.readdirSync(jarDir).filter(x => x.endsWith(".jar")).sort().map(x => path.join(jarDir, x)) : [];
    const source = this.options.source ?? path.resolve(__dirname, "../../../bridges/java/Bridge.java");
    const args = [...(this.options.headless ? ["-Djava.awt.headless=true"] : []), "-cp", [".", ...jars].join(path.delimiter), source];
    const child = spawn(this.options.java ?? "java", args, { stdio: "pipe" }); this.child = child;
    child.stderr.on("data", () => {});
    readline.createInterface({ input: child.stdout }).on("line", line => { try { void this.onMessage(JSON.parse(line)); } catch (e) { this.fail(new Error(`Java bridge sent invalid JSON: ${String(e)}`)); } });
    child.on("error", e => this.fail(new Error(`Java bridge failed to start: ${e.message}`)));
    child.on("exit", (code, signal) => this.fail(new Error(`Java bridge exited unexpectedly (${signal ?? code})`)));
    process.once("exit", this.exitHook);
  }
  private fail(e: Error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(e); } this.pending.clear(); this.closed = true; }
  private async onMessage(msg: any) {
    if (typeof msg.callback === "number") {
      try { const f = this.callbacks.get(msg.callback); if (!f) throw new Error(`Unknown callback ${msg.callback}`); const value = await f(...(msg.args ?? []).map((x: any) => this.decode(x))); this.child?.stdin.write(JSON.stringify({ ok: true, value: this.encode(value) }) + "\n"); }
      catch (e) { this.child?.stdin.write(JSON.stringify({ ok: false, error: String(e) }) + "\n"); } return;
    }
    const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id); clearTimeout(p.timer);
    if (msg.ok) p.resolve(this.decode(msg.value)); else p.reject(new JavaBridgeError(msg.error?.type ?? "JavaError", msg.error?.message ?? "unknown error", msg.error?.trace ?? ""));
  }
  private encode(v: any): any {
    if (typeof v === "bigint") return { $int: v.toString() };
    if (v && v.__javaHandle) return { $h: v.__javaHandle.$h };
    if (typeof v === "function") { const id = ++this.callbackId; this.callbacks.set(id, v); return { $callback: id }; }
    if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString("base64") };
    if (Array.isArray(v)) return v.map(x => this.encode(x));
    if (v instanceof Map) return Object.fromEntries([...v].map(([k,x]) => [k, this.encode(x)]));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x]) => [k, this.encode(x)]));
    return v;
  }
  private decode(v: any): any {
    if (Array.isArray(v)) return v.map(x => this.decode(x));
    if (v && typeof v === "object") { if (typeof v.$h === "number") return this.proxy(v); if (v.$int !== undefined) return BigInt(v.$int); if (v.$bytes !== undefined) return Uint8Array.from(Buffer.from(v.$bytes, "base64")); return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,this.decode(x)])); }
    return typeof v === "number" && Number.isInteger(v) ? BigInt(v) : v;
  }
  private proxy(h: WireHandle): any {
    const self = this; const base = function (...args: any[]) { return self.request("new", { target: h, args }); };
    const p = new Proxy(base, { get(_t, key) { if (key === "__javaHandle") return h; if (key === "then") return undefined; if (key === "$get") return (name: string) => self.request("get", { target: h, name }); if (key === "$set") return (name: string, value: any) => self.request("set", { target: h, name, value }); if (key === "$release") return () => { self.finalizer.unregister(p); return self.request("release", { handles: [h.$h] }); }; if (key === "$iter") return (max = 100) => self.request("iter", { target: h, max }); if (key === "$type") return h.type; if (typeof key === "string") return (...args: any[]) => self.request("call", { target: h, name: key, args }); return undefined; } });
    this.finalizer.register(p, h.$h, p); return p;
  }
  request(op: string, fields: Record<string, any> = {}): Promise<any> {
    try { this.start(); } catch (e) { return Promise.reject(e); }
    const id = ++this.id; return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Java bridge timed out during ${op}`)); this.close(); }, this.options.timeoutMs ?? 15000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.child!.stdin.write(JSON.stringify({ id, op, ...this.encode(fields) }) + "\n"); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  importClass(module: string): Promise<any> { return this.request("import", { module }); }
  close() { if (this.closed && !this.child) return; this.closed = true; process.removeListener("exit", this.exitHook); const c = this.child; this.child = undefined; c?.kill(); this.fail(new Error("Java bridge closed")); }
}

export interface MavenLockEntry { group: string; artifact: string; version: string; sha256: string; file: string; }
/** Resolve into the supplied project; repository can be a local fixture directory. */
export async function installMaven(spec: string, projectDir: string, repository = process.env.PLY_MAVEN_REPO || "https://repo.maven.apache.org/maven2"): Promise<MavenLockEntry[]> {
  const parts = spec.split(":"); if (parts.length < 2 || parts.length > 3 || parts.some(x => !/^[A-Za-z0-9_.-]+$/.test(x))) throw new Error("Expected Maven group:artifact[:version]");
  const read = async (relative: string): Promise<Buffer> => {
    if (!repository.startsWith("https://")) return fs.promises.readFile(path.join(repository, relative));
    return new Promise((resolve,reject) => { https.get(`${repository.replace(/\/$/, "")}/${relative}`, res => { if (res.statusCode !== 200) { res.resume(); reject(new Error(`Maven HTTP ${res.statusCode} for ${relative}`)); return; } const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve(Buffer.concat(chunks))); }).on("error", reject); });
  };
  const entries: MavenLockEntry[] = [], seen = new Set<string>();
  const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml)?.[1]?.trim();
  async function visit(group: string, artifact: string, version?: string) {
    const base = `${group.replace(/\./g,"/")}/${artifact}`;
    if (!version) { const meta = (await read(`${base}/maven-metadata.xml`)).toString(); const versions = [...meta.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]).filter(v => !/(?:alpha|beta|rc|snapshot|milestone|preview)/i.test(v)); version = tag(meta,"release") ?? versions.at(-1); if (!version) throw new Error(`No stable Maven version for ${group}:${artifact}`); }
    if (!/^[A-Za-z0-9_.-]+$/.test(version)) throw new Error("Invalid Maven version"); const key = `${group}:${artifact}`; if (seen.has(key)) return; seen.add(key);
    const prefix = `${base}/${version}/${artifact}-${version}`; const pom = (await read(`${prefix}.pom`)).toString();
    const jar = await read(`${prefix}.jar`); const dir = path.join(projectDir,".ply","java"); await fs.promises.mkdir(dir,{recursive:true}); const file = `${group}-${artifact}-${version}.jar`; await fs.promises.writeFile(path.join(dir,file),jar); entries.push({group,artifact,version,sha256:crypto.createHash("sha256").update(jar).digest("hex"),file});
    const deps = /<dependencies>([\s\S]*?)<\/dependencies>/.exec(pom)?.[1] ?? "";
    for (const m of deps.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) { const d=m[1], scope=tag(d,"scope") ?? "compile"; if (scope!=="compile" || tag(d,"optional")==="true") continue; const g=tag(d,"groupId"), a=tag(d,"artifactId"), v=tag(d,"version"); if (!g||!a||!v||v.includes("${")) throw new Error(`Unsupported Maven dependency in ${key}: explicit group, artifact and version required`); await visit(g,a,v); }
  }
  await visit(parts[0],parts[1],parts[2]); return entries;
}
