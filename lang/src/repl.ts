import * as readline from "readline";
import * as A from "./ast";
import { CompileError, Diagnostic, Source, Span } from "./diag";
import { parseRepl } from "./parser";
import { Loader, makeResolver, renderDiagnostics } from "./modules";
import { generate } from "./codegen";
import { createRuntime, newCtx, Runtime, RuntimeCtx } from "./runtime";
import { preludeNatives } from "./natives";
import { Capabilities, stdNatives } from "./stdlib";
import { RunError, runErrorOf, wrapGenerated } from "./host";
import { show } from "./types";

export interface EvalResult {
  /** "ok" ran; "incomplete" needs more input lines; "error" compile or runtime failure. */
  status: "ok" | "incomplete" | "error";
  output: string;
  text?: string;
  error?: RunError;
}

/**
 * A live session: every input becomes a small module `repl_N` that imports what earlier inputs declared, so values,
 * functions and types persist while the runtime state stays alive. Top-level `let`/`var` become module globals;
 * a lone expression is echoed with `repr`.
 */
export class ReplSession {
  private loader: Loader;
  private ctx: RuntimeCtx;
  private rt: Runtime;
  private n = 0;
  private owner = new Map<string, string>();        // declared name -> repl module
  private imports: A.Decl[] = [];                     // the user's own `import` lines
  private out: string[] = [];

  constructor(opts: { capabilities?: Capabilities; roots?: string[]; onOutput?: (t: string) => void } = {}) {
    this.loader = new Loader(makeResolver({ roots: opts.roots ?? [] }));
    this.ctx = newCtx({ maxSteps: 2_000_000_000, maxMillis: Infinity, maxOutputBytes: 10_000_000 }, (t) => { this.out.push(t); opts.onOutput?.(t); });
    this.rt = createRuntime(this.ctx, (r) => ({ ...preludeNatives(r), ...stdNatives(r, opts.capabilities ?? {}, []) }));
  }

  private declNames(decls: A.Decl[]): string[] {
    const out: string[] = [];
    for (const d of decls) {
      if (d.k === "class" || d.k === "enum" || d.k === "interface" || d.k === "alias") out.push(d.name);
      else if (d.k === "fn" && d.fn.name !== "$run") out.push(d.fn.name);
      else if (d.k === "let" && d.stmt.pat.k === "bind") out.push(d.stmt.pat.name);
    }
    return out;
  }

  /** Build the module AST for one input. `echo` wraps a lone expression statement in `print(repr(...))`. */
  private build(input: string, parsed: { decls: A.Decl[]; stmts: A.Stmt[] }, echo: boolean): { ast: A.Module; src: Source; echoLet?: A.Stmt } {
    const src = parsed.decls[0]?.span.src ?? parsed.stmts[0]?.span.src ?? new Source("<repl>", input);
    const pubDecls: A.Decl[] = [];
    const userImports: A.Decl[] = [];
    for (const d of parsed.decls) { if (d.k === "import") userImports.push(d); else pubDecls.push({ ...d, pub: true } as A.Decl); }
    const body: A.Stmt[] = [];
    for (const s of parsed.stmts) {
      if (s.k === "let" && s.pat.k === "bind") pubDecls.push({ k: "let", stmt: s, pub: true, span: s.span } as A.Decl);
      else body.push(s);
    }
    let echoLet: A.Stmt | undefined;
    if (echo && body.length === 1 && body[0].k === "expr") {
      const e = body[0].expr, sp = e.span;
      const id = (name: string): A.Expr => ({ k: "id", name, span: sp } as A.Expr);
      echoLet = { k: "let", pat: { k: "bind", name: "$v", mutable: false, span: sp }, mutable: false, init: e, span: sp } as A.Stmt;
      const call = (f: string, a: A.Expr): A.Expr => ({ k: "call", callee: id(f), args: [{ value: a, span: sp }], span: sp } as A.Expr);
      body.splice(0, 1, echoLet, { k: "expr", expr: call("print", call("repr", id("$v"))), span: sp } as A.Stmt);
    }
    const mine = new Set(this.declNames(pubDecls));
    const byModule = new Map<string, string[]>();
    for (const [name, mod] of this.owner) if (!mine.has(name)) (byModule.get(mod) ?? byModule.set(mod, []).get(mod)!).push(name);
    const sp0: Span = { src, start: 0, end: 0 };
    const reImports: A.Decl[] = [...byModule].map(([mod, names]) => ({ k: "import", path: [mod], names: names.map((name) => ({ name, span: sp0 })), span: sp0, pub: false } as A.Decl));
    const run: A.Decl = {
      k: "fn", pub: true, span: sp0,
      fn: { name: "$run", typeParams: [], params: [], body: { k: "block", stmts: body, span: sp0 }, async: true, gen: false, pub: true, span: sp0 },
    } as A.Decl;
    return { ast: { decls: [...this.imports, ...userImports, ...reImports, ...pubDecls, run], src }, src, echoLet };
  }

  async eval(input: string): Promise<EvalResult> {
    this.out = [];
    let parsed: { decls: A.Decl[]; stmts: A.Stmt[] };
    try { parsed = parseRepl(new Source("<repl>", input)); }
    catch (e) {
      if (e instanceof CompileError) {
        const at = e.diagnostics[0]?.span?.start ?? 0;
        if (at >= input.trimEnd().length) return { status: "incomplete", output: "" };
        return { status: "error", output: "", text: renderDiagnostics(e.diagnostics) };
      }
      throw e;
    }
    if (!parsed.decls.length && !parsed.stmts.length) return { status: "ok", output: "" };
    for (const echo of [true, false]) {
      const { ast } = this.build(input, parsed, echo);
      const name = `repl_${this.n + 1}`;
      this.loader.checker.diags.length = 0;
      this.loader.diagnostics.length = 0;
      const mods = this.loader.add(name, { file: "<repl>", text: input, ast });
      const diags: Diagnostic[] = [...this.loader.diagnostics, ...this.loader.checker.diags].filter((d) => !(d.severity === "warning" && (d.code === "W0101" || d.code === "W0301")));
      const errors = diags.filter((d) => d.severity === "error");
      if (errors.length) {
        this.loader.discard(mods.length ? mods : []);
        if (echo && errors.some((d) => d.code === "E0267")) continue; // the expression has no value: run it as a statement
        return { status: "error", output: "", text: renderDiagnostics(diags) };
      }
      this.n++;
      for (const nm of this.declNames(ast.decls)) this.owner.set(nm, name);
      this.imports.push(...parsed.decls.filter((d) => d.k === "import"));
      const g = generate(this.loader.checker, mods.filter((m) => m.name === name || !this.generated.has(m.name)));
      for (const m of mods) this.generated.add(m.name);
      const c = wrapGenerated(g, name);
      this.ctx.steps = 0; this.ctx.start = Date.now(); this.ctx.outputBytes = 0;
      try {
        // eslint-disable-next-line no-new-func
        const factory = new (require("vm").Script)(c.code!, { filename: "ply:bundle" }).runInThisContext() as (rt: unknown) => void;
        factory({ ...this.rt.helpers });
        const run = this.ctx.M[name].$run;
        if (typeof run === "function") await run();
      } catch (e) {
        const err = runErrorOf(e, c);
        return { status: "error", output: this.out.join(""), text: err.human, error: err };
      }
      return { status: "ok", output: this.out.join(""), text: diags.length ? renderDiagnostics(diags) : undefined };
    }
    return { status: "error", output: "", text: "internal REPL error" };
  }
  private generated = new Set<string>();

  /** The static type of an expression, without running it. */
  typeOf(expr: string): string {
    let parsed: { decls: A.Decl[]; stmts: A.Stmt[] };
    try { parsed = parseRepl(new Source("<repl>", expr)); } catch (e) { return e instanceof CompileError ? renderDiagnostics(e.diagnostics) : String(e); }
    const { ast, echoLet } = this.build(expr, parsed, true);
    if (!echoLet) return "(not an expression)";
    this.loader.checker.diags.length = 0; this.loader.diagnostics.length = 0;
    const mods = this.loader.add(`repl_type_${++this.n}`, { file: "<repl>", text: expr, ast });
    const errs = [...this.loader.diagnostics, ...this.loader.checker.diags].filter((d) => d.severity === "error");
    const t = errs.length ? renderDiagnostics(errs) : show(((echoLet as any).init as any).ty);
    this.loader.discard(mods);
    return t;
  }

  reset() { this.n = 0; this.owner.clear(); this.imports = []; this.generated.clear(); }
}

const REPL_HELP = `  :type <expr>   show the static type of an expression
  :reset         forget everything
  :help          this text
  :quit          leave (or Ctrl-D)
Expressions print their value. Declarations (fn, class, struct, enum, let, var, import) persist.
Top-level initializers run once, when you enter them.`;

export async function startRepl(o: { capabilities: Capabilities }): Promise<number> {
  const session = new ReplSession({ capabilities: o.capabilities, onOutput: (t) => process.stdout.write(t) });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "mycel> " });
  console.log("mycel 0.1.0 repl — :help for commands, :quit to leave");
  let buf = "";
  rl.prompt();
  const lines: string[] = [];
  let busy = false;
  let closed = false;
  const pump = async () => {
    if (busy) return;
    busy = true;
    while (lines.length) {
      const line = lines.shift()!;
      const t = line.trim();
      if (!buf && t.startsWith(":")) {
        if (t === ":quit" || t === ":q") { rl.close(); break; }
        else if (t === ":help") console.log(REPL_HELP);
        else if (t === ":reset") { session.reset(); console.log("session cleared"); }
        else if (t.startsWith(":type ")) console.log(session.typeOf(t.slice(6)));
        else console.log(`unknown command ${t.split(" ")[0]} (:help lists them)`);
        if (!closed) rl.prompt();
        continue;
      }
      buf += (buf ? "\n" : "") + line;
      const r = await session.eval(buf);
      if (r.status === "incomplete") { rl.setPrompt("...  "); rl.prompt(); continue; }
      buf = "";
      if (r.text) console.log(r.text);
      rl.setPrompt("mycel> ");
      if (!closed) rl.prompt();
    }
    busy = false;
    if (closed) process.exit(0);
  };
  rl.on("line", (l) => { lines.push(l); void pump(); });
  return new Promise<number>((res) => rl.on("close", () => { closed = true; if (!busy) res(0); else void 0; res(0); }));
}
