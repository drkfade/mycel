import { Source } from "./diag";
import { isOldSlashComment } from "./lexer";

/**
 * Rewrites old syntax forms (`// comment` and block comments → `# comment`, `"${expr}"` → `f"{expr}"`, `import std.x` → `import x`, `import a.{x, y}` → `from a import x, y`)
 * via `mycel fmt --fix` / `mycel migrate`.
 */
export function migrateSource(text: string, opts: { commentsOnly?: boolean } = {}): string {
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
  const srcObj = new Source("migrate", text);
  // `//` was only a comment before; it is floor division now. Division needs a value on its left and an expression on its right,
  // and (to keep `foo() // note` a comment) a line that uses the value: an assignment, return, if/while, or an open bracket.
  const isComment = (j: number): boolean => {
    if (isOldSlashComment(srcObj, j)) return true;
    if (text.startsWith("//=", j)) return false; // `x //= 2` can only be the compound operator
    const ls = text.lastIndexOf("\n", j - 1) + 1, prefix = text.slice(ls, j);
    let d = 0; for (const ch of prefix) { if ("([{".includes(ch)) d++; else if (")]}".includes(ch)) d--; }
    return !(d > 0 || /[^=!<>+\-*\/%]=(?!=)|\b(return|if|while)\b/.test(prefix));
  };
  const pass1 = (() => {
    while (i < n) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "/") {
        if (isComment(i)) { const e = text.indexOf("\n", i); const end = e < 0 ? n : e; out += (text[i + 2] === "/" ? "##" + text.slice(i + 3, end) : "#" + text.slice(i + 2, end)); i = end; continue; }
        out += text.startsWith("//=", i) ? "//=" : "//"; i += text.startsWith("//=", i) ? 3 : 2; continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        const e = text.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2;
        const ls = text.lastIndexOf("\n", i - 1) + 1, ind = text.slice(ls, i).trim() === "" ? text.slice(ls, i) : "";
        const lines = text.slice(i + 2, e < 0 ? n : e).split("\n").map((l) => l.replace(/^\s*\*+ ?/, "").trim());
        while (lines.length && !lines[0]) lines.shift(); while (lines.length && !lines[lines.length - 1]) lines.pop();
        out += lines.map((l, k) => (k ? ind : "") + (l ? "# " + l : "#")).join("\n"); i = end; continue;
      }
      if (c === "#") { const e = text.indexOf("\n", i); const end = e < 0 ? n : e; out += text.slice(i, end); i = end; continue; }
      if (c === "'") { const m = /^'(?:\\u\{[0-9a-fA-F]+\}|\\.|[^'\\])'/su.exec(text.slice(i, i + 14)); if (m) { out += m[0]; i += m[0].length; continue; } }
      if (c === '"') { const [conv, ni] = str(i); out += opts.commentsOnly ? text.slice(i, ni) : conv; i = ni; continue; }
      out += c; i++;
    }
    return out;
  })();
  // Pass 2: line-level import normalization (preserve lines inside multiline strings/comments by checking leading syntax)
  if (opts.commentsOnly) return pass1;
  return pass1.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return line;
    // `import std.foo.{a, b}` -> `from foo import a, b`
    let m = /^([ \t]*)import\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.\{([^}]+)\}(\s+--[A-Za-z_]+)?(\s*#.*)?$/.exec(line);
    if (m) {
      const mod = m[2].startsWith("std.") ? m[2].slice(4) : m[2];
      const names = m[3].trim().replace(/\s+/g, " ");
      return `${m[1]}from ${mod} import ${names}${m[4] ?? ""}${m[5] ?? ""}`;
    }
    // `import std.foo [as bar]` -> `import foo [as bar]`
    m = /^([ \t]*)import\s+std\.([A-Za-z_][A-Za-z0-9_]*)(\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?(\s*#.*)?$/.exec(line);
    if (m) return `${m[1]}import ${m[2]}${m[3] ?? ""}${m[4] ?? ""}`;
    // `from std.foo import a, b` -> `from foo import a, b`
    m = /^([ \t]*)from\s+std\.([A-Za-z_][A-Za-z0-9_]*)\s+import\s+(.+)$/.exec(line);
    if (m) return `${m[1]}from ${m[2]} import ${m[3]}`;
    return line;
  }).join("\n");
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
