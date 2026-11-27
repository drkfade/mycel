// Diagnostics: every error says what / where / why / how to fix, in a human form
// and a machine-readable JSON form (a small model acts on the JSON).
export class Source {
  private lineStarts: number[] = [0];
  constructor(public readonly name: string, public readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
  }
  /** 1-based line/col of an offset (col counts UTF-16 units). */
  pos(off: number): { line: number; col: number } {
    let lo = 0, hi = this.lineStarts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.lineStarts[m] <= off) lo = m; else hi = m - 1; }
    return { line: lo + 1, col: off - this.lineStarts[lo] + 1 };
  }
  lineText(line: number): string {
    const s = this.lineStarts[line - 1] ?? 0;
    const e = this.lineStarts[line] !== undefined ? this.lineStarts[line] - 1 : this.text.length;
    return this.text.slice(s, e).replace(/\r$/, "");
  }
}

export interface Span { src: Source; start: number; end: number }

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  span?: Span;
  why?: string;
  suggestion?: string;
  notes?: string[];
}

export interface DiagnosticJson {
  severity: "error" | "warning"; code: string; message: string;
  file?: string; line?: number; col?: number; endLine?: number; endCol?: number;
  why?: string; suggestion?: string; notes?: string[];
}

export function toJson(d: Diagnostic): DiagnosticJson {
  const o: DiagnosticJson = { severity: d.severity, code: d.code, message: d.message };
  if (d.span) {
    const a = d.span.src.pos(d.span.start), b = d.span.src.pos(Math.max(d.span.start, d.span.end));
    Object.assign(o, { file: d.span.src.name, line: a.line, col: a.col, endLine: b.line, endCol: b.col });
  }
  if (d.why) o.why = d.why;
  if (d.suggestion) o.suggestion = d.suggestion;
  if (d.notes?.length) o.notes = d.notes;
  return o;
}

export function formatDiagnostic(d: Diagnostic): string {
  const out: string[] = [];
  out.push(`${d.severity} [${d.code}]: ${d.message}`);
  if (d.span) {
    const { src } = d.span;
    const a = src.pos(d.span.start), b = src.pos(Math.max(d.span.start, d.span.end));
    out.push(`  --> ${src.name}:${a.line}:${a.col}`);
    const gutter = String(a.line).length;
    const text = src.lineText(a.line);
    const endCol = b.line === a.line ? Math.max(b.col, a.col + 1) : text.length + 1;
    out.push(`${" ".repeat(gutter)} |`);
    out.push(`${a.line} | ${text}`);
    out.push(`${" ".repeat(gutter)} | ${" ".repeat(a.col - 1)}${"^".repeat(Math.max(1, endCol - a.col))}`);
  }
  if (d.why) out.push(`  why: ${d.why}`);
  for (const n of d.notes ?? []) out.push(`  note: ${n}`);
  if (d.suggestion) out.push(`  fix: ${d.suggestion}`);
  return out.join("\n");
}

/** Thrown by the lexer/parser/checker when compilation cannot continue. */
export class CompileError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(formatDiagnostic).join("\n\n"));
    this.name = "CompileError";
    this.stack = this.message;
  }
}

/** Optimal-string-alignment distance: a swapped pair of letters ("cuont") counts as one edit. */
export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
  }
  return dp[a.length][b.length];
}

/** Closest candidate within a sensible edit distance, for "did you mean". */
export function closest(name: string, cands: Iterable<string>): string | undefined {
  let best: string | undefined, bd = Infinity;
  const ext = (c: string) => c.length === name.length + 1 && c.startsWith(name);
  // on a tie, prefer the candidate that extends the name (`b` -> `bb` over `a`)
  for (const c of cands) { const d = levenshtein(name, c); if (d < bd || (d === bd && best !== undefined && ext(c) && !ext(best))) { bd = d; best = c; } }
  // bd < name.length: a one-letter name is never "close" to another one-letter name (`j` is not a typo of `i`)
  // ...but a one-letter name IS close to the same letter typed twice or extended (`b` -> `bb`), as Python suggests
  const extends1 = best !== undefined && ext(best);
  return best !== undefined && bd <= Math.max(1, Math.floor(name.length / 3)) && (bd < name.length || extends1) ? best : undefined;
}
