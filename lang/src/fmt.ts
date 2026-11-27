import { Source } from "./diag";
import { lex, Token } from "./lexer";
import { parse } from "./parser";

const OPEN = new Set(["{", "(", "["]);
const CLOSE = new Set(["}", ")", "]"]);
const SPACED = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "??=", "==", "!=", "<=", ">=", "&&", "||", "??", "=>", "->", "|>"]);
const CONTINUE_START = new Set([".", "?.", "&&", "||", "??", "|>"]);

/**
 * Canonical layout: 2-space indentation by bracket depth, one space between tokens, no space before , ) ] ;
 * or after ( [, single blank lines, no trailing whitespace. Comments and string contents are untouched, and the
 * result is verified to lex to exactly the same tokens (otherwise nothing is changed).
 */
export function format(text: string, name = "<input>"): string {
  const src = new Source(name, text);
  const ast = parse(src); // refuse to format code that does not parse (the error explains why)
  const toks = lex(src).filter((t) => t.k !== "nl" && t.k !== "eof");
  // `P{x, y}` is a struct pattern only while the `{` touches the name (the parser reads `P {` as something else), so
  // those braces keep no space; every other `Name{` / `){` gets one.
  const tight = new Set<number>();
  const seen = new Set<unknown>();
  const walk = (n: any) => {
    if (!n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.k === "object" && n.type && n.span) { const b = toks.find((t) => t.k === "op" && t.v === "{" && t.start >= n.span.start); if (b) tight.add(b.start); }
    for (const key of Object.keys(n)) if (key !== "span" && key !== "src") walk(n[key]);
  };
  walk(ast.decls);
  const lines = src.text.split("\n");
  const verbatim = new Set<number>();
  const byLine = new Map<number, Token[]>();
  for (const t of toks) {
    const a = src.pos(t.start).line, b = src.pos(Math.max(t.start, t.end - 1)).line;
    (byLine.get(a) ?? byLine.set(a, []).get(a)!).push(t);
    for (let l = a + 1; l <= b; l++) verbatim.add(l); // continuation lines of multi-line strings
  }
  // block comments spanning lines
  const gaps: [number, number][] = [];
  let prev = 0;
  for (const t of toks) { gaps.push([prev, t.start]); prev = t.end; }
  gaps.push([prev, src.text.length]);
  for (const [a, b] of gaps) {
    const g = src.text.slice(a, b);
    const re = /\/\*[\s\S]*?\*\//g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(g))) {
      const l1 = src.pos(a + m.index).line, l2 = src.pos(a + m.index + m[0].length - 1).line;
      for (let l = l1 + 1; l <= l2; l++) verbatim.add(l);
    }
  }
  let depth = 0;
  const out: string[] = [];
  let blank = 0;
  for (let ln = 1; ln <= lines.length; ln++) {
    const original = lines[ln - 1];
    const raw = original.replace(/\r$/, "");
    const pushLine = (line: string) => out.push(line + (original.endsWith("\r") ? "\r" : ""));
    if (verbatim.has(ln)) { pushLine(raw); blank = 0; continue; }
    const ts = byLine.get(ln) ?? [];
    if (!raw.trim()) { blank++; if (blank === 1 && out.length) pushLine(""); continue; }
    blank = 0;
    let lead = 0;
    for (const t of ts) { if (t.k === "op" && CLOSE.has(t.v)) lead++; else break; }
    const first = ts[0];
    const cont = first && first.k === "op" && CONTINUE_START.has(first.v) ? 1 : 0;
    const indent = "  ".repeat(Math.max(0, depth - lead) + cont);
    let line = "";
    const multi = ts.some((t) => src.pos(Math.max(t.start, t.end - 1)).line !== ln);
    if (!ts.length) line = raw.trim();
    else if (multi) line = raw.trimStart();
    else {
      const startOff = src.pos(ts[0].start).col - 1;
      line = raw.slice(startOff, startOff + (ts[0].end - ts[0].start));
      for (let i = 1; i < ts.length; i++) {
        const a = ts[i - 1], b = ts[i];
        const gapText = src.text.slice(a.end, b.start);
        let gap: string;
        if (/\S/.test(gapText)) gap = gapText; // inline block comment: keep verbatim
        else if (gapText === "") gap = "";
        else gap = " ";
        if (b.k === "op" && (b.v === "," || b.v === ")" || b.v === "]" || b.v === ";") ) gap = "";
        if (a.k === "op" && (a.v === "(" || a.v === "[")) gap = "";
        if (a.k === "op" && a.v === "," && gap === "") gap = " ";
        // `){` and `Int{` read better as `) {`; assignment/comparison/arrow operators get one space on each side
        if (b.k === "op" && b.v === "{" && gap === "" && !tight.has(b.start) && !(a.k === "op" && ["(", "[", ".", "{", "?.", "#"].includes(a.v))) gap = " ";
        if ((a.k === "op" && SPACED.has(a.v)) || (b.k === "op" && SPACED.has(b.v))) gap = " ";
        line += gap + src.text.slice(b.start, b.end);
      }
      const last = ts[ts.length - 1];
      const lastLine = src.pos(Math.max(last.start, last.end - 1)).line;
      if (lastLine === ln) {
        const endCol = src.pos(last.end - 1).col;
        const rest = raw.slice(endCol).trim();
        if (rest) line += " " + rest; // trailing comment
      }
    }
    pushLine(indent + line.replace(/\s+$/, ""));
    for (const t of ts) { if (t.k === "op" && OPEN.has(t.v)) depth++; else if (t.k === "op" && CLOSE.has(t.v)) depth = Math.max(0, depth - 1); }
  }
  // drop blank lines directly after `{` and before `}`
  const cleaned: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i].replace(/\r$/, "") === "" && (cleaned.length === 0 || /[{(\[]\r?$/.test(cleaned[cleaned.length - 1] ?? "") || /^\s*[}\])]/.test(out[i + 1] ?? "}"))) continue;
    cleaned.push(out[i]);
  }
  while (cleaned.length && cleaned[cleaned.length - 1].replace(/\r$/, "") === "") cleaned.pop();
  const result = cleaned.join("\n") + (cleaned.at(-1)?.endsWith("\r") ? "\n" : (text.match(/\r?\n/)?.[0] ?? "\n"));
  // safety: formatting must not change the program
  const sig = (s: string) => lex(new Source(name, s)).filter((t) => t.k !== "nl").map((t) => `${t.k}:${t.v}:${t.parts ? JSON.stringify(t.parts.map((p) => ("text" in p ? p.text : "$"))) : ""}`).join("\u0001");
  if (sig(result) !== sig(src.text)) throw new Error(`internal formatter error in ${name}: the formatted text would change the program; the file was left as is`);
  // same tokens can still parse differently where spacing matters (`P{x}` vs `P {x}`): the result must parse too
  try { parse(new Source(name, result)); } catch { throw new Error(`internal formatter error in ${name}: the formatted text would not parse; the file was left as is`); }
  return result;
}
