import { withExt } from "./exts";
import * as fs from "fs";
import * as path from "path";
import * as A from "./ast";
import { CompileError, Diagnostic, Source, formatDiagnostic } from "./diag";
import { parse } from "./parser";
import { Checker } from "./checker";
import { ModuleInfo } from "./types";

export interface ResolvedModule { file: string; text: string; isStd: boolean }
export interface ProgramInput {
  entry: { name: string; file: string; text: string };
  /** Find a module by dotted name ("models.user", "std.io"). */
  resolve(name: string): ResolvedModule | undefined;
}
export interface Program {
  checker: Checker;
  modules: ModuleInfo[];            // dependency order, prelude first
  diagnostics: Diagnostic[];
  ok: boolean;
}

export const STD_DIR = path.resolve(__dirname, "..", "..", "std");

/** Resolver for a project: src root, std library, installed packages, host-supplied virtual modules. */
export function makeResolver(opts: { roots: string[]; packages?: Record<string, string>; virtual?: Record<string, string>; stdDir?: string }) {
  const stdDir = opts.stdDir ?? STD_DIR;
  return (name: string): ResolvedModule | undefined => {
    if (opts.virtual && name in opts.virtual) return { file: `<${name}>`, text: opts.virtual[name], isStd: true };
    const parts = name.split(".");
    if (name === "prelude" || parts[0] === "std") {
      const f = withExt(path.join(stdDir, ...(name === "prelude" ? ["prelude"] : parts.slice(1))), fs.existsSync);
      if (f) return { file: f, text: fs.readFileSync(f, "utf8"), isStd: true };
      return undefined;
    }
    if (opts.packages && parts[0] in opts.packages) {
      const root = opts.packages[parts[0]];
      const rest = parts.slice(1);
      const cand = rest.length ? [path.join(root, "src", ...rest)] : [path.join(root, "src", "lib"), path.join(root, "src", parts[0])];
      for (const b of cand) { const f = withExt(b, fs.existsSync); if (f) return { file: f, text: fs.readFileSync(f, "utf8"), isStd: false }; }
    }
    for (const root of opts.roots) {
      const f = withExt(path.join(root, ...parts), fs.existsSync);
      if (f) return { file: f, text: fs.readFileSync(f, "utf8"), isStd: false };
    }
    return undefined;
  };
}

/** Loads an entry module and everything it imports (dependencies first). Reusable: the REPL adds entries one at a time. */
export class Loader {
  checker = new Checker();
  diagnostics: Diagnostic[] = [];
  private loaded = new Map<string, { ast: A.Module; file: string; isStd: boolean; deps: string[] }>();
  private registered = new Set<string>();
  fatal = false;
  constructor(private resolve: (name: string) => ResolvedModule | undefined) {}

  private fail(e: unknown) {
    if (e instanceof CompileError) { this.diagnostics.push(...e.diagnostics); this.fatal = true; return; }
    throw e;
  }

  private load(name: string, r: ResolvedModule | { file: string; text: string; isStd: boolean; ast?: A.Module }, stack: string[], order: string[]) {
    if (this.loaded.has(name)) { if (!order.includes(name) && !this.registered.has(name)) order.push(name); return; }
    stack.push(name);
    let ast: A.Module;
    try { ast = (r as any).ast ?? parse(new Source(r.file, r.text)); } catch (e) { this.fail(e); stack.pop(); return; }
    if (ast.script && stack.length > 1) {
      this.diagnostics.push({ severity: "error", code: "E0206", message: `module ${name} has top-level statements`, span: ast.script, why: "statements outside a function only run in the file you start, not in files that are imported", suggestion: "put them in a function (`fn setup() { ... }`) and call it from the main file" });
      this.fatal = true;
    }
    const deps: string[] = [];
    this.loaded.set(name, { ast, file: r.file, isStd: r.isStd, deps });
    for (const d of ast.decls) {
      if (d.k !== "import") continue;
      // `import a.b.c` is module a.b.c, or member c of module a.b
      const full = d.path.join(".");
      let target: string | undefined = full;
      let res = this.registered.has(full) ? ({} as ResolvedModule) : this.resolve(full);
      if (!res && d.path.length > 1) { target = d.path.slice(0, -1).join("."); res = this.registered.has(target) ? ({} as ResolvedModule) : this.resolve(target); }
      if (!res || !target) continue; // the checker reports "cannot find module"
      if (stack.includes(target)) {
        this.diagnostics.push({ severity: "error", code: "E0205", message: `circular import: ${[...stack.slice(stack.indexOf(target)), target].join(" -> ")}`, span: d.span, why: "modules cannot import each other in a loop, because neither could be initialised first", suggestion: "move the shared declarations into a third module that both import" });
        this.fatal = true; continue;
      }
      deps.push(target);
      if (!this.registered.has(target)) this.load(target, res, stack, order);
    }
    stack.pop();
    if (!order.includes(name)) order.push(name);
  }

  /** Parse + register + type-check a new entry (and any not-yet-loaded imports). Returns the new modules in dependency order. */
  add(name: string, entry: { file: string; text: string; ast?: A.Module }, isStd = false): ModuleInfo[] {
    try { return this.addUnsafe(name, entry, isStd); }
    catch (e) {
      if (e instanceof CompileError) { this.fail(e); return []; }
      const deep = e instanceof RangeError;
      this.diagnostics.push({
        severity: "error", code: deep ? "E0002" : "E0003", span: { src: new Source(entry.file, entry.text), start: 0, end: 0 },
        message: deep ? "this program is nested too deeply to compile" : `internal compiler error: ${(e as Error)?.message ?? e}`,
        why: deep ? "expressions or blocks are nested hundreds of levels deep" : "this is a bug in the compiler, not in your program",
        suggestion: deep ? "split the expression into smaller named steps" : "reduce the program to the smallest version that still fails and report it",
      });
      this.fatal = true;
      return [];
    }
  }
  private addUnsafe(name: string, entry: { file: string; text: string; ast?: A.Module }, isStd: boolean): ModuleInfo[] {
    const order: string[] = [];
    if (!this.registered.has("prelude")) {
      const prelude = this.resolve("prelude");
      if (!prelude) throw new Error("the standard prelude (std/prelude.myc or .olx) is missing");
      this.load("prelude", prelude, [], order);
    }
    this.load(name, { ...entry, isStd }, [], order);
    if (this.fatal) return [];
    const mods = order.map((n) => { const l = this.loaded.get(n)!; return this.checker.addModule(n, l.file, l.ast, l.isStd, l.deps); });
    for (const m of mods) this.registered.add(m.name);
    try { this.checker.checkAll(mods); } catch (e) { this.fail(e); }
    return mods;
  }

  /** Forget a module that failed to check (REPL: a bad line must not poison the session). */
  discard(mods: ModuleInfo[]) {
    for (const m of mods) {
      this.checker.modules.delete(m.name); this.loaded.delete(m.name); this.registered.delete(m.name);
      const i = this.checker.order.indexOf(m); if (i >= 0) this.checker.order.splice(i, 1);
    }
    this.fatal = false;
  }
}

export function compileProgram(input: ProgramInput): Program {
  const loader = new Loader(input.resolve);
  const mods = loader.add(input.entry.name, input.entry);
  const diagnostics = [...loader.diagnostics, ...loader.checker.diags];
  const ok = !loader.fatal && !diagnostics.some((d) => d.severity === "error");
  return { checker: loader.checker, modules: ok || mods.length ? mods : [], diagnostics, ok };
}

export function renderDiagnostics(ds: Diagnostic[]): string {
  const errs = ds.filter((d) => d.severity === "error").length, warns = ds.length - errs;
  return ds.map(formatDiagnostic).join("\n\n") + (ds.length ? `\n\n${errs} error${errs === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}` : "");
}
