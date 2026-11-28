import { CompileError, Source } from "./diag";

export type StrPart = { text: string } | { code: { start: number; end: number }; spec?: string; debug?: string };
export interface Token {
  k: "id" | "kw" | "int" | "float" | "str" | "char" | "op" | "nl" | "eof";
  v: string;
  start: number;
  end: number;
  /** whitespace (or line start) directly before this token; the parser uses it for `x?` vs `x ? a : b`. */
  sp: boolean;
  big?: bigint;
  num?: number;
  parts?: StrPart[];
  fmt?: boolean;
}

export const KEYWORDS = new Set([
  "let", "var", "fn", "class", "struct", "interface", "enum", "type", "extend", "import", "pub", "private", "protected",
  "static", "if", "else", "while", "for", "in", "match", "return", "break", "continue", "throw", "try", "catch", "finally",
  "true", "false", "nil", "is", "as", "async", "await", "spawn", "gen", "yield", "init", "self", "super",
  "override", "operator", "extern", "then",
]);

// Longest first so `..=` wins over `..`.
const OPS = [
  "..=", "...", "<<=", ">>=", "**=", "??=", "//=",
  "==", "//", "!=", "<=", ">=", "&&", "||", "??", "?.", "..", "->", "=>", "+=", "-=", "*=", "/=", "%=", "**", "<<", ">>", "|>",
  "+", "-", "*", "/", "%", "<", ">", "=", "!", "?", ":", ".", ",", ";", "(", ")", "[", "]", "{", "}", "@", "&", "|", "^", "~", "#",
];

const ESC: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", '"': '"', "'": "'", $: "$", b: "\b" };

const OPERAND_END_OPS = new Set([")", "]", "}"]);
const OPERAND_KW = new Set(["true", "false", "nil", "self"]);
const operandEnd = (k: Token) => k.k === "id" || k.k === "int" || k.k === "float" || k.k === "str" || k.k === "char" || (k.k === "op" && OPERAND_END_OPS.has(k.v)) || (k.k === "kw" && OPERAND_KW.has(k.v));
const operandStart = (k: Token) => k.k === "id" || k.k === "int" || k.k === "float" || k.k === "str" || k.k === "char" || (k.k === "kw" && OPERAND_KW.has(k.v));

  /** Is the `//` at `j` an old-style comment (not floor division)? Division needs an operand before it on the same line and an expression after it. */
export function slashSlashIsComment(src: Source, to: number, j: number, toks: Token[], depthLen: number): boolean {
  const t = src.text;
    const ls = t.lastIndexOf("\n", j - 1) + 1;
    if (t.slice(ls, j).trim() === "") return true;
    const prev = toks[toks.length - 1];
    if (!prev || prev.k === "nl" || prev.start < ls || !operandEnd(prev)) return true;
    const nl = t.indexOf("\n", j), le = nl < 0 || nl > to ? to : nl;
    const len = t.startsWith("//=", j) ? 3 : 2; // `x //= 5` compounds; `//====` is a rule line
    if (t.slice(j + len, le).trim() === "") return true;
    let rest: Token[];
    try { rest = lex(src, j + len, le).filter((x) => x.k !== "nl" && x.k !== "eof"); } catch { return true; }
    if (!rest.length) return true;
    const first = rest[0];
    if (!(operandStart(first) || (first.k === "op" && ["(", "[", "-", "+", "!", "~"].includes(first.v)))) return true;
    let d = 0;
    for (let n = 0; n < rest.length; n++) {
      const x = rest[n], y = rest[n + 1];
      if (x.k === "op" && "([{".includes(x.v)) d++;
      else if (x.k === "op" && ")]}".includes(x.v)) { d--; if (d < 0) return false; } // closes the surrounding call or index
      else if (d === 0 && x.k === "op" && x.v === ";") return false; // `x = 10 // 3; print(x)`
      else if (d === 0 && x.k === "op" && (x.v === "," || x.v === ":")) return depthLen === 0; // prose has commas; inside a call they separate arguments
      if (y && operandEnd(x) && operandStart(y)) return true; // two operands side by side: that is prose
      if (y && x.k === "kw" && !OPERAND_KW.has(x.v) && !["is", "as", "in", "if", "else"].includes(x.v)) return true;
    }
    return d !== 0;
  }

/** For `mycel fmt --fix`: is the `//` at `j` in `src` an old comment (true) or floor division (false)? */
export function isOldSlashComment(src: Source, j: number): boolean {
  const t = src.text, ls = t.lastIndexOf("\n", j - 1) + 1;
  let toks: Token[];
  try { toks = lex(src, ls, j).filter((x) => x.k !== "nl" && x.k !== "eof"); } catch { return true; }
  let depth = 0;
  for (const k of toks) if (k.k === "op") { if ("([{".includes(k.v)) depth++; else if (")]}".includes(k.v)) depth--; }
  return slashSlashIsComment(src, src.text.length, j, toks, Math.max(0, depth));
}

export function lex(src: Source, from = 0, to = src.text.length): Token[] {
  const t = src.text;
  const toks: Token[] = [];
  const err = (start: number, end: number, message: string, why?: string, suggestion?: string): never => {
    throw new CompileError([{ severity: "error", code: "E0001", message, span: { src, start, end }, why, suggestion }]);
  };
  let i = from;
  let sp = true;
  const depth: string[] = []; // bracket stack: newlines are insignificant inside ( and [
  const push = (tok: Omit<Token, "sp">) => { toks.push({ ...tok, sp }); sp = false; };

  // Scan an f-string `{ ... }` body starting after `{`; returns the index of the matching `}`.
  const scanInterp = (s: number): number => {
    let d = 0, j = s;
    while (j < to) {
      const c = t[j];
      if (c === "f" && t[j + 1] === '"' && !/[\p{L}\p{N}_]/u.test(t[j - 1] ?? " ")) { j = skipString(j + 1, true); continue; }
      if (c === '"') { j = skipString(j, false); continue; }
      if (c === "'") { j = skipChar(j); continue; }
      if (c === "{") d++;
      else if (c === "}") { if (d === 0) return j; d--; }
      j++;
    }
    return err(s - 1, s, "unterminated string interpolation", "a `{` in an f-string was opened but no matching `}` was found", "close it with `}`, or write `{{` for a literal brace");
  };
  const skipString = (s: number, fmt: boolean): number => {
    const triple = t.startsWith('"""', s);
    let j = s + (triple ? 3 : 1);
    while (j < to) {
      if (t[j] === "\\") { j += 2; continue; }
      if (triple ? t.startsWith('"""', j) : t[j] === '"') return j + (triple ? 3 : 1);
      if (fmt && t[j] === "{") { if (t[j + 1] === "{") { j += 2; continue; } j = scanInterp(j + 1) + 1; continue; }
      if (!triple && t[j] === "\n") break;
      j++;
    }
    return err(s, Math.min(j, to), "unterminated string literal", "the closing quote is missing before the end of the line", triple ? 'end the string with """' : 'add a closing `"` (use `"""` for multi-line text)');
  };
  const skipChar = (s: number): number => {
    let j = s + 1;
    if (t[j] === "\\") {
      if (t[j + 1] === "u" && t[j + 2] === "{") {
        const e = t.indexOf("}", j);
        j = e < 0 ? j + 2 : e + 1;
      } else {
        j += 2;
      }
    } else if (j < to) {
      const cp = t.codePointAt(j);
      j += cp && cp > 0xffff ? 2 : 1;
    }
    if (t[j] === "'") j++;
    return j;
  };

  const lexString = (s: number, q: number, fmt: boolean) => {
      i = q;
      const triple = t.startsWith('"""', i);
      i += triple ? 3 : 1;
      const parts: StrPart[] = [];
      let cur = "";
      const flush = () => { if (cur) { parts.push({ text: cur }); cur = ""; } };
      if (triple && t[i] === "\r") i++;
      if (triple && t[i] === "\n") i++;
      for (;;) {
        if (i >= to) err(s, Math.min(s + 3, to), "unterminated string literal", "the closing quote is missing", triple ? 'end the string with """' : 'add a closing `"`');
        if (triple ? t.startsWith('"""', i) : t[i] === '"') { i += triple ? 3 : 1; break; }
        if (!triple && t[i] === "\n") err(s, i, "unterminated string literal", "a single-quoted string cannot span lines", 'close it with `"`, or use """ for multi-line text');
        if (t[i] === "\\") {
          const n = t[i + 1];
          if (n === "u" && t[i + 2] === "{") {
            const e = t.indexOf("}", i);
            const cp = parseInt(t.slice(i + 3, e), 16);
            if (e < 0 || !(cp >= 0 && cp <= 0x10ffff)) err(i, i + 2, "invalid unicode escape", "expected \\u{hex} with a valid code point", "write e.g. \\u{1F600}");
            cur += String.fromCodePoint(cp); i = e + 1; continue;
          }
          if (n in ESC) { cur += ESC[n]; i += 2; continue; }
          if (n === "(") err(i, i + 2, "`\\(x)` is Swift — Mycel writes f\"...{x}...\" (an f before the quote)", "string interpolation uses an f-string", 'write f"v {x}"');
          err(i, i + 2, `unknown escape sequence \`\\${n ?? ""}\``, "supported escapes: \\n \\t \\r \\0 \\\\ \\\" \\' \\$ \\u{...}", `write \\\\ for a literal backslash`);
        }
        if (fmt && t[i] === "{" && t[i + 1] === "{") { cur += "{"; i += 2; continue; }
        if (fmt && t[i] === "}" && t[i + 1] === "}") { cur += "}"; i += 2; continue; }
        if (fmt && t[i] === "}") err(i, i + 1, "a lone `}` in an f-string", "a closing brace needs an opening one", "write `}}` for a literal brace");
        if (fmt && t[i] === "{") {
          flush();
          const e = scanInterp(i + 1);
          parts.push(splitInterp(i + 1, e));
          i = e + 1; continue;
        }
        if (!fmt && t[i] === "$" && t[i + 1] === "{") {
          let e = i + 2; try { e = scanInterp(i + 2); } catch { /* keep going: the fix-it below is enough */ }
          const inner = t.slice(i + 2, e);
          err(i, Math.min(e + 1, to), "`${...}` is the old interpolation syntax", "Mycel strings interpolate with an f in front, like Python", `write f"...{${inner}}..." (or run \`mycel fmt --fix\` to rewrite old code)`);
        }
        cur += t[i++];
      }
      flush();
      if (triple) dedentTriple(parts);
      push({ k: "str", v: "", start: s, end: i, parts, fmt });
  };

  // Split `expr`, `expr:spec` or `expr=` at the top level (a `:` after an open `?` is a ternary's).
  function splitInterp(a: number, e: number): StrPart {
    let d = 0, q = 0, j = a;
    while (j < e) {
      const c = t[j];
      if (c === '"') { j = skipString(j, false); continue; }
      if (c === "'") { j = skipChar(j); continue; }
      if (c === "(" || c === "[" || c === "{") d++;
      else if (c === ")" || c === "]" || c === "}") d--;
      else if (d === 0 && c === "?" && t[j + 1] !== "." && t[j + 1] !== "?" && t[j - 1] !== "?") q++;
      else if (d === 0 && c === ":" ) { if (q > 0) q--; else return { code: { start: a, end: j }, spec: t.slice(j + 1, e) }; }
      j++;
    }
    const raw = t.slice(a, e);
    const m = /^(.*[^=!<>])=\s*$/s.exec(raw);
    if (m) return { code: { start: a, end: a + m[1].length }, debug: m[1].trim() + "=" + raw.slice(m[1].length + 1) };
    return { code: { start: a, end: e } };
  }

  /** `#[` that is code, not a comment: a set-literal habit (`x = #[1, 2]`). Everything else after `#` is a comment. */
  const setHabitAt = (j: number): boolean => {
    if (t[j + 1] !== "[") return false;
    const prev = toks[toks.length - 1];
    if (!prev || prev.k === "nl" || prev.start < t.lastIndexOf("\n", j - 1) + 1) return false;
    if (!(prev.k === "op" && ["=", "(", ",", "[", "{", ":", "=>", "??", "|>"].includes(prev.v)) && !(prev.k === "kw" && prev.v === "return")) return false;
    const nl = t.indexOf("\n", j), le = nl < 0 || nl > to ? to : nl;
    return /\]\s*[)\],]*\s*$/.test(t.slice(j, le));
  };
  while (i < to) {
    const c = t[i];
    if (c === " " || c === "\t" || c === "\r") { i++; sp = true; continue; }
    if (c === "\n") {
      sp = true;
      const inParen = depth.length > 0 && depth[depth.length - 1] !== "{";
      // Drop the newline when the next line continues the expression (.method / && / || / ?? / |>).
      // `.Variant` (capitalised) starts a new match arm, so only lower-case `.name` continues a chain.
      let j = i + 1;
      for (;;) {
        while (j < to && /[ \t\r\n]/.test(t[j])) j++;
        if (t[j] === "#" && !setHabitAt(j)) { while (j < to && t[j] !== "\n") j++; continue; }
        break;
      }
      const rest = t.slice(j, j + 3);
      const cont = (rest[0] === "." && /[a-z_]/.test(rest[1] ?? "")) || rest.startsWith("?.") || rest.startsWith("&&") || rest.startsWith("||") || rest.startsWith("??") || rest.startsWith("|>");
      if (!inParen && !cont && toks.length && toks[toks.length - 1].k !== "nl") push({ k: "nl", v: "\n", start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "#" && !setHabitAt(i)) { while (i < to && t[i] !== "\n") i++; continue; }
    if (c === "/" && t[i + 1] === "*") {
      const ls = t.lastIndexOf("\n", i - 1) + 1, nl = t.indexOf("\n", i), le = nl < 0 || nl > to ? to : nl;
      const e = t.indexOf("*/", i + 2);
      const one = e >= 0 && e < le;
      const body = one ? t.slice(i + 2, e).trim() : t.slice(i + 2, le).trim();
      const fixed = one ? t.slice(ls, i) + "# " + body + t.slice(e + 2, le) : t.slice(ls, i) + "# " + body;
      err(i, one ? e + 2 : le, "comments start with # in Mycel — there are no /* */ block comments", "Mycel has one kind of comment: `#` to the end of the line. For several lines, put `#` at the start of each line", `write \`${fixed.trimEnd()}\` (or run \`mycel fmt --fix\` to rewrite old files)`);
    }
    if (c === "/" && t[i + 1] === "/" && slashSlashIsComment(src, to, i, toks, depth.length)) {
      const ls = t.lastIndexOf("\n", i - 1) + 1, nl = t.indexOf("\n", i), le = nl < 0 || nl > to ? to : nl;
      const fixed = t.slice(ls, i) + "#" + t.slice(i + 2, le);
      err(i, le, "comments start with # in Mycel", "`//` is whole-number division in Mycel (`7 // 2` is 3), so it cannot start a comment", `write \`${fixed.trimEnd()}\` (or run \`mycel fmt --fix\` to rewrite old files)`);
    }
    if (/[A-Za-z_]/.test(c) || c > "\x7f" && /\p{L}/u.test(c)) {
      const s = i;
      while (i < to && /[\p{L}\p{N}_]/u.test(t[i])) i++;
      const w = t.slice(s, i);
      if (w === "f" && t[i] === '"') { lexString(s, i, true); continue; }
      // Python's words are accepted next to the symbols: `a and b`, `a or b`, `not a`
      if (w === "and" || w === "or" || w === "not") { push({ k: "op", v: w === "and" ? "&&" : w === "or" ? "||" : "!", start: s, end: i }); continue; }
      push({ k: KEYWORDS.has(w) ? "kw" : "id", v: w, start: s, end: i });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const s = i;
      let isFloat = false;
      if (c === "0" && /[xXbBoO]/.test(t[i + 1] ?? "")) {
        i += 2;
        while (i < to && /[0-9a-fA-F_]/.test(t[i])) i++;
        const raw = t.slice(s, i).replace(/_/g, "");
        let big: bigint;
        try { big = BigInt(raw.toLowerCase()); } catch { return err(s, i, `invalid number literal \`${t.slice(s, i)}\``, "digits do not match the radix prefix", "use 0x for hex, 0b for binary, 0o for octal"); }
        push({ k: "int", v: t.slice(s, i), start: s, end: i, big });
        continue;
      }
      while (i < to && /[0-9_]/.test(t[i])) i++;
      if (t[i] === "." && /[0-9]/.test(t[i + 1] ?? "")) { isFloat = true; i++; while (i < to && /[0-9_]/.test(t[i])) i++; }
      if (/[eE]/.test(t[i] ?? "") && /[0-9+-]/.test(t[i + 1] ?? "")) {
        isFloat = true; i += 2;
        while (i < to && /[0-9]/.test(t[i])) i++;
      }
      const raw = t.slice(s, i).replace(/_/g, "");
      if (isFloat) push({ k: "float", v: raw, start: s, end: i, num: Number(raw) });
      else push({ k: "int", v: raw, start: s, end: i, big: BigInt(raw) });
      continue;
    }
    if (c === '"') { lexString(i, i, false); continue; }
    if (c === "'") {
      const s = i; i++;
      let ch: string;
      if (t[i] === "\\") {
        const n = t[i + 1];
        if (n === "u" && t[i + 2] === "{") {
          const e = t.indexOf("}", i);
          const cp = parseInt(t.slice(i + 3, e < 0 ? i + 3 : e), 16);
          if (e < 0 || !(cp >= 0 && cp <= 0x10ffff)) err(i, i + 2, "invalid unicode escape in char literal", "expected \\u{hex} with a valid code point", "write e.g. \\u{1F600}");
          ch = String.fromCodePoint(cp); i = e + 1;
        }
        else if (n in ESC) { ch = ESC[n]; i += 2; }
        else return err(s, i + 2, `unknown escape in char literal`, "supported escapes: \\n \\t \\r \\0 \\\\ \\' \\u{...}");
      } else { const cp = t.codePointAt(i)!; ch = String.fromCodePoint(cp); i += ch.length; }
      if (t[i] !== "'") err(s, i, "single quotes hold one character in Mycel — text uses double quotes (the JavaScript/Python 'text' habit)", "a Char literal holds exactly one character", `use "${t.slice(s + 1, Math.max(s + 1, t.indexOf("'", s + 1)))}" for a String`);
      i++;
      push({ k: "char", v: ch, start: s, end: i });
      continue;
    }
    if (c === "`") err(i, i + 1, "backtick strings are JavaScript — Mycel writes f\"...{x}...\" (an f before the quote)", "Mycel strings use double quotes", 'write f"a {x}"');
    let matched: string | undefined;
    for (const op of OPS) if (t.startsWith(op, i)) { matched = op; break; }
    if (!matched) {
      err(i, i + 1, `unexpected character \`${c}\``, "this character is not part of Mycel syntax", /[“”‘’]/.test(c) ? "replace the typographic quote with a plain \" or '" : "remove it");
    }
    const op = matched!;
    if (op === "(" || op === "[" || op === "{") depth.push(op);
    else if (op === ")" || op === "]" || op === "}") depth.pop();
    push({ k: "op", v: op, start: i, end: i + op.length });
    i += op.length;
  }
  if (toks.length && toks[toks.length - 1].k !== "nl") toks.push({ k: "nl", v: "\n", start: to, end: to, sp: true });
  toks.push({ k: "eof", v: "", start: to, end: to, sp: true });
  return toks;
}

/** Remove the common indentation of a """ block (measured by the closing line). */
function dedentTriple(parts: StrPart[]) {
  const text = parts.map((p) => ("text" in p ? p.text : "\u0000")).join("");
  const lines = text.split("\n");
  const last = lines[lines.length - 1];
  const indent = /^[ \t]*$/.test(last) ? last.length : Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length), Infinity);
  if (!isFinite(indent) || indent === 0) {
    if (/^[ \t]*$/.test(last) && lines.length > 1) trimLast(parts);
    return;
  }
  // Apply per text part: strip `indent` chars after every newline (and at the very start).
  let atLineStart = true;
  for (const p of parts) {
    if (!("text" in p)) { atLineStart = false; continue; }
    let out = "";
    for (const ch of p.text) {
      if (atLineStart) { /* handled below */ }
      out += ch;
    }
    p.text = out.split("\n").map((l, idx) => ((idx > 0 || atLineStart) ? l.replace(new RegExp(`^[ \\t]{0,${indent}}`), "") : l)).join("\n");
    atLineStart = p.text.endsWith("\n");
  }
  if (/^[ \t]*$/.test(last)) trimLast(parts);
}
function trimLast(parts: StrPart[]) {
  // drop the final "\n<indent>" that precedes the closing quotes
  const p = parts[parts.length - 1];
  if (p && "text" in p) { p.text = p.text.replace(/\n[ \t]*$/, ""); if (!p.text) parts.pop(); }
}
