/**
 * Browser entry for the playground (ol1x.xyz/mycel/play). Bundled by web/build.mjs with tiny shims for the Node
 * modules on the compile path (std sources are embedded, so `fs` only serves them). Runs inside a Web Worker: no
 * capabilities are granted, so a program is pure — no files, network, processes or environment (the CLI's default).
 *
 * input(): a worker cannot block for the user's answer, so the page re-runs the program from the start with every
 * answer given so far; Math.random is seeded per session so a re-run makes the same choices (a guessing game keeps
 * its secret number). The page replaces its output panel with the full transcript of each run.
 */
import { compile, execute, RunResult } from "./host";
import { DiagnosticJson } from "./diag";
import { renderDiagnostics } from "./modules";
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
  error?: { kind: string; message: string; human: string; line?: number; col?: number };
  millis: number;
  /** with `live`: the value of each binding/value line (Swift playgrounds), for the editor's right-hand column */
  live?: LiveValue[];
}

export function handleUiEvent(msg: { id: string; event: string; value?: string }): any {
  return dispatchUiEvent(msg.id, msg.event, msg.value);
}

function seeded(seed: number): () => number {
  let a = seed >>> 0; // mulberry32: small, fast, deterministic per seed
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function runSource(source: string, opts: { inputs?: string[]; seed?: number; maxMillis?: number; onOutput?: (t: string) => void; onUi?: (msg: any) => void; live?: boolean } = {}): Promise<BrowserRun> {
  const t0 = Date.now();
  if (opts.seed !== undefined) Math.random = seeded(opts.seed);
  const c = compile({ source, file: "main.myc", entryName: "main", liveValues: opts.live });
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
  return { ok: r.ok || needInput, output: chunks.join(""), needInput, ui: activeUi ?? undefined, diagnostics: r.diagnostics, diagnosticsText, error: err, millis: Date.now() - t0, live: r.live };
}

export const VERSION = "0.1.0";
