/**
 * Rewrites the old `"...${expr}..."` interpolation into f-strings: `f"...{expr}..."` (`mycel fmt --fix`, `mycel migrate`).
 * A tiny scanner of its own on purpose: the real lexer now rejects `${`, so old code cannot be lexed by it.
 */
export function migrateSource(text: string): string {
  let i = 0;
  const n = text.length;
  let out = "";

  // Convert the string starting at the quote at `s`; returns [converted, indexAfter].
  const str = (s: number): [string, number] => {
    const triple = text.startsWith('"""', s);
    const q = triple ? '"""' : '"';
    let j = s + q.length;
    let interp = false;
    const segs: { lit?: string; code?: string }[] = [];
    let lit = "";
    while (j < n) {
      if (text[j] === "\\") { lit += text[j] + (text[j + 1] ?? ""); j += 2; continue; }
      if (text.startsWith(q, j)) { j += q.length; break; }
      if (text[j] === "$" && text[j + 1] === "{") {
        interp = true;
        let d = 0, k = j + 2, code = "";
        while (k < n) {
          const c = text[k];
          if (c === '"') { const [conv, nk] = str(k); code += conv; k = nk; continue; }
          if (c === "{") d++;
          else if (c === "}") { if (d === 0) break; d--; }
          code += c; k++;
        }
        segs.push({ lit }); lit = "";
        segs.push({ code: hasTopLevelColon(code) ? `(${code})` : code });
        j = k + 1; continue;
      }
      lit += text[j++];
    }
    segs.push({ lit });
    if (!interp) return [q + lit + q, j];
    const body = segs.map((g) => g.code !== undefined ? `{${g.code}}` : g.lit!.replace(/\{/g, "{{").replace(/\}/g, "}}")).join("");
    return ["f" + q + body + q, j];
  };
  return (() => {
    while (i < n) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "/") { const e = text.indexOf("\n", i); const end = e < 0 ? n : e; out += text.slice(i, end); i = end; continue; }
      if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2; out += text.slice(i, end); i = end; continue; }
      if (c === "'") { const m = /^'(?:\\u\{[0-9a-fA-F]+\}|\\.|[^'\\])'/su.exec(text.slice(i, i + 14)); if (m) { out += m[0]; i += m[0].length; continue; } }
      if (c === '"') { const [conv, ni] = str(i); out += conv; i = ni; continue; }
      out += c; i++;
    }
    return out;
  })();
}

function hasTopLevelColon(code: string): boolean {
  let d = 0;
  for (let k = 0; k < code.length; k++) {
    const c = code[k];
    if (c === '"') { k++; while (k < code.length && code[k] !== '"') { if (code[k] === "\\") k++; k++; } continue; }
    if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--;
    else if (c === ":" && d === 0) return true;
  }
  return false;
}
