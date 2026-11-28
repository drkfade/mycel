import * as A from "./ast";
import { Source } from "./diag";
import { parse } from "./parser";

/** Markdown reference for the `pub` declarations of a module, taken from signatures and `##` comments. */
export function documentModule(text: string, name: string, file = name, includeAll = false): string {
  const src = new Source(file, text);
  const mod = parse(src);
  const lines = text.split("\n");
  const docAbove = (offset: number): string => {
    let ln = src.pos(offset).line - 1;
    const out: string[] = [];
    while (ln >= 1 && /^\s*##/.test(lines[ln - 1])) { out.unshift(lines[ln - 1].replace(/^\s*## ?/, "")); ln--; }
    return out.join("\n");
  };
  /** Source text of a declaration header: everything before its body. */
  const header = (start: number, end: number): string => {
    const t = text.slice(start, end);
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if ("([<".includes(ch)) depth++;
      else if (")]>".includes(ch) && !(ch === ">" && t[i - 1] === "-")) depth = Math.max(0, depth - 1);
      else if (depth === 0 && (ch === "{" || ch === "\n" || (ch === "=" && t[i + 1] === ">"))) return t.slice(0, i).trim();
    }
    return t.trim();
  };
  const out: string[] = [`# ${name}`, ""];
  const entry = (title: string, sig: string, doc: string, level = 2) => {
    out.push(`${"#".repeat(level)} ${title}`, "", "```mycel", sig, "```", "");
    if (doc) out.push(doc, "");
  };
  const members = (fns: A.FnDecl[]) => {
    for (const f of fns) {
      if (f.vis === "private") continue;
      entry(f.isInit ? "init" : f.accessor ? `${f.accessor} ${f.name}` : f.name, header(f.span.start, f.span.end), docAbove(f.span.start), 4);
    }
  };
  for (const d of mod.decls) {
    if (!d.pub && !includeAll) continue;
    const doc = docAbove(d.span.start);
    switch (d.k) {
      case "fn": entry(d.fn.name, header(d.span.start, d.span.end), doc); break;
      case "class": entry(d.name, header(d.span.start, d.span.end), doc); members(d.methods); break;
      case "interface": entry(d.name, header(d.span.start, d.span.end), doc); members(d.methods); break;
      case "enum": entry(d.name, `enum ${d.name} { ${d.variants.map((v) => v.name + (v.fields.length ? "(" + v.fields.map((f) => (f.name ? f.name + ": " : "") + text.slice(f.type.span.start, f.type.span.end)).join(", ") + ")" : "")).join(", ")} }`, doc); members(d.methods); break;
      case "alias": entry(d.name, header(d.span.start, d.span.end), doc); break;
      case "let": entry((d.stmt.pat as any).name, header(d.span.start, d.span.end), doc); break;
      default: break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
