/**
 * `text.extract(kind)` (task 56, owner decision 27 Nov): pull typed pieces out of text with no regex.
 * The kinds are a closed set: Int, Float, Number, Word, Operator, Bool. Several kinds keep the order they appear in.
 *
 *   Int       whole numbers: 12, -3          (a number written with a decimal point is not an Int)
 *   Float     numbers with a decimal point: 3.5, -0.25
 *   Number    either of the two, as a Float
 *   Word      letters, digits and `_`, with inner `@ . - '` kept: "a@b.com," -> a@b.com, "it's" -> it's; edge punctuation is dropped
 *   Operator  + - * / // % ** ^ = == != < > <= >= && || ! & | ~ ( )   (brackets travel with operators so a calculator keeps them)
 *   Bool      the whole words true, false, yes, no (any case)
 *
 * A `-` is a sign when the nearest non-space character before it is not part of a value (start, `(`, an operator, `,`);
 * so "12 - 3" and "5 -3" are subtraction while "(-3)", "2 * -3" and "1, -2" hold negative numbers. A number glued to
 * letters before it ("abc123", "v2") is not a number.
 */
export const EXTRACT_KINDS = ["Int", "Float", "Number", "Word", "Operator", "Bool"] as const;
export type ExtractKind = (typeof EXTRACT_KINDS)[number];
export interface Piece { kind: ExtractKind; value: bigint | number | string | boolean }

const WORD = /[\p{L}\p{N}_]+(?:[@.'’\-][\p{L}\p{N}_]+)*/uy;
const NUM = /[0-9]+(?:\.[0-9]+)?/y;
const MULTI = ["**", "//", "==", "!=", "<=", ">=", "&&", "||"];
const SINGLE = "+-*/%^=<>!&|~()";
const isLetter = (c: string) => /[\p{L}_]/u.test(c);
const isValueEnd = (c: string) => /[\p{L}\p{N}_)\]'"]/u.test(c);

export function extractPieces(s: string, kinds: ExtractKind[]): Piece[] {
  const want = new Set(kinds);
  const numeric = want.has("Int") || want.has("Float") || want.has("Number");
  const out: Piece[] = [];
  const n = s.length;
  let i = 0;
  const prevNonSpace = (at: number) => { let j = at - 1; while (j >= 0 && /\s/.test(s[j])) j--; return j >= 0 ? s[j] : ""; };
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (numeric) {
      const neg = c === "-" && /[0-9]/.test(s[i + 1] ?? "") && !isValueEnd(prevNonSpace(i));
      const at = neg ? i + 1 : i;
      if (/[0-9]/.test(s[at] ?? "")) {
        NUM.lastIndex = at;
        const m = NUM.exec(s)!;
        const glued = at > 0 && !neg && isLetter(s[at - 1]);
        const end = at + m[0].length;
        if (glued) { WORD.lastIndex = i; const w = WORD.exec(s); i = w ? w.index + w[0].length : end; continue; }
        const isFloat = m[0].includes(".");
        const text = (neg ? "-" : "") + m[0];
        if (isFloat) { if (want.has("Float")) out.push({ kind: "Float", value: Number(text) }); else if (want.has("Number")) out.push({ kind: "Number", value: Number(text) }); }
        else if (want.has("Int")) out.push({ kind: "Int", value: BigInt(text) });
        else if (want.has("Number")) out.push({ kind: "Number", value: Number(text) });
        i = end;
        continue;
      }
    }
    if (want.has("Word") || want.has("Bool")) {
      WORD.lastIndex = i;
      const m = WORD.exec(s);
      if (m) {
        const w = m[0];
        if (want.has("Bool") && /^(true|false|yes|no)$/i.test(w)) { const l = w.toLowerCase(); out.push({ kind: "Bool", value: l === "true" || l === "yes" }); }
        else if (want.has("Word")) out.push({ kind: "Word", value: w });
        i += w.length;
        continue;
      }
    }
    if (want.has("Operator")) {
      const two = s.slice(i, i + 2);
      if (MULTI.includes(two)) { out.push({ kind: "Operator", value: two }); i += 2; continue; }
      if (SINGLE.includes(c)) { out.push({ kind: "Operator", value: c }); i++; continue; }
    }
    i++;
  }
  return out;
}
