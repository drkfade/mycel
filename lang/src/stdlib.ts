import * as fs from "fs";
import * as nodePath from "path";
import * as crypto from "crypto";
import { withinPath, ordinaryWindowsPath, removeTree } from "./paths";
import { Panic, Runtime, display, eq, kindOf, makeTuple } from "./runtime";

/** What a run may touch. Absent = denied. */
export interface Capabilities {
  fs?: { read?: string[] | true; write?: string[] | true };
  net?: { hosts?: string[] | true; listen?: boolean };
  process?: { run?: string[] | true };
  env?: { read?: string[] | true };
  /** Python / npm / Java packages this run may call (by install name, or true for all): a granted package runs with the
   *  full power of the user's account (foreign.ts) */
  packages?: { python?: string[] | true; npm?: string[] | true; java?: string[] | true };
  /** Grant calling Java JDK classes and installed Maven JARs via `--java`. */
  java?: boolean;
  /** Desktop automation & system control (`computer` package): mouse, keyboard, apps, notify, system. */
  control?: boolean;
  /** Screen capture & pixel inspection (`computer.screen`). */
  screen?: boolean;
  /** Clipboard read/write (`computer.clipboard`). */
  clipboard?: boolean;
  /** Pure computation with no outside access (`tensor` package maths). A package that declares only this needs no grant. */
  compute?: boolean;
}
export interface StdinReader { readLine(): Promise<string | null> }

type Fn = (...a: any[]) => any;
const N = (x: bigint | number) => Number(x);

/** Deepest existing ancestor resolved through symlinks, so `..` and symlink escapes cannot leave a granted root. */
function realish(p: string): string {
  if (process.platform === "win32" && !ordinaryWindowsPath(p)) throw new Error("not an ordinary Windows file path");
  const abs = nodePath.resolve(p);
  let cur = abs, rest: string[] = [];
  for (;;) {
    try { return nodePath.join(fs.realpathSync(cur), ...rest.reverse()); }
    catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      // A dangling link is an existing object: falling back to its parent would
      // let a later write follow the link outside a grant.
      try { fs.lstatSync(cur); } catch (missing: any) {
        if (missing.code !== "ENOENT") throw missing;
        const parent = nodePath.dirname(cur);
        if (parent === cur) throw e;
        rest.push(nodePath.basename(cur)); cur = parent; continue;
      }
      throw e;
    }
  }
}

/** Check whether `path` is allowed under `caps.fs[mode]` and return its resolved safe path or a denial message. */
export function checkFsAccess(caps: Capabilities, path: string, mode: "read" | "write"): { path: string } | { why: string } {
  const roots = caps.fs?.[mode] ?? [];
  if (roots !== true && !roots.length) return { why: `this run was not granted ${mode} access to the file system (run with --allow-${mode})` };
  let real: string;
  try {
    real = realish(path);
    if (roots === true) return { path: real };
    for (const r of roots) {
      const root = realish(r);
      if (withinPath(root, real)) return { path: real };
    }
  } catch (e: any) {
    return { why: `cannot resolve a safe file path: ${e.message}` };
  }
  return { why: `outside the granted ${mode} locations (${roots.join(", ")}) (run with --allow-${mode}=<path>)` };
}

let lastUiContext: any = null;

export function stdNatives(rt: Runtime, caps: Capabilities, args: string[], stdin?: StdinReader, inputSync?: () => string | null): Record<string, Fn> {
  const ctx = rt.ctx;
  lastUiContext = ctx;
  const P = () => ctx.M["prelude"];
  const ok = (v: unknown) => P().Result$Ok.of(v);
  const mkErr = (cls: string, msg: string) => new (P()[cls])().$init(msg);
  const bad = (cls: string, msg: string) => P().Result$Err.of(mkErr(cls, msg));
  const denied = (what: string, why: string) => bad("CapabilityError", `${what} denied: ${why}`);
  const cleanups: (() => void)[] = ((ctx as any).cleanups ??= []);
  const timers = new Set<NodeJS.Timeout>();
  cleanups.push(() => { for (const t of timers) clearTimeout(t); timers.clear(); });
  const tryIo = <T>(f: () => T): any => {
    try { return ok(f()); } catch (e: any) { return bad("IoError", e?.code ? `${e.code}: ${e.message}` : String(e?.message ?? e)); }
  };

  // ----- fs -----
  const fsCheck = (path: string, mode: "read" | "write"): { path: string } | { denied: any } => {
    const roots = caps.fs?.[mode] ?? [];
    if (roots !== true && !roots.length) return { denied: denied(`fs.${mode} of ${JSON.stringify(path)}`, `this run was not granted ${mode} access to the file system (run with --allow-${mode})`) };
    let real: string;
    try {
      real = realish(path);
      if (roots === true) return { path: real };
      for (const r of roots) {
        const root = realish(r);
        if (withinPath(root, real)) return { path: real };
      }
    } catch (e: any) {
      return { denied: denied(`fs.${mode} of ${JSON.stringify(path)}`, `cannot resolve a safe file path: ${e.message}`) };
    }
    return { denied: denied(`fs.${mode} of ${JSON.stringify(path)}`, `outside the granted ${mode} locations (${roots.join(", ")}) (run with --allow-${mode}=<path>)`) };
  };
  const withFs = (mode: "read" | "write", f: (p: string, ...rest: any[]) => unknown) => (path: string, ...rest: any[]) => {
    const c = fsCheck(path, mode);
    if ("denied" in c) return c.denied;
    return tryIo(() => f(c.path, ...(rest as [])));
  };
  const MAX_FILE = 50_000_000;

  // ----- json -----
  const J = () => ctx.M["std.json"];
  const fromJs = (v: any, depth = 0): any => {
    if (depth > 200) throw new Panic("JSON nesting is too deep");
    const j = J();
    if (v === null) return j.Json$Null.v;
    switch (typeof v) {
      case "boolean": return j.Json$Bool.of(v);
      case "number": return j.Json$Num.of(v);
      case "string": return j.Json$Str.of(v);
    }
    if (Array.isArray(v)) return j.Json$Arr.of(v.map((x) => fromJs(x, depth + 1)));
    const m = new Map<string, any>();
    for (const k of Object.keys(v)) m.set(k, fromJs(v[k], depth + 1));
    return j.Json$Obj.of(m);
  };
  const toJs = (v: any, depth = 0): any => {
    if (depth > 200) throw new Panic("JSON nesting is too deep");
    switch (v.$t) {
      case 0: return null;
      case 1: return v._0;
      case 2: return Number.isFinite(v._0) ? v._0 : null;
      case 3: return v._0;
      case 4: return v._0.map((x: any) => toJs(x, depth + 1));
      default: { const o: Record<string, any> = Object.create(null); for (const [k, x] of v._0) o[k] = toJs(x, depth + 1); return o; }
    }
  };
  const encodeAny = (v: any, seen: Set<any>, depth = 0): any => {
    if (depth > 200) throw new Panic("value is nested too deeply to encode");
    if (v === null || v === undefined) return null;
    switch (typeof v) {
      case "bigint": return Number(v);
      case "number": return Number.isFinite(v) ? v : null;
      case "boolean": case "string": return v;
      case "function": throw new Panic("a function cannot be encoded as JSON");
    }
    if (seen.has(v)) throw new Panic("cannot encode a value that contains itself");
    seen.add(v);
    try {
      if (Array.isArray(v)) return v.map((x) => encodeAny(x, seen, depth + 1));
      if (v instanceof Set) return [...v].map((x) => encodeAny(x, seen, depth + 1));
      if (v instanceof Map) { const o: Record<string, any> = Object.create(null); for (const [k, x] of v) o[String(k)] = encodeAny(x, seen, depth + 1); return o; }
      const c = v.constructor;
      if (c?.$ename) {
        if (c.$ename === "Json") return toJs(v);
        const fields: string[] = c.$fields ?? [];
        if (!fields.length) return c.$tag;
        const o: Record<string, any> = Object.create(null); o.tag = c.$tag;
        fields.forEach((f, i) => { o[c.$fieldNames?.[i] ?? f.replace(/^_/, "")] = encodeAny(v[f], seen, depth + 1); });
        return o;
      }
      if (c?.$fields) { const o: Record<string, any> = Object.create(null); for (const f of c.$fields as string[]) o[f.replace(/_$/, "")] = encodeAny(v[f], seen, depth + 1); return o; }
      throw new Panic(`${kindOf(v)} cannot be encoded as JSON`);
    } finally { seen.delete(v); }
  };

  // ----- channel -----
  class Channel {
    q: any[] = []; waiters: ((v: any) => void)[] = []; closed = false;
    send(v: any) {
      if (this.closed) throw new Panic("send on a closed channel");
      const w = this.waiters.shift();
      if (w) w(v); else { if (this.q.length >= ctx.limits.maxCollection) throw new Panic("channel buffer limit exceeded", "limit", "memory"); this.q.push(v); }
    }
    close() { this.closed = true; for (const w of this.waiters.splice(0)) w(null); }
    recv(): Promise<any> {
      if (this.q.length) return Promise.resolve(this.q.shift());
      if (this.closed) return Promise.resolve(null);
      return new Promise((res) => this.waiters.push(res));
    }
  }

  // ----- http -----
  const hostAllowed = (url: URL): string | undefined => {
    const h = caps.net?.hosts;
    if (h === true) return undefined;
    if (!h || !h.length) return "this run was not granted network access";
    return h.some((x) => x === url.hostname || x === url.host) ? undefined : `${url.host} is not in the granted hosts (${h.join(", ")})`;
  };
  const toHeaders = (m: Map<string, string>) => Object.fromEntries(m);
  const httpRequest = async (method: string, urlText: string, body: string, headers: Map<string, string>): Promise<any> => {
    let url: URL;
    try { url = new URL(urlText); } catch { return bad("NetError", `invalid URL ${JSON.stringify(urlText)}`); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return bad("NetError", `unsupported URL scheme ${url.protocol}`);
    let m = method.toUpperCase(), b: string | undefined = body || undefined;
    for (let hop = 0; hop < 6; hop++) {
      const why = hostAllowed(url);
      if (why) return denied(`network request to ${url.host}`, why);
      const signals = [AbortSignal.timeout(30000)];
      if (ctx.signal) signals.push(ctx.signal);
      let res: Response;
      try { res = await fetch(url, { method: m, body: m === "GET" || m === "HEAD" ? undefined : b, headers: toHeaders(headers), redirect: "manual", signal: AbortSignal.any(signals) }); }
      catch (e: any) { return bad("NetError", `request to ${url.host} failed: ${e?.cause?.code ?? e?.name}: ${e?.message}`); }
      if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && m === "POST")) { m = "GET"; b = undefined; }
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 5_000_000) return bad("NetError", "response body is larger than 5 MB");
      const hs = new Map<string, string>(); res.headers.forEach((v, k) => hs.set(k, v));
      return ok(new (ctx.M["std.http"].Response)().$init(BigInt(res.status), buf.toString("utf8"), hs));
    }
    return bad("NetError", "too many redirects");
  };
  const serve = (port: bigint, handler: Fn, isAsync: boolean): any => {
    if (!caps.net?.listen) return denied("starting an HTTP server", "this run was not granted `net.listen` (run it with --allow-listen)");
    const http = require("http") as typeof import("http");
    const server = http.createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 1_000_000) { res.writeHead(413).end("request body too large"); return; } chunks.push(c as Buffer); }
        const u = new URL(req.url ?? "/", "http://localhost");
        const query = new Map<string, string>(); u.searchParams.forEach((v, k) => query.set(k, v));
        const headers = new Map<string, string>(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const request = new (ctx.M["std.http"].Request)().$init(req.method ?? "GET", u.pathname, query, headers, Buffer.concat(chunks).toString("utf8"));
        const r = isAsync ? await handler(request) : handler(request);
        const response = r;
        const outHeaders: Record<string, string> = {}; for (const [k, v] of response.headers as Map<string, string>) outHeaders[k] = v;
        res.writeHead(Number(response.status), outHeaders).end(response.body);
      } catch (e) {
        ctx.taskErrors.push(e);
        try { res.writeHead(500, { "content-type": "text/plain" }).end("internal server error"); } catch { /* already sent */ }
      }
    });
    return new Promise<any>((resolve) => {
      server.once("error", (e: any) => resolve(bad("NetError", `cannot listen on port ${port}: ${e.code ?? e.message}`)));
      server.listen(N(port), "127.0.0.1", () => {
        const handle = { server, get port() { return BigInt((server.address() as any).port); } };
        cleanups.push(() => { server.closeAllConnections?.(); server.close(); });
        resolve(ok(handle));
      });
    });
  };
  // ----- regex -----
  const reCheck = (text: string) => { if (text.length > 1_000_000) throw new Panic("regex input is larger than 1 MB"); };
  const mkMatch = (m: RegExpExecArray) => {
    const named = new Map<string, string>(); for (const [k, v] of Object.entries(m.groups ?? {})) if (v !== undefined) named.set(k, v);
    return new (ctx.M["std.re"].Match)().$init(m[0], BigInt(m.index), BigInt(m.index + m[0].length), m.slice(1).map((g) => (g === undefined ? null : g)), named);
  };

  const sqliteRows = (rows: any[]) => rows.map((r) => new Map(Object.entries(r)));

  const uiManager = ((ctx as any).uiManager ??= {
    counter: 0,
    windows: new Map<string, any>(),
    elements: new Map<string, any>(),
    handlers: new Map<string, Map<string, Function>>(),
    activeWindow: null as any,
    lastTree: null as any,
    getActiveTree: () => uiManager.lastTree ?? (uiManager.activeWindow ? serializeUiWindow(uiManager.activeWindow) : undefined),
  });

  const natives: Record<string, Fn> = {
    // ----- std.task -----
    "std.task.sleep": (ms: bigint) => new Promise<void>((res) => {
      // a pending sleep must keep the process alive (otherwise a CLI run would exit silently mid-await);
      // timers left over when the run ends (abort, limit) are cleared by the cleanups
      const t = setTimeout(() => { timers.delete(t); res(); }, Math.max(0, N(ms)));
      timers.add(t);
    }),
    "std.task.all": (ts: Promise<any>[]) => Promise.all(ts),
    "std.task.race": (ts: Promise<any>[]) => Promise.race(ts),
    "std.task.timeout": (ms: bigint, task: Promise<any>) => new Promise<any>((res) => {
      const t = setTimeout(() => res(bad("TimeoutError", `timed out after ${ms} ms`)), Math.max(0, N(ms)));
      task.then((v) => { clearTimeout(t); res(ok(v)); }, (e) => { clearTimeout(t); res(P().Result$Err.of(e)); });
    }),
    // Go's select: wait on several channels, first value wins. The losers' waiters are removed, so no value is lost —
    // race([a.recv(), b.recv()]) leaves the losing recv registered and the next value sent there vanishes into it.
    "std.task.select": (cs: Channel[], ms?: bigint) => {
      if (!cs.length) throw new Panic("select needs at least one channel");
      const ready = cs.findIndex((c) => c.q.length > 0);
      if (ready >= 0) return Promise.resolve(makeTuple(BigInt(ready), cs[ready].q.shift()));
      const closed = cs.findIndex((c) => c.closed);
      if (closed >= 0) return Promise.resolve(makeTuple(BigInt(closed), null));
      return new Promise<any>((res) => {
        let t: ReturnType<typeof setTimeout> | undefined;
        const done = () => {
          cs.forEach((c, i) => { const k = c.waiters.indexOf(ws[i]); if (k >= 0) c.waiters.splice(k, 1); });
          if (t) { clearTimeout(t); timers.delete(t); }
        };
        const ws = cs.map((c, i) => { const w = (v: any) => { done(); res(makeTuple(BigInt(i), v)); }; c.waiters.push(w); return w; });
        if (ms !== undefined) { t = setTimeout(() => { done(); res(null); }, Math.max(0, N(ms))); timers.add(t); }
      });
    },
    "std.task.Channel.init": () => new Channel(),
    "std.task.Channel.get_length": (c: Channel) => BigInt(c.q.length),
    "std.task.Channel.get_isClosed": (c: Channel) => c.closed,
    "std.task.Channel.send": (c: Channel, v: any) => c.send(v),
    "std.task.Channel.close": (c: Channel) => c.close(),
    "std.task.Channel.recv": (c: Channel) => c.recv(),

    // ----- std.math -----
    ...Object.fromEntries(["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log2", "log10", "sqrt"].map((n) => [`std.math.${n}`, (Math as any)[n]])),
    "std.math.pow": (x: number, y: number) => x ** y,
    "std.math.random": () => Math.random(),
    "std.math.randomInt": (lo: bigint, hi: bigint) => { if (hi <= lo) throw new Panic(`randomInt: empty range ${lo}..${hi}`); return lo + BigInt(Math.floor(Math.random() * N(hi - lo))); },

    // ----- std.json -----
    "std.json.parse": (text: string) => {
      if (text.length > 20_000_000) return bad("ParseError", "JSON text is larger than 20 MB");
      try { return ok(fromJs(JSON.parse(text))); } catch (e: any) { return e instanceof Panic ? bad("ParseError", e.message) : bad("ParseError", `invalid JSON: ${e.message}`); }
    },
    "std.json.stringify": (v: any) => JSON.stringify(toJs(v)),
    "std.json.pretty": (v: any) => JSON.stringify(toJs(v), null, 2),
    "std.json.encode": (v: any) => JSON.stringify(encodeAny(v, new Set())),
    // std.web: form bodies (a=1&b=two+words) and a server the run waits on until it is stopped
    "std.web.decodeForm": (body: string) => { const m = new Map<string, string>(); new URLSearchParams(body).forEach((v, k) => m.set(k, v)); return m; },
    "std.web.runForever": (port: bigint, handler: Fn) => {
      const keep: Promise<unknown>[] = ((ctx as any).keepAlive ??= []);
      keep.push((async () => {
        const r = await serve(port, handler, false);
        const payload = r[r.constructor.$fields[0]]; // a Result variant keeps its value in its first field
        if (r instanceof P().Result$Err) throw new Panic(String(payload?.message ?? payload ?? "could not start the server"));
        ctx.write(`Serving on http://127.0.0.1:${payload.port} (Ctrl-C to stop)\n`);
        return new Promise(() => { /* until the process is stopped */ });
      })());
    },

    // ----- std.fs -----
    "std.fs.join": (a: string, b: string) => nodePath.join(a, b),
    "std.fs.dirname": (p: string) => nodePath.dirname(p),
    "std.fs.basename": (p: string) => nodePath.basename(p),
    "std.fs.readText": withFs("read", (p) => { const st = fs.statSync(p); if (st.size > MAX_FILE) throw Object.assign(new Error(`file is larger than ${MAX_FILE} bytes`), { code: "EFBIG" }); return fs.readFileSync(p, "utf8"); }),
    "std.fs.writeText": withFs("write", (p, t: string) => { if (t.length > MAX_FILE) throw Object.assign(new Error("text is too large"), { code: "EFBIG" }); fs.writeFileSync(p, t); }),
    "std.fs.appendText": withFs("write", (p, t: string) => { fs.appendFileSync(p, t); }),
    "std.fs.exists": withFs("read", (p) => fs.existsSync(p)),
    "std.fs.isDir": withFs("read", (p) => fs.statSync(p).isDirectory()),
    "std.fs.list": withFs("read", (p) => fs.readdirSync(p).sort()),
    "std.fs.mkdirs": withFs("write", (p) => { fs.mkdirSync(p, { recursive: true }); }),
    "std.fs.remove": withFs("write", (p) => { removeTree(p); }),
    "std.fs.size": withFs("read", (p) => BigInt(fs.statSync(p).size)),

    // ----- std.env -----
    "std.env.args": () => [...args],
    "std.env.get": (name: string) => {
      const g = caps.env?.read;
      // Windows environment names are case-insensitive (Path = PATH): a grant names the variable, not its spelling
      const granted = g === true || (g ?? []).some((x: string) => process.platform === "win32" ? x.toUpperCase() === name.toUpperCase() : x === name);
      if (g !== true && !granted) return denied(`reading environment variable ${name}`, "this run was not granted access to it");
      return ok(process.env[name] ?? null);
    },
    "std.env.platform": () => process.platform,

    // ----- std.process -----
    "std.process.run": (command: string, a: string[] = [], input = "", timeoutMs: bigint = 30000n) => {
      const g = caps.process?.run;
      if (g !== true && !(g ?? []).includes(command)) return denied(`running ${JSON.stringify(command)}`, "this run was not granted permission to start that program");
      const cp = require("child_process") as typeof import("child_process");
      if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) return bad("IoError", "batch files require a command interpreter; std.process runs executables without a shell");
      const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "" };
      if (process.platform === "win32" && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
      const r = cp.spawnSync(command, a, { input, timeout: N(timeoutMs), encoding: "utf8", maxBuffer: 5_000_000, shell: false, windowsHide: true, env });
      if (r.error) return bad("IoError", `${(r.error as any).code ?? "error"}: ${r.error.message}`);
      return ok(new (ctx.M["std.process"].Output)().$init(BigInt(r.status ?? -1), r.stdout ?? "", r.stderr ?? ""));
    },
    "std.process.pid": () => BigInt(process.pid),

    // ----- std.time -----
    "std.time.nowMs": () => BigInt(Date.now()),
    "std.time.monotonicMs": () => Number(process.hrtime.bigint()) / 1e6,
    "std.time.iso": (ms: bigint) => { const d = new Date(N(ms)); if (Number.isNaN(d.getTime())) throw new Panic(`${ms} is not a valid timestamp`); return d.toISOString(); },
    "std.time.parseIso": (t: string) => { const v = Date.parse(t); return Number.isNaN(v) ? null : BigInt(v); },
    "std.time.parts": (ms: bigint) => {
      const d = new Date(N(ms)); if (Number.isNaN(d.getTime())) throw new Panic(`${ms} is not a valid timestamp`);
      return new (ctx.M["std.time"].Parts)().$init(BigInt(d.getUTCFullYear()), BigInt(d.getUTCMonth() + 1), BigInt(d.getUTCDate()), BigInt(d.getUTCHours()), BigInt(d.getUTCMinutes()), BigInt(d.getUTCSeconds()), BigInt(d.getUTCDay()));
    },

    // ----- std.re -----
    "std.re.Regex.compile": (pattern: string, flags = "") => {
      if (pattern.length > 2000) return bad("ParseError", "regex pattern is longer than 2000 characters");
      if (!/^[imsu]*$/.test(flags)) return bad("ParseError", `unsupported regex flags ${JSON.stringify(flags)} (allowed: i m s u)`);
      try { return ok({ re: new RegExp(pattern, flags + "g") }); } catch (e: any) { return bad("ParseError", `invalid regex: ${e.message}`); }
    },
    "std.re.Regex.isMatch": (r: any, t: string) => { reCheck(t); r.re.lastIndex = 0; return r.re.test(t); },
    "std.re.Regex.find": (r: any, t: string) => { reCheck(t); r.re.lastIndex = 0; const m = r.re.exec(t); return m ? mkMatch(m) : null; },
    "std.re.Regex.findAll": (r: any, t: string) => {
      reCheck(t); r.re.lastIndex = 0; const out: any[] = []; let m: RegExpExecArray | null;
      while ((m = r.re.exec(t))) { out.push(mkMatch(m)); if (m[0] === "") r.re.lastIndex++; if (out.length > ctx.limits.maxCollection) break; }
      return out;
    },
    "std.re.Regex.replace": (r: any, t: string, w: string) => { reCheck(t); r.re.lastIndex = 0; return t.replace(r.re, () => w); },
    "std.re.Regex.split": (r: any, t: string) => { reCheck(t); r.re.lastIndex = 0; return t.split(r.re); },

    // ----- std.test -----
    "std.test.assertEq": (a: any, b: any, msg = "") => { if (!eq(a, b)) throw new Panic(`${msg ? msg + ": " : ""}assertion failed: expected ${display(b, true)}, got ${display(a, true)}`); },
    "std.test.assertNe": (a: any, b: any, msg = "") => { if (eq(a, b)) throw new Panic(`${msg ? msg + ": " : ""}assertion failed: both values are ${display(a, true)}`); },

    // ----- std.crypto -----
    "std.crypto.sha256": (t: string) => crypto.createHash("sha256").update(t).digest("hex"),
    "std.crypto.sha1": (t: string) => crypto.createHash("sha1").update(t).digest("hex"),
    "std.crypto.hmacSha256": (k: string, t: string) => crypto.createHmac("sha256", k).update(t).digest("hex"),
    "std.crypto.randomHex": (n: bigint) => { if (n < 0n || n > 1_000_000n) throw new Panic("randomHex: n must be between 0 and 1000000"); return crypto.randomBytes(N(n)).toString("hex"); },
    "std.crypto.uuid": () => crypto.randomUUID(),
    "std.crypto.base64Encode": (t: string) => Buffer.from(t, "utf8").toString("base64"),
    "std.crypto.base64Decode": (t: string) => (/^[A-Za-z0-9+/_-]*={0,2}$/.test(t) ? ok(Buffer.from(t, "base64").toString("utf8")) : bad("ParseError", "not valid base64")),
    "std.crypto.hexEncode": (t: string) => Buffer.from(t, "utf8").toString("hex"),

    // ----- input() (prelude) -----
    input: (prompt: string = "") => {
      if (prompt) { rt.ctx.outputBytes += prompt.length; rt.ctx.write(prompt); }
      const line = inputSync ? inputSync() : null;
      if (line === null) throw new Panic("input(): there is no more input" + (inputSync ? "" : " (this host gives the program no input)"));
      return line;
    },

    // ----- std.io -----
    "std.io.readLine": async () => (stdin ? stdin.readLine() : null),

    // ----- std.http -----
    "std.http.get": (url: string, h: Map<string, string> = new Map()) => httpRequest("GET", url, "", h),
    "std.http.post": (url: string, body: string, h: Map<string, string> = new Map()) => httpRequest("POST", url, body, h),
    "std.http.request": (m: string, url: string, body = "", h: Map<string, string> = new Map()) => httpRequest(m, url, body, h),
    "std.http.Server.get_port": (s: any) => s.port,
    "std.http.Server.stop": (s: any) => { s.server.closeAllConnections?.(); s.server.close(); },

    // ----- std.sqlite -----
    "std.sqlite.Db.open": (path: string) => {
      let real = ":memory:";
      if (path !== ":memory:") { const c = fsCheck(path, "write"); if ("denied" in c) return c.denied; real = c.path; }
      try {
        const { DatabaseSync } = require("node:sqlite");
        return ok({ db: new DatabaseSync(real) });
      } catch (e: any) { return bad("SqlError", e.message); }
    },
    "std.sqlite.Db.exec": (d: any, sql: string, params: any[] = []) => {
      try { d.db.prepare(sql).run(...params.map(sqlParam)); return ok(undefined); } catch (e: any) { return bad("SqlError", e.message); }
    },
    "std.sqlite.Db.query": (d: any, sql: string, params: any[] = []) => {
      try { const st = d.db.prepare(sql); st.setReadBigInts(true); return ok(sqliteRows(st.all(...params.map(sqlParam)))); } catch (e: any) { return bad("SqlError", e.message); }
    },
    "std.sqlite.Db.close": (d: any) => { try { d.db.close(); } catch { /* already closed */ } },

    // ----- std.ui -----
    "std.ui.newId": () => `ui_${++uiManager.counter}`,
    "std.ui.registerHandler": (id: string, event: string, handler: any) => {
      let m = uiManager.handlers.get(id);
      if (!m) { m = new Map(); uiManager.handlers.set(id, m); }
      m.set(event, handler);
    },
    "std.ui.mountWindow": (win: any) => {
      uiManager.windows.set(win.id, win);
      uiManager.activeWindow = win;
      registerElements(win.content, uiManager.elements);
      const root = serializeUiWindow(win);
      uiManager.lastTree = root;
      if (typeof (ctx as any).onUi === "function") {
        (ctx as any).onUi({ type: "ui:render", root });
      }
    },
    "std.ui.notifyUpdate": (_id: string, _prop: string, _value: string) => {
      if (uiManager.activeWindow) {
        registerElements(uiManager.activeWindow.content, uiManager.elements);
        const root = serializeUiWindow(uiManager.activeWindow);
        uiManager.lastTree = root;
        if (typeof (ctx as any).onUi === "function") {
          (ctx as any).onUi({ type: "ui:render", root });
        }
      }
    },
    "std.ui.notifyChildren": (_id: string, _children: any[]) => {
      if (uiManager.activeWindow) {
        registerElements(uiManager.activeWindow.content, uiManager.elements);
        const root = serializeUiWindow(uiManager.activeWindow);
        uiManager.lastTree = root;
        if (typeof (ctx as any).onUi === "function") {
          (ctx as any).onUi({ type: "ui:render", root });
        }
      }
    },
    "std.ui.closeWindow": (id: string) => {
      uiManager.windows.delete(id);
      if (uiManager.activeWindow?.id === id) {
        uiManager.activeWindow = null;
        uiManager.lastTree = null;
      }
      if (typeof (ctx as any).onUi === "function") {
        (ctx as any).onUi({ type: "ui:close", id });
      }
    },
  };
  natives["std.http.serve"] = (port: bigint, handler: Fn) => serve(port, handler, false);
  natives["std.http.serveAsync"] = (port: bigint, handler: Fn) => serve(port, handler, true);
  return natives;
}

export interface UiElementData {
  id: string;
  kind: string;
  text: string;
  placeholder: string;
  src: string;
  alt: string;
  children: UiElementData[];
}

export interface UiWindowData {
  type: "window";
  id: string;
  title: string;
  width: number;
  height: number;
  content: UiElementData | null;
}

export function serializeUiElement(el: any): UiElementData | null {
  if (!el) return null;
  const id = String(el.id ?? "");
  const kind = String(el.kind ?? "");
  const text = String(el.text ?? "");
  const placeholder = String(el.placeholder ?? "");
  const src = String(el.src ?? "");
  const alt = String(el.alt ?? "");
  const rawChildren = Array.isArray(el.children) ? el.children : [];
  const children = rawChildren.map(serializeUiElement).filter(Boolean) as UiElementData[];
  return { id, kind, text, placeholder, src, alt, children };
}

export function serializeUiWindow(win: any): UiWindowData | null {
  if (!win) return null;
  return {
    type: "window",
    id: String(win.id ?? ""),
    title: String(win.title ?? ""),
    width: Number(win.width ?? 400),
    height: Number(win.height ?? 500),
    content: serializeUiElement(win.content),
  };
}

export function registerElements(el: any, map: Map<string, any>) {
  if (!el || !el.id) return;
  map.set(el.id, el);
  if (Array.isArray(el.children)) {
    for (const c of el.children) registerElements(c, map);
  }
}

export function dispatchUiEvent(a: any, b: string, c?: string, d?: string): UiWindowData | null {
  let ctx: any;
  let id: string;
  let event: string;
  let value: string | undefined;
  if (typeof a === "string") {
    ctx = lastUiContext;
    id = a;
    event = b;
    value = c;
  } else {
    ctx = a ?? lastUiContext;
    id = b;
    event = c ?? "";
    value = d;
  }
  const mgr = ctx?.uiManager;
  if (!mgr) return null;
  if (event === "input" || event === "change") {
    const el = mgr.elements?.get(id);
    if (el) el.text = value ?? "";
  }
  const handlers = mgr.handlers.get(id);
  const fn = handlers?.get(event);
  if (typeof fn === "function") {
    if (event === "input" || event === "change") {
      fn(value ?? "");
    } else {
      fn();
    }
  }
  const serialized = mgr.activeWindow ? serializeUiWindow(mgr.activeWindow) : mgr.lastTree;
  if (serialized) {
    mgr.lastTree = serialized;
    if (typeof ctx?.onUi === "function") {
      ctx.onUi({ type: "ui:render", root: serialized });
    }
  }
  return serialized;
}

function sqlParam(v: any): any {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  return v;
}
