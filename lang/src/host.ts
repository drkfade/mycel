import * as vm from "vm";
import { Diagnostic, DiagnosticJson, Source, Span, formatDiagnostic, toJson } from "./diag";
import { compileProgram, makeResolver, Program, renderDiagnostics } from "./modules";
import { generate } from "./codegen";
import { createRuntime, newCtx, Panic, RunLimits, Runtime, LiveValue, liveValues } from "./runtime";
import { preludeNatives } from "./natives";
import { stdNatives, Capabilities, StdinReader } from "./stdlib";
import { ModuleInfo } from "./types";

export { Capabilities } from "./stdlib";
export interface HostModule { source: string; natives: Record<string, (...a: any[]) => any> }
export interface RunOptions {
  /** Program text (the entry module). */
  source?: string;
  /** Name shown in diagnostics; also the base for relative imports when `roots` is not given. */
  file?: string;
  roots?: string[];
  packages?: Record<string, string>;
  capabilities?: Capabilities;
  limits?: RunLimits;
  onOutput?: (text: string) => void;
  signal?: AbortSignal;
  /** Native modules supplied by the embedder: name -> Ply declarations (extern fn ...) + implementations. */
  hostModules?: Record<string, HostModule>;
  args?: string[];
  /** Callback for UI events / tree renders (WO111 item 21b). */
  onUi?: (msg: any) => void;
  /** Standard input for std.io.readLine (absent = end of input). */
  stdin?: StdinReader;
  /** Synchronous line reader behind `input()` (a terminal: blocking read of stdin; the browser playground: a queue
   *  of answers, re-running the program when it needs one more). null = end of input. */
  inputSync?: () => string | null;
  /** Module name of the entry (default "main"). */
  entryName?: string;
  /** Playground live values (Swift playgrounds): record each binding and value line of the entry module; the result's
   *  `live` lists them. Needed at compile time (the code records them) and at run time. */
  liveValues?: boolean;
  /** What to run: main() (default) or the test blocks. */
  mode?: "main" | "test";
  testFilter?: string;
}

export interface TraceFrame { fn: string; file: string; line: number; col: number }
export interface RunError {
  kind: "compile" | "panic" | "uncaught" | "limit" | "abort" | "timeout";
  message: string;
  trace: TraceFrame[];
  human: string;
  limit?: string;
}
export interface TestResult { module: string; name: string; ok: boolean; message?: string; millis: number }
export interface RunResult {
  ok: boolean;
  output: string;
  ui?: any;
  diagnostics: DiagnosticJson[];
  warnings: number;
  error?: RunError;
  value?: unknown;
  steps: number;
  millis: number;
  tests?: TestResult[];
  taskErrors: string[];
  /** with liveValues: per source line of the entry, its last value and how often it ran */
  live?: LiveValue[];
}

export interface Compiled {
  program: Program;
  code?: string;
  spans?: Span[];
  lineSpans?: (number | undefined)[];
  prefixLines?: number;
  entry: string;
  hostNative: Record<string, (...a: any[]) => any>;
}

const HELPERS = ["$Obj", "$Early", "$tick", "$w", "$t", "$range", "$eq", "$s", "$str", "$fs", "$fmt", "$iter", "$isRange", "$isGen", "$kindOf", "$gen", "$meta", "$mix", "$variant", "$impl", "$thr", "$norm", "$nomatch", "$fu", "$q", "$castFail", "$try", "$tryA", "$spawn", "$idiv", "$div", "$imod", "$ipow", "$shl", "$shr", "$neg", "$arith", "$cmp", "$sc", "$ai", "$as", "$mg", "$si", "$slice", "$prop", "$d", "$extReg", "$tests", "$M", "$n", "$drop", "$live"];

export function compile(opts: RunOptions): Compiled {
  const file = opts.file ?? "main.myc";
  const virtual: Record<string, string> = {};
  const hostNative: Record<string, (...a: any[]) => any> = {};
  for (const [name, hm] of Object.entries(opts.hostModules ?? {})) {
    virtual[name] = hm.source;
    for (const [k, f] of Object.entries(hm.natives)) hostNative[`${name}.${k}`] = f;
  }
  const resolve = makeResolver({ roots: opts.roots ?? [], packages: opts.packages, virtual });
  const entry = opts.entryName ?? "main";
  const program = compileProgram({ entry: { name: entry, file, text: opts.source ?? "" }, resolve });
  if (!program.ok) return { program, entry, hostNative };
  const g = generate(program.checker, program.modules, { live: opts.liveValues ? entry : undefined });
  const w = wrapGenerated(g, entry);
  return { ...w, program, hostNative };
}

/** Wrap generated module code in the helper-destructuring factory and index statement lines to source spans. */
export function wrapGenerated(g: { code: string; spans: Span[] }, entry: string): Compiled {
  const prefix = `(function ($rt) {\n"use strict";\nconst { ${HELPERS.join(", ")} } = $rt;\n`;
  const code = prefix + g.code + `\n})`;
  const lines = code.split("\n");
  const lineSpans: (number | undefined)[] = [];
  let cur: number | undefined;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\/\*@(\d+)\*\//.exec(lines[i]);
    if (m) cur = Number(m[1]);
    lineSpans.push(cur);
  }
  return { program: { ok: true, diagnostics: [], modules: [], checker: undefined as any }, code, spans: g.spans, lineSpans, entry, hostNative: {} };
}

function mapStack(stack: string | undefined, c: Compiled): TraceFrame[] {
  if (!stack) return [];
  const frames: TraceFrame[] = [];
  const re = /at (?:(?:async )?([^\s(]+) )?\(?ply:bundle:(\d+):(\d+)\)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stack))) {
    const line = Number(m[2]);
    const id = c.lineSpans?.[line - 1];
    const span = id !== undefined ? c.spans![id] : undefined;
    if (!span) continue;
    const p = span.src.pos(span.start);
    let fn = m[1] ?? "<main>";
    fn = fn.replace(/^(new |Object\.|async )/, "").replace(/^\$M\.|^Module\./, "");
    frames.push({ fn, file: span.src.name, line: p.line, col: p.col });
  }
  return frames;
}

function humanError(kind: string, message: string, trace: TraceFrame[], c: Compiled): string {
  const out = [`${kind}: ${message}`];
  // collapse runs of identical frames (deep recursion) so the interesting part stays visible
  let shown = 0;
  for (let i = 0; i < trace.length && shown < 14;) {
    const f = trace[i];
    let j = i;
    while (j < trace.length && trace[j].fn === f.fn && trace[j].line === f.line && trace[j].col === f.col && trace[j].file === f.file) j++;
    const n = j - i;
    out.push(`  at ${f.fn} (${f.file}:${f.line}:${f.col})${n > 1 ? `  [repeated ${n} times]` : ""}`);
    shown++; i = j;
  }
  const top = trace[0];
  if (top) {
    const span = c.spans!.find((s) => s.src.name === top.file);
    if (span) { const text = span.src.lineText(top.line); out.push(`    ${top.line} | ${text}`); }
  }
  return out.join("\n");
}

/** Compile only (no execution): used by `check`. */
export function check(opts: RunOptions): { ok: boolean; diagnostics: DiagnosticJson[]; text: string; errors: number; warnings: number } {
  const c = compile(opts);
  const ds = c.program.diagnostics.filter((d) => !isStd(d));
  return { ok: !ds.some((d) => d.severity === "error"), diagnostics: ds.map(toJson), text: renderDiagnostics(ds), errors: ds.filter((d) => d.severity === "error").length, warnings: ds.filter((d) => d.severity === "warning").length };
}
const isStd = (d: Diagnostic) => !!d.span && /(^|\/)std\/[^/]+\.(olx|myc)$/.test(d.span.src.name) && d.severity === "warning";

export async function run(opts: RunOptions): Promise<RunResult> {
  return execute(compile(opts), opts);
}

/** A compiled program as plain data (what `ply build` writes). */
export interface Bundle { code: string; entry: string; files: { name: string; text: string }[]; spans: [number, number, number][]; lineSpans: (number | null)[] }
export function toBundle(c: Compiled): Bundle {
  const files: { name: string; text: string }[] = [];
  const idx = new Map<string, number>();
  const spans = c.spans!.map((s) => {
    let i = idx.get(s.src.name);
    if (i === undefined) { i = files.length; idx.set(s.src.name, i); files.push({ name: s.src.name, text: s.src.text }); }
    return [i, s.start, s.end] as [number, number, number];
  });
  return { code: c.code!, entry: c.entry, files, spans, lineSpans: (c.lineSpans ?? []).map((x) => x ?? null) };
}
export function fromBundle(b: Bundle): Compiled {
  const srcs = b.files.map((f) => new Source(f.name, f.text));
  return {
    program: { ok: true, diagnostics: [], modules: [], checker: undefined as any }, code: b.code, entry: b.entry, hostNative: {},
    spans: b.spans.map(([i, start, end]) => ({ src: srcs[i], start, end })), lineSpans: b.lineSpans.map((x) => x ?? undefined),
  };
}

export async function execute(c: Compiled, opts: RunOptions): Promise<RunResult> {
  const t0 = Date.now();
  const outChunks: string[] = [];
  const write = (t: string) => { outChunks.push(t); opts.onOutput?.(t); };
  const diags = c.program.diagnostics.filter((d) => !isStd(d));
  const base: RunResult = { ok: false, output: "", diagnostics: diags.map(toJson), warnings: diags.filter((d) => d.severity === "warning").length, steps: 0, millis: 0, taskErrors: [] };
  if (!c.program.ok) {
    const errs = diags.filter((d) => d.severity === "error");
    return { ...base, millis: Date.now() - t0, error: { kind: "compile", message: `${errs.length} compile error${errs.length === 1 ? "" : "s"}`, trace: [], human: renderDiagnostics(diags) } };
  }
  const ctx = newCtx(opts.limits ?? {}, write, opts.signal);
  if (opts.onUi) (ctx as any).onUi = opts.onUi;
  if (opts.liveValues) (ctx as any).live = new Map();
  const rt: Runtime = createRuntime(ctx, (r) => ({ ...preludeNatives(r), ...stdNatives(r, opts.capabilities ?? {}, opts.args ?? [], opts.stdin, opts.inputSync), ...c.hostNative }));
  let error: RunError | undefined;
  let value: unknown;
  let tests: TestResult[] | undefined;
  const fail = (e: unknown): RunError => runErrorOf(e, c);
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  // an async call whose Task is dropped may reject with nobody listening; record it instead of crashing the host process
  const unhandledPromises = new Map<Promise<any>, unknown>();
  const onUnhandled = (reason: unknown, promise: Promise<any>) => { unhandledPromises.set(promise, reason); };
  const onRejectionHandled = (promise: Promise<any>) => { unhandledPromises.delete(promise); };
  process.on("unhandledRejection", onUnhandled);
  process.on("rejectionHandled", onRejectionHandled);
  const prevLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = Math.max(prevLimit, 200); // Ply traces should reach the root of a deep call chain
  try {
    const script = new vm.Script(c.code!, { filename: "ply:bundle" });
    const factory = script.runInThisContext() as (rt: unknown) => void;
    const racers: Promise<never>[] = [];
    if (Number.isFinite(ctx.limits.maxMillis) && ctx.limits.maxMillis < 2 ** 31) racers.push(new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Panic(`time limit of ${ctx.limits.maxMillis} ms exceeded`, "limit", "time")), ctx.limits.maxMillis); }));
    if (opts.signal) racers.push(new Promise<never>((_, rej) => { onAbort = () => rej(new Panic("the run was aborted", "abort")); if (opts.signal!.aborted) onAbort(); else opts.signal!.addEventListener("abort", onAbort, { once: true }); }));
    const exec = (async () => {
      factory({ ...rt.helpers });
      const mod = ctx.M[c.entry];
      if (opts.mode === "test") { tests = await runTests(ctx, opts.testFilter, c, fail); return; }
      if (mod && typeof mod.main === "function") value = await mod.main();
      // a server started with web's app.run() keeps the program alive after main returns (Flask-style)
      const keep = (ctx as any).keepAlive as Promise<unknown>[] | undefined;
      if (keep?.length) await Promise.all(keep);
    })();
    exec.catch(() => {}); // a racer may settle first; the loser must not become an unhandled rejection
    await Promise.race([exec, ...racers]);
  } catch (e) {
    error = fail(e);
  } finally {
    // let any rejection raised by the last microtasks reach the handler before it is removed
    await new Promise((r) => setImmediate(r));
    process.off("unhandledRejection", onUnhandled);
    process.off("rejectionHandled", onRejectionHandled);
    for (const reason of unhandledPromises.values()) {
      ctx.taskErrors.push(reason);
    }
    for (const rec of (ctx as any).pendingTaskErrors ?? []) {
      if (!rec.handled) ctx.taskErrors.push(rec.error);
    }
    Error.stackTraceLimit = prevLimit;
    if (timer) clearTimeout(timer);
    for (const c of (ctx as any).cleanups ?? []) { try { c(); } catch { /* best effort */ } }
    if (onAbort) opts.signal?.removeEventListener("abort", onAbort);
  }
  const taskErrors = ctx.taskErrors.map((e) => fail(e).human);
  const activeUi = (ctx as any).uiManager?.getActiveTree?.();
  return {
    ...base, ok: !error && !(tests?.some((t) => !t.ok)), output: outChunks.join(""), error, value, tests, steps: ctx.steps, millis: Date.now() - t0, taskErrors, ui: activeUi, live: liveValues(ctx),
  };
}

export function runErrorOf(e: unknown, c: Compiled): RunError {
  if (e instanceof RangeError && /call stack/i.test(e.message)) e = Object.assign(new Panic("stack overflow: recursion is too deep"), { plyStack: e.stack });
  if (e instanceof Panic) {
    const trace = mapStack(e.plyStack ?? e.stack, c);
    const kind = e.kind === "panic" ? "panic" : e.kind;
    return { kind, message: e.message, trace, human: humanError(kind === "panic" ? "panic" : kind, e.message, trace, c), limit: e.limit };
  }
  const obj = e as any;
  if (obj && typeof obj === "object" && obj.constructor?.$name) {
    const msg = `${obj.constructor.$name}${obj.message !== undefined ? ": " + obj.message : ""}`;
    const trace = mapStack(obj.$stack, c);
    return { kind: "uncaught", message: msg, trace, human: humanError("uncaught error", msg, trace, c) };
  }
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return { kind: "panic", message: `internal error: ${msg}`, trace: mapStack((e as Error)?.stack, c), human: `internal error: ${msg}` };
}

async function runTests(ctx: ReturnType<typeof newCtx>, filter: string | undefined, c: Compiled, fail: (e: unknown) => RunError): Promise<TestResult[]> {
  const out: TestResult[] = [];
  for (const t of ctx.tests) {
    if (filter && !t.name.includes(filter) && !t.module.includes(filter)) continue;
    const s = Date.now();
    try { await t.fn(); out.push({ module: t.module, name: t.name, ok: true, millis: Date.now() - s }); }
    catch (e) {
      const er = fail(e);
      out.push({ module: t.module, name: t.name, ok: false, message: er.human, millis: Date.now() - s });
      if (e instanceof Panic && e.kind !== "panic") break;
    }
  }
  return out;
}

export { Source, formatDiagnostic, ModuleInfo };

/** Entry point of a bundle written by `ply build`. */
export async function runBundle(b: Bundle, args: string[]): Promise<void> {
  const r = await execute(fromBundle(b), { args, onOutput: (t) => process.stdout.write(t), limits: { maxSteps: Infinity, maxMillis: Infinity, maxOutputBytes: Infinity } });
  if (r.error) console.error(r.error.human);
  process.exit(r.ok ? 0 : 1);
}

// ---------- isolated execution ----------
export interface IsolatedOptions extends Omit<RunOptions, "onOutput" | "signal" | "hostModules" | "stdin"> {
  /** Heap cap for the run, in MB (enforced by the engine: exceeding it ends the worker, not the host). */
  maxMemoryMb?: number;
  onOutput?: (text: string) => void;
  signal?: AbortSignal;
}

/**
 * Run in a worker thread so that the limits the interpreter cannot enforce itself still hold: a hard heap cap, a
 * wall-clock kill that also stops native code (a catastrophic regex, a blocking process.run), and abort.
 * Host modules and stdin are not available here (they hold functions, which cannot cross threads).
 */
export function runIsolated(opts: IsolatedOptions): Promise<RunResult> {
  const { Worker } = require("worker_threads") as typeof import("worker_threads");
  const { onOutput, signal, maxMemoryMb, ...data } = opts;
  const wall = opts.limits?.maxMillis ?? DEFAULT_WALL;
  return new Promise<RunResult>((resolve) => {
    const t0 = Date.now();
    let output = "";
    let settled = false;
    const worker = new Worker(require("path").join(__dirname, "worker.js"), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: maxMemoryMb ?? 512, maxYoungGenerationSizeMb: 32 },
    });
    const finish = (r: RunResult) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); void worker.terminate(); resolve({ ...r, output: r.output || output }); };
    const failed = (kind: RunError["kind"], message: string, limit?: string): RunResult => ({
      ok: false, output, diagnostics: [], warnings: 0, steps: 0, millis: Date.now() - t0, taskErrors: [],
      error: { kind, message, trace: [], human: `${kind}: ${message}`, limit },
    });
    const timer = setTimeout(() => finish(failed("limit", `time limit of ${wall} ms exceeded`, "time")), Number.isFinite(wall) ? wall + 250 : 2 ** 31 - 1);
    const onAbort = () => finish(failed("abort", "the run was aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    worker.on("message", (m: { out?: string; result?: RunResult }) => {
      if (m.out !== undefined) { output += m.out; onOutput?.(m.out); }
      if (m.result) finish(m.result);
    });
    worker.on("error", (e: any) => {
      if (e?.code === "ERR_WORKER_OUT_OF_MEMORY") finish(failed("limit", `memory limit of ${maxMemoryMb ?? 512} MB exceeded`, "memory"));
      else finish(failed("panic", `internal error in the worker: ${e?.message ?? e}`));
    });
    worker.on("exit", (code) => { if (!settled) finish(failed("panic", `the worker ended unexpectedly (exit code ${code})`)); });
  });
}
const DEFAULT_WALL = 30_000;
