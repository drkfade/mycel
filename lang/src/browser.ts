/**
 * Browser entry for the playground (ol1x.xyz/mycel/play). Bundled by web/build.mjs with tiny shims for the Node
 * modules on the compile path (std sources are embedded, so `fs` only serves them). Runs inside a Web Worker: no
 * capabilities are granted, so a program is pure — no files, network, processes or environment (the CLI's default).
 *
 * input(): a worker cannot block for the user's answer, so the page re-runs the program from the start with every
 * answer given so far; Math.random is seeded per session so a re-run makes the same choices (a guessing game keeps
 * its secret number). The page replaces its output panel with the full transcript of each run.
 */
import { execute, RunResult, wrapGenerated } from "./host";
import { compileProgram, makeResolver } from "./modules";
import { generate } from "./codegen";
import { DiagnosticJson } from "./diag";
import { renderDiagnostics } from "./modules";
import { EXPLANATIONS, normalizeCode } from "./explain";
import { Panic, LiveValue } from "./runtime";
import { dispatchUiEvent } from "./stdlib";

export const NEED_INPUT = "\u0000mycel:need-input";

export interface BrowserRun {
  ok: boolean;
  /** Text the program printed (all of it, from the start). */
  output: string;
  /** The program asked for one more line than `inputs` holds: show a prompt row, then run again with it added. */
  needInput: boolean;
  ui?: any;
  diagnostics: DiagnosticJson[];
  /** Compile errors / warnings rendered like the terminal (with the fix-it lines). */
  diagnosticsText: string;
  /** Plain-word explanations from lang/src/explain.ts keyed by diagnostic code. */
  explanations?: Record<string, { code: string; title: string; text: string }>;
  error?: { kind: string; message: string; human: string; line?: number; col?: number };
  millis: number;
  /** with `live`: the value of each binding/value line (Swift playgrounds), for the editor's right-hand column */
  live?: LiveValue[];
}

export function explainDiagnostic(rawCode: string): { code: string; title: string; text: string; bad?: string; good?: string } | undefined {
  const code = normalizeCode(rawCode);
  const entry = EXPLANATIONS[code];
  if (!entry) return undefined;
  return { code, title: entry.title, text: entry.text, bad: entry.bad, good: entry.good };
}

export { EXPLANATIONS };

export function handleUiEvent(msg: { id: string; event: string; value?: string }): any {
  return dispatchUiEvent(msg.id, msg.event, msg.value);
}

function seeded(seed: number): () => number {
  let a = seed >>> 0; // mulberry32: small, fast, deterministic per seed
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function runSource(source: string, opts: { inputs?: string[]; seed?: number; maxMillis?: number; onOutput?: (t: string) => void; onUi?: (msg: any) => void; live?: boolean; files?: Record<string, string> } = {}): Promise<BrowserRun> {
  const t0 = Date.now();
  if (opts.seed !== undefined) Math.random = seeded(opts.seed);
  const files = opts.files ?? {};
  const fallback = makeResolver({ roots: [] });
  const program = compileProgram({ entry: { name: "main", file: "main.myc", text: source }, resolve: (name) => {
    if (/^(?!std(?:\.|$)|prelude$|main$)[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/.test(name) && Object.hasOwn(files, name))
      return { file: name.replace(/\./g, "/") + ".myc", text: files[name], isStd: false };
    return fallback(name);
  } });
  const c = program.ok ? { ...wrapGenerated(generate(program.checker, program.modules, { live: opts.live ? "main" : undefined }), "main"), program } : { program, entry: "main", hostNative: {} };
  const diagnostics = c.program.diagnostics.filter((d) => !(d.span && /^\/std\//.test(d.span.src.name)));
  const diagnosticsText = diagnostics.length ? renderDiagnostics(diagnostics) : "";
  const inputs = [...(opts.inputs ?? [])];
  let needInput = false;
  let activeUi: any = null;
  const onUiHandler = (msg: any) => {
    if (msg.type === "ui:render") activeUi = msg.root;
    opts.onUi?.(msg);
  };
  // The transcript includes each answer after its prompt, as a terminal shows it.
  const chunks: string[] = [];
  const emit = (t: string) => { chunks.push(t); opts.onOutput?.(t); };
  const r: RunResult = await execute(c, {
    source, file: "main.myc", limits: { maxMillis: opts.maxMillis ?? 5000, maxOutputBytes: 200_000 }, liveValues: opts.live,
    onOutput: emit,
    onUi: onUiHandler,
    // a Panic (uncatchable by Mycel code) stops the run where it needs the next answer
    inputSync: () => { if (inputs.length) { const v = inputs.shift()!; emit(v + "\n"); return v; } needInput = true; throw new Panic(NEED_INPUT); },
  });
  if (!activeUi && (r as any).ui) activeUi = (r as any).ui;
  const err = r.error && !needInput ? { kind: r.error.kind, message: r.error.message, human: r.error.human, line: r.error.trace[0]?.line, col: r.error.trace[0]?.col } : undefined;
  const explanations: Record<string, { code: string; title: string; text: string }> = {};
  for (const d of r.diagnostics) {
    if (d.code && !explanations[d.code] && EXPLANATIONS[d.code]) {
      const e = EXPLANATIONS[d.code];
      explanations[d.code] = { code: d.code, title: e.title, text: e.text };
    }
  }
  return { ok: r.ok || needInput, output: chunks.join(""), needInput, ui: activeUi ?? undefined, diagnostics: r.diagnostics, diagnosticsText, explanations: Object.keys(explanations).length ? explanations : undefined, error: err, millis: Date.now() - t0, live: r.live };
}

export const VERSION = "0.2.0";
