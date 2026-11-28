import { STATEMENT_WORDS, sequenceHabit } from "./habits";
import { CompileError, Source, Span } from "./diag";
import { lex, Token } from "./lexer";
import * as A from "./ast";

const BIN: Record<string, [number, boolean]> = {
  "|>": [1, false], "??": [3, true], "||": [4, false], "&&": [5, false],
  "==": [6, false], "!=": [6, false], "<": [7, false], "<=": [7, false], ">": [7, false], ">=": [7, false],
  "..": [8, false], "..=": [8, false], "|": [9, false], "^": [10, false], "&": [11, false],
  "<<": [12, false], ">>": [12, false], "+": [13, false], "-": [13, false], "*": [14, false], "/": [14, false], "//": [14, false], "%": [14, false], "**": [15, true],
};
const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", "//=", "%=", "**=", "??=", "<<=", ">>="]);
const MODS = new Set(["pub", "private", "protected", "static", "override", "async", "gen", "extern"]);

export function parse(src: Source): A.Module {
  const p = new Parser(src, lex(src));
  return p.module();
}

/** Parse a single expression or statement list for the REPL; returns decls/stmts. */
export function parseRepl(src: Source): { decls: A.Decl[]; stmts: A.Stmt[] } {
  const p = new Parser(src, lex(src));
  return p.repl();
}

class Parser {
  i = 0;
  constructor(readonly src: Source, readonly toks: Token[]) {}

  // ---------- token helpers ----------
  get t(): Token { return this.toks[this.i]; }
  peek(n = 1): Token { return this.toks[Math.min(this.i + n, this.toks.length - 1)]; }
  next(): Token { const t = this.toks[this.i]; if (this.i < this.toks.length - 1) this.i++; return t; }
  isOp(v: string, t = this.t) { return t.k === "op" && t.v === v; }
  isKw(v: string, t = this.t) { return t.k === "kw" && t.v === v; }
  span(a: number, b: number = this.toks[Math.max(0, this.i - 1)].end): Span { return { src: this.src, start: a, end: Math.max(a, b) }; }
  here(): Span { return this.span(this.t.start, this.t.end); }
  acceptOp(v: string) { if (this.isOp(v)) { this.next(); return true; } return false; }
  acceptKw(v: string) { if (this.isKw(v)) { this.next(); return true; } return false; }
  skipNl() { while (this.t.k === "nl" || this.isOp(";")) this.next(); }
  describe(t: Token): string {
    if (t.k === "eof") return "the end of the file";
    if (t.k === "nl") return "the end of the line";
    if (t.k === "str") return "a string";
    if (t.k === "int" || t.k === "float") return `the number ${t.v}`;
    return `\`${t.v}\``;
  }
  fail(msg: string, span: Span = this.here(), opts: { why?: string; suggestion?: string; code?: string } = {}): never {
    const h = this.habitHere();
    if (h) {
      const sug = h.includes("slicing is Python") ? "write `[1..2]`" : h.includes("empty dictionary") ? "write `{}`, e.g. `var counts: {String: Int} = {}`" : h.includes("dictionary type") ? "write the map type with braces, e.g. `var counts: {String: Int} = {}`" : opts.suggestion;
      opts = { ...opts, why: opts.why ?? msg, suggestion: sug };
      msg = h;
    }
    throw new CompileError([{ severity: "error", code: opts.code ?? "E0100", message: msg, span, why: opts.why, suggestion: opts.suggestion }]);
  }
  /** A newcomer habit at the failure point (`x++`, `:=`, `===`, `if x:`) → the fix-it that names the language. */
  habitHere(): string | undefined {
    const at = (d: number) => this.toks[this.i + d];
    for (const d of [-2, -1, 0]) {
      const a = at(d), b = at(d + 1);
      if (a && b && a.k === "op" && b.k === "op" && a.end === b.start) { const h = sequenceHabit(a.v, b.v); if (h) return h; }
    }
    if (this.t.k === "op" && this.t.v === ":" && !this.t.sp) {
      const prev = at(-1);
      let bracketDepth = 0;
      for (let j = this.i - 1; j >= 0; j--) {
        const tk = this.toks[j];
        if (tk.k === "op" && tk.v === "]") bracketDepth++;
        else if (tk.k === "op" && tk.v === "[") {
          if (bracketDepth === 0 && this.isOp("[", at(-1)) && this.isOp("]", at(1))) return "`[:]` is Swift's empty dictionary — Mycel's empty map is `{}`";
          if (bracketDepth === 0 && this.toks[j + 1]?.k === "id" && /^[A-Z]/.test(this.toks[j + 1].v) && j + 2 === this.i && at(1)?.k === "id" && /^[A-Z]/.test(at(1).v)) return `\`[${this.toks[j + 1].v}: ${at(1).v}]\` is Swift's dictionary type — Mycel writes the map type with braces: \`{${this.toks[j + 1].v}: ${at(1).v}}\``;
          if (bracketDepth === 0) return "`[a:b]` slicing is Python — Mycel slices with a range: `[a..b]`";
          bracketDepth--;
        }
        if (tk.k === "nl" || (tk.k === "op" && (tk.v === "{" || tk.v === "}" || tk.v === ";"))) break;
      }
      if (prev && prev.k !== "op" || (prev && (prev.v === ")" || prev.v === "]"))) return "a `:` block is Python — Mycel blocks use `{ ... }`, e.g. `if x { ... }` / `else { ... }`";
    }
    return undefined;
  }
  /** Statement/declaration starting with another language's keyword → the Mycel spelling. */
  habitWord(): void {
    const t = this.t;
    if (t.k !== "id" || !Object.prototype.hasOwnProperty.call(STATEMENT_WORDS, t.v)) return;
    const n = this.peek();
    const printish = ["println", "printf", "puts", "echo"].includes(t.v);
    const dotted = ["System", "console", "fmt"].includes(t.v);
    const braceWord = ["loop", "defer"].includes(t.v);
    const passHit = t.v === "pass";
    const typeofHit = t.v === "typeof";
    const withHit = t.v === "with" && (n.k === "id" || n.k === "kw");
    const fromHit = t.v === "from" && (n.k === "id" || n.k === "kw");
    const delHit = (t.v === "del" || t.v === "delete") && (n.k === "id" || n.k === "kw");
    const hit = passHit || typeofHit || withHit || fromHit || delHit || (braceWord ? this.isOp("{", n) || n.k === "id" : dotted ? this.isOp(".", n) : printish ? (this.isOp("(", n) || n.k === "str") : (n.k === "id" || n.k === "kw" || n.k === "str" || n.k === "int" || n.k === "float" || (this.isOp("(", n) && ["elif", "elsif", "elseif", "switch", "except", "raise", "foreach", "typeof"].includes(t.v))));
    if (hit) this.fail(STATEMENT_WORDS[t.v], this.here(), { why: "this word comes from another language", suggestion: "see `mycel help habits`", code: "E0101" });
  }
  expectOp(v: string, ctx: string, opener?: Token): Token {
    if (this.isOp(v)) return this.next();
    const found = this.describe(this.t);
    const open = opener ? ` (opened at line ${this.src.pos(opener.start).line})` : "";
    this.fail(`expected \`${v}\` ${ctx}, found ${found}`, this.here(), {
      why: opener ? `the \`${opener.v}\`${open} is never closed` : `the parser needs \`${v}\` here to continue`,
      suggestion: v === ")" || v === "]" || v === "}" ? `add \`${v}\`` : `insert \`${v}\``,
    });
  }
  ident(ctx: string): Token {
    if (this.t.k === "id") return this.next();
    if (this.t.k === "kw" && !["self", "super", "true", "false", "nil"].includes(this.t.v) && ["get", "set"].includes(this.t.v)) return this.next();
    if (this.t.k === "kw" && this.t.v === "init" && ctx.includes("fn")) {
      this.fail("initializers are written `init(...) { ... }` without `fn`", this.here(), { why: "`init` is the constructor; it does not take `fn`", suggestion: "write `init(...) { ... }`" });
    }
    if (this.t.k === "kw") this.fail(`expected a name ${ctx}, found the keyword \`${this.t.v}\``, this.here(), { why: `\`${this.t.v}\` is reserved by the language`, suggestion: `pick another name, e.g. \`${this.t.v}_\` or \`my_${this.t.v}\`` });
    this.fail(`expected a name ${ctx}, found ${this.describe(this.t)}`);
  }
  endStmt(what = "statement") {
    if (this.t.k === "nl" || this.isOp(";")) { this.next(); return; }
    if (this.isOp("}") || this.t.k === "eof") return;
    if (what === "statement" && this.toks[this.i - 1]?.k === "id" && this.toks[this.i - 1]?.v === "print") {
      this.fail("`print` is called with parentheses: `print(...)`", this.here(), {
        why: "print is a function in Mycel; writing print without ( is Python 2", suggestion: "write `print(...)`", code: "E0101"
      });
    }
    this.fail(`unexpected ${this.describe(this.t)} after the ${what}`, this.here(), {
      why: "statements are separated by a newline or `;`", suggestion: "put the next statement on its own line",
    });
  }

  // ---------- module / decls ----------
  module(): A.Module {
    const decls: A.Decl[] = [];
    this.skipNl();
    const script: A.Stmt[] = [];
    // Names a top-level `x = ...` may reassign; the first `x = ...` of a new name declares it like `var x = ...`
    // (Python/Ruby: assignment creates the variable), so functions in the file can use it.
    const known = new Set<string>();
    while (this.t.k !== "eof") {
      if (this.startsDecl() || (!script.length && this.startsGlobal())) {
        const d = this.decl(); decls.push(d);
        const nm = d.k === "let" ? (d.stmt.pat as any).name : d.k === "fn" ? d.fn.name : (d as any).name;
        if (nm) known.add(nm);
      } else if (!script.length && this.t.k === "id" && this.peek().k === "op" && this.peek().v === "=" && !known.has(this.t.v)) {
        // only the file's opening assignments become module-level (functions can use them); once the script has
        // started, a new `x = ...` may depend on its locals, so it stays a script statement (a local of main)
        const n = this.next(); this.next(); this.skipNl();
        const init = this.expr();
        const sp = this.span(n.start);
        known.add(n.v);
        const stmt = { k: "let", pat: { k: "bind", name: n.v, mutable: true, span: this.span(n.start, n.end) }, mutable: true, init, span: sp } as A.Stmt;
        // a value that needs `await` can't initialise a module-level variable: it stays a script statement (a local of main)
        if (hasAwait([{ k: "expr", expr: init, span: sp } as A.Stmt])) script.push(stmt);
        else decls.push({ k: "let", stmt, span: sp, pub: false } as any);
        this.endStmt();
      } else { script.push(this.stmt()); this.endStmt(); }
      this.skipNl();
    }
    if (!script.length) return { decls, src: this.src };
    // A script: top-level statements run in order as the implicit `fn main()` (no boilerplate for a first program).
    const span = this.span(script[0].span.start, script[script.length - 1].span.end);
    const dup = decls.find((d) => d.k === "fn" && d.fn.name === "main");
    if (dup) this.fail("this file has both top-level statements and `fn main()`", script[0].span, { why: "the statements already are the program's main", suggestion: "move the statements into `fn main()`, or delete `fn main()` and keep the statements" });
    const fn: A.FnDecl = { name: "main", typeParams: [], params: [], body: { k: "block", stmts: script, span }, async: hasAwait(script), gen: false, pub: false, span };
    decls.push({ k: "fn", fn, span, pub: false });
    return { decls, src: this.src, script: span };
  }

  repl(): { decls: A.Decl[]; stmts: A.Stmt[] } {
    const decls: A.Decl[] = [], stmts: A.Stmt[] = [];
    this.skipNl();
    while (this.t.k !== "eof") {
      if (this.startsDecl()) decls.push(this.decl()); else { stmts.push(this.stmt()); this.endStmt(); }
      this.skipNl();
    }
    return { decls, stmts };
  }

  /** The operator after `operator`: one token, except `[]` which the lexer splits into `[` `]`. */
  operatorName(): string {
    const op = this.next();
    if (op.k === "op" && op.v === "[" && this.isOp("]")) { this.next(); return "[]"; }
    return op.v;
  }
  /** `let`/`var` (optionally `pub`) at the top level stay module-level declarations, so functions can use them. */
  startsGlobal(): boolean {
    let j = this.i;
    while (this.toks[j].k === "kw" && MODS.has(this.toks[j].v)) j++;
    const t = this.toks[j];
    // `let (a, b) = ...` destructures: a script statement, not a module-level binding
    return t.k === "kw" && (t.v === "let" || t.v === "var") && !(this.toks[j + 1]?.k === "op" && ["(", "["].includes(this.toks[j + 1].v));
  }

  /** `from X import ...` (Python's form; `import` must follow on the same line). */
  isFromImport(): boolean {
    if (!(this.t.k === "id" && this.t.v === "from")) return false;
    for (let j = this.i + 1; j < this.toks.length && this.toks[j].k !== "nl" && this.toks[j].k !== "eof"; j++) if (this.toks[j].k === "kw" && this.toks[j].v === "import") return true;
    return false;
  }

  startsDecl(): boolean {
    let j = this.i;
    while (this.toks[j].k === "kw" && MODS.has(this.toks[j].v)) j++;
    const t = this.toks[j];
    if (t.k === "id" && t.v === "test" && this.toks[j + 1].k === "str") return true;
    if (j === this.i && this.isFromImport()) return true;
    return t.k === "kw" && ["fn", "class", "struct", "interface", "enum", "type", "extend", "import"].includes(t.v);
  }

  decl(): A.Decl {
    const start = this.t.start;
    if (this.isFromImport()) return { ...this.fromImportDecl(), span: this.span(start), pub: false } as A.Decl;
    this.habitWord();
    const mods = this.modifiers();
    const t = this.t;
    const mk = <T extends object>(d: T): A.Decl => ({ ...(d as any), span: this.span(start), pub: mods.pub });
    if (t.k === "id" && t.v === "test" && this.peek().k === "str") { this.next(); const n = this.strLiteralText(); return mk({ k: "test", name: n, body: this.block() }); }
    if (t.k === "kw") {
      switch (t.v) {
        case "import": return mk(this.importDecl());
        case "fn": return mk({ k: "fn", fn: this.fnDecl(mods) });
        case "class": case "struct": return mk(this.classDecl(mods));
        case "interface": return mk(this.interfaceDecl());
        case "enum": return mk(this.enumDecl());
        case "type": return mk(this.aliasDecl());
        case "extend": return mk(this.extendDecl());
        case "let": case "var": { const s = this.letStmt(); s.pub = mods.pub; this.endStmt("declaration"); return mk({ k: "let", stmt: s }); }
      }
    }
    this.fail(`expected a declaration, found ${this.describe(t)}`, this.here(), {
      why: "top-level code must be a declaration: fn, class, struct, interface, enum, type, extend, import, let, var or test",
      suggestion: "wrap statements in `fn main() { ... }` — `mycel run` calls main() if it exists",
    });
  }

  modifiers() {
    const m = { pub: false, vis: undefined as A.Visibility | undefined, static: false, override: false, async: false, gen: false, extern: false };
    for (;;) {
      const t = this.t;
      if (t.k !== "kw" || !MODS.has(t.v)) break;
      // `async`/`gen` only count as modifiers when followed by something declaration-like
      if (t.v === "pub") m.pub = true;
      else if (t.v === "private" || t.v === "protected") m.vis = t.v;
      else if (t.v === "static") m.static = true;
      else if (t.v === "override") m.override = true;
      else if (t.v === "async") m.async = true;
      else if (t.v === "gen") m.gen = true;
      else if (t.v === "extern") m.extern = true;
      this.next();
    }
    return m;
  }

  /** `--python` inside an import statement (owner 27 Nov: the same flags as `ply install`, anywhere in the statement).
   *  Mycel has no `--` operator, so two touching `-` before a touching name can only be this flag. */
  importFlag(flag: { name: string; span: Span; nonTrailing?: boolean } | undefined): { name: string; span: Span; nonTrailing?: boolean } | undefined {
    while (this.isOp("-") && this.isOp("-", this.peek()) && this.peek().start === this.t.end && this.peek(2).k === "id" && this.peek(2).start === this.peek().end) {
      const s = this.t.start; this.next(); this.next();
      const name = this.next().v, span = this.span(s);
      if (flag && flag.name !== name) this.fail(`two runtime flags in one import: \`--${flag.name}\` and \`--${name}\``, span, { suggestion: `keep one: \`--${flag.name}\`` });
      const atEnd = this.t.k === "nl" || this.t.k === "eof" || this.isOp(";");
      flag = { name, span, ...(!atEnd ? { nonTrailing: true } : {}) };
    }
    return flag;
  }

  /** `import a.b [as x]`, `import "@scope/pkg" as x --npm`, each with a trailing `--<runtime>` flag on foreign modules. */
  importDecl() {
    this.next();
    let flag = this.importFlag(undefined);
    let quoted = false;
    let path: string[];
    if (this.t.k === "str") { quoted = true; path = [this.strLiteralText()]; }
    else path = [this.ident("after `import`").v];
    flag = this.importFlag(flag);
    if (this.t.k === "id" && this.t.v === "from") this.fail("`import x from \"y\"` is JavaScript — Mycel writes `import y` or `from y import x`", this.here(), { code: "E0101", suggestion: "see `mycel help habits`" });
    let names: { name: string; alias?: string; span: Span }[] | undefined, alias: string | undefined, all = false, braceForm = false;
    while (!quoted && this.isOp(".")) {
      this.next();
      if (this.isOp("{")) {
        const o = this.next(); names = []; braceForm = true;
        this.skipNl();
        while (!this.isOp("}")) {
          const nt = this.ident("in the import list");
          let al: string | undefined;
          if (this.acceptKw("as")) al = this.ident("after `as`").v;
          names.push({ name: nt.v, alias: al, span: this.span(nt.start) });
          this.skipNl();
          if (!this.acceptOp(",")) break;
          this.skipNl();
        }
        this.expectOp("}", "to close the import list", o);
        break;
      }
      if (this.isOp("*")) {
        const sp = this.span(this.next().start);
        this.fail("wildcard imports (`*`) are not supported — import the module or list the names you want", sp, { code: "E0101", suggestion: `write \`import ${path.join(".")}\` or \`from ${path.join(".")} import name\`` });
      }
      path.push(this.ident("in the import path").v);
    }
    flag = this.importFlag(flag);
    if (this.acceptKw("as")) {
      alias = this.ident("after `as`").v;
      flag = this.importFlag(flag);
    }
    this.endStmt("import");
    return { k: "import" as const, path, names, alias, all, flag, quoted, braceForm };
  }

  /** Canonical selective import: `from X import Y [as Z], W [--<lang>]`. */
  fromImportDecl() {
    this.next();
    let flag = this.importFlag(undefined);
    let quoted = false;
    const path: string[] = [];
    if (this.t.k === "str") { quoted = true; path.push(this.strLiteralText()); }
    else { path.push(this.ident("after `from`").v); while (this.isOp(".")) { this.next(); path.push(this.ident("in the module path").v); } }
    flag = this.importFlag(flag);
    if (!this.acceptKw("import")) this.fail(`expected \`import\` after \`from ${path.join(".")}\``, this.here(), { suggestion: `write \`from ${path.join(".")} import name\`` });
    flag = this.importFlag(flag);
    const names: { name: string; alias?: string; span: Span }[] = [];
    let all = false;
    if (this.isOp("*")) {
      const sp = this.span(this.next().start);
      this.fail("wildcard imports (`*`) are not supported — list the names you want or import the module", sp, { code: "E0101", suggestion: `write \`from ${quoted ? JSON.stringify(path[0]) : path.join(".")} import name\` or \`import ${quoted ? JSON.stringify(path[0]) : path.join(".")}\`` });
    } else if (this.isOp("[")) {
      const sp = this.span(this.next().start);
      const items: string[] = [];
      while (!this.isOp("]") && this.t.k !== "nl" && this.t.k !== "eof") {
        if (this.t.k === "id") {
          let s = this.next().v;
          if (this.acceptKw("as") && this.t.k === "id") s += " as " + this.next().v;
          items.push(s);
          if (!this.acceptOp(",")) break;
        } else break;
      }
      if (this.isOp("]")) this.next();
      const mod = quoted ? JSON.stringify(path[0]) : path.join(".");
      this.fail(`\`from ${mod} import [...]\` takes no brackets`, sp, { code: "E0101", suggestion: `write without brackets: \`from ${mod} import ${items.join(", ") || "name"}\`` });
    } else {
      const paren = this.acceptOp("(");
      for (;;) {
        if (paren) this.skipNl();
        const nt = this.ident("in the import list");
        let al: string | undefined;
        if (this.acceptKw("as")) al = this.ident("after `as`").v;
        names.push({ name: nt.v, alias: al, span: this.span(nt.start) });
        if (paren) this.skipNl();
        if (!this.acceptOp(",")) {
          flag = this.importFlag(flag);
          break;
        }
        flag = this.importFlag(flag);
      }
      if (paren) this.expectOp(")", "to close the import list");
    }
    flag = this.importFlag(flag);
    this.endStmt("import");
    return { k: "import" as const, path, names: all ? undefined : names, all, flag, quoted, fromForm: true };
  }

  typeParams(): A.TypeParam[] {
    const out: A.TypeParam[] = [];
    if (!this.isOp("<")) return out;
    this.next();
    for (;;) {
      const n = this.ident("in the generic parameter list");
      const bounds: A.TypeExpr[] = [];
      if (this.acceptOp(":")) { bounds.push(this.type()); while (this.acceptOp("&")) bounds.push(this.type()); }
      out.push({ name: n.v, bounds, span: this.span(n.start) });
      if (!this.acceptOp(",")) break;
    }
    this.expectOp(">", "to close the generic parameter list");
    return out;
  }

  params(): A.Param[] {
    const o = this.expectOp("(", "to start the parameter list");
    const out: A.Param[] = [];
    this.skipNl();
    while (!this.isOp(")")) {
      const variadic = this.acceptOp("...");
      if (this.t.k === "kw" && this.t.v === "self") {
        this.fail("`self` is not declared as a parameter in Mycel — methods have `self` available automatically (like Swift, Java or TypeScript)", this.here(), {
          why: "methods automatically bind `self` to the instance",
          suggestion: "remove `self` from the parameter list"
        });
      }
      // `fn f((a, b): (Int, Int))` / `((k, v)) => k` (Swift/Rust/Python 2): destructure the argument. The parameter gets
      // a generated name ($ can never be written by a user, so it cannot collide); the checker binds the pattern.
      const structPat = this.t.k === "id" && /^[A-Z]/.test(this.t.v) && this.isOp("{", this.peek()) && !this.peek().sp;
      if ((this.isOp("(") || structPat) && !variadic) {
        const ps = this.t.start;
        const pat = this.pattern(true);
        let type: A.TypeExpr | undefined;
        if (this.acceptOp(":")) type = this.type();
        if (this.isOp("=")) this.fail("a destructured parameter cannot have a default value", this.here(), { suggestion: "take the whole value as a named parameter with a default, then destructure it with `let (a, b) = value`" });
        out.push({ name: this.src.text.slice(ps, pat.span.end), js: `$arg${out.length}`, type, pat, span: this.span(ps) });
      } else {
      const n = this.ident("as a parameter name");
      let type: A.TypeExpr | undefined, def: A.Expr | undefined;
      if (this.acceptOp(":")) type = this.type();
      if (this.acceptOp("=")) def = this.expr();
      out.push({ name: n.v, type, default: def, variadic, span: this.span(n.start) });
      }
      this.skipNl();
      if (!this.acceptOp(",")) break;
      this.skipNl();
    }
    this.expectOp(")", "to close the parameter list", o);
    return out;
  }

  fnDecl(mods: ReturnType<Parser["modifiers"]>): A.FnDecl {
    const start = this.t.start;
    this.next(); // fn
    const name = this.ident("after `fn`");
    return this.fnRest(name.v, start, mods);
  }

  fnRest(name: string, start: number, mods: ReturnType<Parser["modifiers"]>, extra: Partial<A.FnDecl> = {}): A.FnDecl {
    const typeParams = this.typeParams();
    const params = this.params();
    let ret: A.TypeExpr | undefined;
    if (this.acceptOp("->")) ret = this.type();
    let body: A.Block | A.Expr | undefined;
    if (this.isOp("{")) body = this.block();
    else if (this.isOp("=>")) { this.next(); this.skipNl(); body = this.expr(); }
    const fn: A.FnDecl = { name, typeParams, params, ret, body, async: mods.async, gen: mods.gen, pub: mods.pub, span: this.span(start), static: mods.static, override: mods.override, vis: mods.vis, extern: mods.extern, ...extra };
    if (!body && !mods.extern && !extra.accessor && !(extra as any).sigOnly) {
      this.fail(`function \`${name}\` has no body`, this.span(start, this.toks[this.i - 1].end), { why: "a function needs `{ ... }` or `=> expr`", suggestion: `write \`fn ${name}(...) { ... }\`` });
    }
    return fn;
  }

  classDecl(mods: ReturnType<Parser["modifiers"]>): A.Decl {
    const isStruct = this.next().v === "struct";
    const name = this.ident(`after \`${isStruct ? "struct" : "class"}\``);
    const typeParams = this.typeParams();
    if (this.isOp("(")) this.fail("`(Base)` inheritance is Python — Mycel writes `class Foo: Bar { ... }`", this.here(), { code: "E0101", suggestion: "write `: Bar` instead of `(Bar)`" });
    if (this.t.k === "id" && (this.t.v === "extends" || this.t.v === "implements")) this.fail(`\`${this.t.v}\` is Java/TypeScript — Mycel writes \`class Name: Base, Interface { ... }\``, this.here(), { code: "E0101", suggestion: "put a `:` after the name, then the base class and interfaces" });
    let base: A.TypeExpr | undefined;
    const ifaces: A.TypeExpr[] = [];
    if (this.acceptOp(":")) {
      if (this.t.k === "nl" || this.isOp("{")) {
        this.fail("a `:` block is Python — Mycel classes use `{ ... }` (e.g. `class Foo { ... }`)", this.here(), {
          why: "in Mycel, a colon after a class name is for inheritance (`class Sub: Base`)",
          suggestion: "replace `:` with `{ ... }`"
        });
      }
      const first = this.type();
      ifaces.push(first);
      while (this.acceptOp(",")) ifaces.push(this.type());
    }
    const o = this.expectOp("{", `to start the body of ${isStruct ? "struct" : "class"} ${name.v}`);
    const fields: A.FieldDecl[] = [], methods: A.FnDecl[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", `to close ${name.v}`, o);
      this.member(fields, methods, mods.extern);
      this.skipNl();
    }
    this.next();
    // The first listed supertype that is a class is the base class; the checker decides, so keep all in ifaces
    // and move the first into `base` only if it was the sole syntactic candidate for inheritance.
    return { k: "class", name: name.v, typeParams, base, ifaces, fields, methods, struct: isStruct, extern: mods.extern } as any;
  }

  member(fields: A.FieldDecl[], methods: A.FnDecl[], extern: boolean) {
    const start = this.t.start;
    const m = this.modifiers();
    const vis: A.Visibility = m.vis ?? "public";
    const t = this.t;
    if (this.isKw("var") || this.isKw("let")) {
      const kw = this.next();
      const mutable = kw.v === "var";
      // `let x: Int, y: Int` declares several fields with one keyword
      for (;;) {
        const n = this.ident("as a field name");
        let type: A.TypeExpr | undefined, init: A.Expr | undefined;
        if (this.acceptOp(":")) type = this.type();
        if (this.acceptOp("=")) init = this.expr();
        if (!type && !init) this.fail(`field \`${n.v}\` needs a type or an initial value`, this.span(n.start), { suggestion: `write \`${kw.v} ${n.v}: Int\` or \`${kw.v} ${n.v} = 0\`` });
        fields.push({ name: n.v, type, init, mutable, static: m.static, vis, span: this.span(start) });
        if (this.isOp(",") && this.peek().k === "id") { this.next(); continue; }
        break;
      }
      this.endStmt("field");
      return;
    }
    if (this.isKw("fn")) {
      this.next();
      const n = this.ident("after `fn`");
      methods.push(this.fnRest(n.v, start, { ...m, extern: extern || m.extern }, { vis }));
      return;
    }
    if (this.isKw("init")) {
      this.next();
      methods.push(this.fnRest("init", start, { ...m, extern: extern || m.extern }, { vis, isInit: true }));
      return;
    }
    if (this.isKw("operator")) {
      this.next();
      const op = this.operatorName();
      methods.push(this.fnRest(op, start, { ...m, extern: extern || m.extern }, { vis, operator: op }));
      return;
    }
    if (this.t.k === "id" && (this.t.v === "get" || this.t.v === "set") && this.peek().k === "id") {
      const acc = this.next().v as "get" | "set";
      const n = this.ident("as the property name");
      let type: A.TypeExpr | undefined, params: A.Param[] = [];
      if (acc === "set") params = this.params();
      else if (this.acceptOp(":")) type = this.type();
      const body = extern ? undefined : this.isOp("=>") ? (this.next(), this.skipNl(), this.expr()) : this.block();
      methods.push({ name: n.v, typeParams: [], params, ret: acc === "get" ? type : undefined, body, async: false, gen: false, pub: false, span: this.span(start), static: m.static, vis, accessor: acc, extern: extern || m.extern } as A.FnDecl);
      return;
    }
    this.fail(`expected a member (var, let, fn, init, get, set, operator), found ${this.describe(t)}`, this.here(), { why: "class and struct bodies hold fields and methods only", suggestion: "declare a field with `var name: Type` or a method with `fn name() { ... }`" });
  }

  interfaceDecl(): any {
    this.next();
    const name = this.ident("after `interface`");
    const typeParams = this.typeParams();
    const ext: A.TypeExpr[] = [];
    if (this.acceptOp(":")) { ext.push(this.type()); while (this.acceptOp(",")) ext.push(this.type()); }
    const o = this.expectOp("{", `to start interface ${name.v}`);
    const methods: A.FnDecl[] = [], getters: { name: string; type: A.TypeExpr; span: Span }[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", `to close interface ${name.v}`, o);
      const start = this.t.start;
      const m = this.modifiers();
      if (this.t.k === "id" && this.t.v === "get" && this.peek().k === "id") {
        this.next();
        const n = this.ident("as the property name");
        this.expectOp(":", "and the property type");
        getters.push({ name: n.v, type: this.type(), span: this.span(start) });
      } else if (this.isKw("fn")) {
        this.next();
        const n = this.ident("after `fn`");
        methods.push(this.fnRest(n.v, start, m, { sigOnly: true } as any));
      } else this.fail(`expected \`fn\` or \`get\` in interface ${name.v}, found ${this.describe(this.t)}`);
      this.endStmt("interface member");
      this.skipNl();
    }
    this.next();
    return { k: "interface", name: name.v, typeParams, extends: ext, methods, getters };
  }

  enumDecl(): any {
    this.next();
    const name = this.ident("after `enum`");
    const typeParams = this.typeParams();
    const ifaces: A.TypeExpr[] = [];
    if (this.acceptOp(":")) { ifaces.push(this.type()); while (this.acceptOp(",")) ifaces.push(this.type()); }
    const o = this.expectOp("{", `to start enum ${name.v}`);
    const variants: any[] = [], methods: A.FnDecl[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", `to close enum ${name.v}`, o);
      const start = this.t.start;
      if (this.isKw("fn") || this.isKw("pub") || this.isKw("static") || this.isKw("private") || this.isKw("async") || this.isKw("operator") || (this.t.k === "id" && (this.t.v === "get" || this.t.v === "set") && this.peek().k === "id")) {
        const fs: A.FieldDecl[] = [];
        this.member(fs, methods, false);
      } else {
        const vn = this.ident("as a variant name");
        if (!/^[A-Z]/.test(vn.v)) this.fail(`enum variant \`${vn.v}\` must start with an uppercase letter`, this.span(vn.start), { why: "lowercase names in patterns are variable bindings, so variants are capitalized to avoid ambiguity", suggestion: `rename it to \`${vn.v[0].toUpperCase()}${vn.v.slice(1)}\`` });
        const fields: { name?: string; type: A.TypeExpr }[] = [];
        let value: A.Expr | undefined;
        if (this.isOp("(") && !this.t.sp) {
          const op = this.next();
          this.skipNl();
          while (!this.isOp(")")) {
            if (this.t.k === "id" && this.isOp(":", this.peek())) { const fnm = this.next().v; this.next(); fields.push({ name: fnm, type: this.type() }); }
            else fields.push({ type: this.type() });
            this.skipNl();
            if (!this.acceptOp(",")) break;
            this.skipNl();
          }
          this.expectOp(")", "to close the variant fields", op);
        }
        if (this.isOp("=")) this.fail(`enum variant ${vn.v} cannot have a raw value`, this.here(), { why: "enum variants carry payloads, not raw values", suggestion: "add a property: `get code: Int { return match self { .A => 1, .B => 2 } }`" });
        variants.push({ name: vn.v, fields, value, span: this.span(start) });
        if (!this.acceptOp(",")) { if (!this.isOp("}")) this.endStmt("enum variant"); }
      }
      this.skipNl();
    }
    this.next();
    return { k: "enum", name: name.v, typeParams, variants, methods, ifaces };
  }

  aliasDecl(): any {
    this.next();
    const name = this.ident("after `type`");
    const typeParams = this.typeParams();
    this.expectOp("=", "in the type alias");
    const type = this.type();
    this.endStmt("type alias");
    return { k: "alias", name: name.v, typeParams, type };
  }

  extendDecl(): any {
    this.next();
    const typeParams = this.typeParams();
    const target = this.type();
    const ifaces: A.TypeExpr[] = [];
    if (this.acceptOp(":")) { ifaces.push(this.type()); while (this.acceptOp(",")) ifaces.push(this.type()); }
    const o = this.expectOp("{", "to start the extension body");
    const methods: A.FnDecl[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", "to close the extension", o);
      const start = this.t.start;
      const m = this.modifiers();
      if (this.isKw("operator")) { this.next(); const op = this.operatorName(); methods.push(this.fnRest(op, start, m, { operator: op })); }
      else {
        if (!this.isKw("fn")) this.fail(`expected \`fn\` in an extension, found ${this.describe(this.t)}`, this.here(), { why: "extensions add methods; they cannot add stored fields", suggestion: "declare a method with `fn name() { ... }`" });
        this.next();
        const n = this.ident("after `fn`");
        methods.push(this.fnRest(n.v, start, m));
      }
      this.skipNl();
    }
    this.next();
    return { k: "extend", target, typeParams, ifaces, methods };
  }

  // ---------- types ----------
  type(): A.TypeExpr {
    if (this.isOp("&") || this.isOp("*")) this.fail(`\`${this.t.v}\` types are Rust/Go/C — Mycel has no references or pointers: values are passed as they are (text is \`String\`)`, this.here(), { code: "E0101", suggestion: "write the plain type, e.g. `String`" });
    let ty = this.typeAtom();
    if (this.isOp("[") && !this.t.sp && this.isOp("]", this.peek())) this.fail(`\`T[]\` is TypeScript/Java — Mycel writes a list type as \`[T]\``, this.here(), { code: "E0101", suggestion: "e.g. `let xs: [Int] = []`" });
    while (this.isOp("?") && !this.t.sp) { this.next(); ty = { k: "optional", inner: ty, span: this.span(ty.span.start) }; }
    return ty;
  }
  typeAtom(): A.TypeExpr {
    const t = this.t, start = t.start;
    if (this.isOp("[")) {
      const o = this.next(); const elem = this.type();
      this.expectOp("]", "to close the array type", o);
      return { k: "array", elem, span: this.span(start) };
    }
    if (this.isOp("{")) {
      const o = this.next(); const key = this.type();
      this.expectOp(":", "between the key and value types of a map type");
      const val = this.type();
      this.expectOp("}", "to close the map type", o);
      return { k: "map", key, val, span: this.span(start) };
    }
    if (this.isOp("(")) {
      const o = this.next();
      const elems: A.TypeExpr[] = [];
      while (!this.isOp(")")) { elems.push(this.type()); if (!this.acceptOp(",")) break; }
      this.expectOp(")", "to close the type", o);
      if (this.acceptOp("->")) { const ret = this.type(); return { k: "fn", params: elems, ret, span: this.span(start) }; }
      if (elems.length === 1) return elems[0];
      return { k: "tuple", elems, span: this.span(start) };
    }
    if (t.k === "id" || (t.k === "kw" && t.v === "self")) {
      this.next();
      const path = [t.v];
      while (this.isOp(".") && this.peek().k === "id") { this.next(); path.push(this.next().v); }
      let args: A.TypeExpr[] = [];
      if (this.isOp("<") && !this.t.sp) {
        const o = this.next();
        for (;;) { args.push(this.type()); if (!this.acceptOp(",")) break; }
        this.expectOp(">", "to close the type arguments", o);
      }
      return { k: "named", name: path[path.length - 1], path, args, span: this.span(start) };
    }
    this.fail(`expected a type, found ${this.describe(t)}`, this.here(), { why: "types look like Int, String, [Int], {String: Int}, (Int, Int), Int?, (Int) -> Bool or Name<T>", suggestion: "write a type name here" });
  }

  // ---------- statements ----------
  block(): A.Block {
    const o = this.expectOp("{", "to start a block");
    const stmts: A.Stmt[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", "to close the block", o);
      stmts.push(this.stmt());
      this.endStmt();
      this.skipNl();
    }
    const c = this.next();
    return { k: "block", stmts, span: this.span(o.start, c.end) };
  }

  stmt(): A.Stmt {
    // `outer: for ...` / `outer: while ...` (Go, Java, Swift): a label that `break outer` / `continue outer` can name
    if (this.t.k === "id" && this.isOp(":", this.peek()) && this.toks[this.i + 2]?.k === "kw" && ["for", "while"].includes(this.toks[this.i + 2].v)) {
      const lt = this.next(); this.next();
      const loop = this.stmt() as any;
      loop.label = lt.v; loop.labelSpan = this.span(lt.start, lt.end); loop.span = this.span(lt.start, loop.span.end);
      return loop;
    }
    this.habitWord();
    const start = this.t.start;
    const t = this.t;
    const mk = <T extends object>(s: T): A.Stmt => ({ ...(s as any), span: this.span(start) });
    if (t.k === "kw") {
      switch (t.v) {
        case "let": case "var": return this.letStmt();
        case "if": return this.ifStmt();
        case "while": { this.next(); const cond = this.cond(); return mk({ k: "while", cond, body: this.block() }); }
        case "for": {
          this.next();
          if (this.isOp("(")) { // C/Java/JS habit: for (init; cond; step)
            let d = 0;
            for (let j = this.i; j < this.toks.length; j++) {
              const x = this.toks[j];
              if (x.k === "nl" || x.k === "eof") break;
              if (x.k === "op" && x.v === "(") d++; else if (x.k === "op" && x.v === ")") { d--; if (d === 0) break; }
              else if (x.k === "op" && x.v === ";" && d === 1) this.fail("`for (init; test; step)` is C/Java/JavaScript — Mycel writes `for i in 0..n { ... }`", this.span(this.toks[this.i].start, x.end), { code: "E0101", suggestion: "`for i in 0..10 { }` counts 0 to 9; `for x in items { }` walks a list" });
            }
          }
          let pat = this.pattern();
          let bare = false;
          if (this.isOp(",")) { // Python habit: for i, x in items
            const elems = [pat];
            while (this.acceptOp(",")) elems.push(this.pattern());
            pat = { k: "tuple", elems, span: this.span(elems[0].span.start) } as A.Pattern; bare = true;
          }
          if (!this.acceptKw("in")) this.fail(`expected \`in\` after the loop variable, found ${this.describe(this.t)}`, this.here(), { suggestion: "write `for item in collection { ... }`" });
          const iter = this.expr(true);
          return mk({ k: "for", pat, iter, body: this.block(), bare });
        }
        case "match": { const e = this.matchExpr(); return mk({ k: "match", subject: (e as any).subject, arms: (e as any).arms }); }
        case "return": {
          this.next();
          let value: A.Expr | undefined;
          if (this.t.k !== "nl" && !this.isOp("}") && !this.isOp(";") && this.t.k !== "eof") value = this.expr();
          return mk({ k: "return", value });
        }
        case "break": case "continue": { // `break outer` names a labeled loop (same line only)
          this.next();
          const label = this.t.k === "id" ? this.next().v : undefined;
          return mk({ k: t.v, label });
        }
        case "throw": this.next(); return mk({ k: "throw", value: this.expr() });
        case "try": if (this.isOp("{", this.peek())) return this.tryStmt(); break;
        case "fn": case "async": case "gen": {
          if (t.v === "fn" || this.peek().k === "kw") {
            const m = this.modifiers();
            return mk({ k: "fn", decl: this.fnDecl(m) });
          }
          break;
        }
      }
    }
    if (this.isOp("{")) { const b = this.block(); return mk({ k: "block", stmts: b.stmts }); }
    let expr: A.Expr = this.expr();
    // `a, b = b, a` / `x, y = 1, 2` (Python, Go): a comma list on the left of `=` is a tuple target, and the right side
    // may be a comma list too.
    if (this.isOp(",") && expr.k !== "assign") {
      const targets: A.Expr[] = [expr];
      while (this.acceptOp(",")) targets.push(this.ternary());
      const op = this.t;
      if (!(op.k === "op" && op.v === "=")) this.fail(`unexpected \`,\` after the statement`, targets[1].span, { why: "a comma list at the start of a line is the left side of an assignment", suggestion: "write `a, b = 1, 2`, or wrap a tuple in parentheses `(a, b)`" });
      this.next(); this.skipNl();
      const vals = [this.ternary()];
      while (this.acceptOp(",")) vals.push(this.ternary());
      const tsp = this.span(targets[0].span.start, targets[targets.length - 1].span.end);
      const value: A.Expr = vals.length === 1 ? vals[0] : { k: "tuple", elems: vals, span: this.span(vals[0].span.start) } as A.Expr;
      expr = { k: "assign", op: "=", target: { k: "tuple", elems: targets, span: tsp } as A.Expr, value, span: this.span(start) } as A.Expr;
    }
    return mk({ k: "expr", expr });
  }

  letStmt(): Extract<A.Stmt, { k: "let" }> {
    const start = this.t.start;
    const mutable = this.next().v === "var";
    if (this.t.k === "id" && this.t.v === "mut" && this.peek().k === "id") this.fail("`let mut` is Rust — Mycel writes `var`", this.here(), { why: "`let` is fixed once set; `var` can change", suggestion: `write \`var ${this.peek().v} = ...\``, code: "E0101" });
    const pat = this.pattern(true);
    if (this.isOp(",")) {
      this.fail("tuple unpacking with `let` requires parentheses: `let (a, b) = ...`", this.here(), {
        why: "tuple patterns in let declarations are wrapped in parentheses", suggestion: "write `let (...) = ...` (or `a, b = ...` to assign to existing variables)", code: "E0101"
      });
    }
    let type: A.TypeExpr | undefined, init: A.Expr | undefined;
    if (this.t.k === "id" && !this.t.sp === false && this.toks[this.i - 1].k === "id") this.fail(`\`${mutable ? "var" : "let"} name Type\` is Go — in Mycel the type follows a colon: \`${mutable ? "var" : "let"} ${this.toks[this.i - 1].v}: ${this.t.v} = ...\``, this.here(), { code: "E0101", suggestion: "write `name: Type`" });
    if (this.acceptOp(":")) type = this.type();
    if (this.acceptOp("=")) { this.skipNl(); init = this.expr(); }
    else if (!type) this.fail(`\`${mutable ? "var" : "let"}\` needs a type or an initial value`, this.span(start), { why: "the compiler has nothing to infer the type from", suggestion: `write \`${mutable ? "var" : "let"} name = value\` or \`${mutable ? "var" : "let"} name: Type\`` });
    return { k: "let", pat, mutable, type, init, span: this.span(start) };
  }

  cond(): A.Cond {
    if (this.acceptKw("let")) {
      const pat = this.pattern();
      // Swift 5.7's `if let x { }` shorthand: Mycel keeps one spelling, the one that names where the value comes from
      if (pat.k === "bind" && this.isOp("{")) this.fail(`\`if let ${pat.name} { }\` is Swift shorthand — Mycel names the value: \`if let ${pat.name} = ${pat.name} { ... }\``, this.here(), { code: "E0101", why: "`if let name = value` says what is unwrapped; there is one way to write it", suggestion: `write \`if let ${pat.name} = ${pat.name} {\`` });
      this.expectOp("=", "after the pattern in `if let`");
      return { pat, expr: this.expr(true) };
    }
    return { expr: this.expr(true) };
  }

  ifStmt(): A.Stmt {
    const start = this.t.start;
    this.next();
    const cond = this.cond();
    const then = this.block();
    let els: A.Block | A.Stmt | undefined;
    // `else` may sit on the next line after `}`
    let save = this.i;
    if (this.t.k === "nl") this.next();
    if (this.isKw("else")) {
      this.next();
      if (this.isKw("if")) els = this.ifStmt(); else els = this.block();
    } else if (this.t.k === "id" && ["elif", "elsif", "elseif"].includes(this.t.v)) {
      this.fail(STATEMENT_WORDS[this.t.v], this.here(), { why: "this word comes from another language", suggestion: "write `else if`", code: "E0101" });
    } else this.i = save;
    return { k: "if", cond, then, else: els, span: this.span(start) };
  }

  tryStmt(): A.Stmt {
    const start = this.t.start;
    this.next();
    const body = this.block();
    const catches: any[] = [];
    let fin: A.Block | undefined;
    for (;;) {
      const save = this.i;
      if (this.t.k === "nl") this.next();
      if (this.isKw("catch")) {
        const cs = this.next().start;
        let name: string | undefined, type: A.TypeExpr | undefined;
        if (this.t.k === "id") { name = this.next().v; if (this.acceptOp(":")) type = this.type(); }
        catches.push({ name, type, body: this.block(), span: this.span(cs) });
      } else if (this.isKw("finally")) { this.next(); fin = this.block(); break; }
      else if (this.t.k === "id" && ["except", "rescue"].includes(this.t.v)) this.fail(`\`${this.t.v}\` is ${this.t.v === "except" ? "Python" : "Ruby"} — Mycel writes \`catch e { ... }\``, this.here(), { code: "E0101" });
      else { this.i = save; break; }
    }
    if (!catches.length && !fin) this.fail("`try` block needs a `catch` or `finally`", this.span(start), { suggestion: "add `catch e { ... }` after the block, or use `try expr` to turn a throwing call into a Result" });
    return { k: "try", body, catches, finally: fin, span: this.span(start) };
  }

  // ---------- patterns ----------
  pattern(decl = false): A.Pattern {
    const first = this.patternAtom(decl);
    if (this.isOp("|") && !decl) {
      const alts = [first];
      while (this.acceptOp("|")) alts.push(this.patternAtom(decl));
      return { k: "or", alts, span: this.span(first.span.start) };
    }
    return first;
  }

  patternAtom(decl: boolean): A.Pattern {
    const t = this.t, start = t.start;
    const mk = <T extends object>(p: T): A.Pattern => ({ ...(p as any), span: this.span(start) });
    if (t.k === "id" && t.v === "_") { this.next(); return mk({ k: "wild" }); }
    if (t.k === "kw" && t.v === "is") { this.next(); const type = this.type(); return mk({ k: "is", type }); }
    if (t.k === "op" && t.v === "(") {
      const o = this.next(); const elems: A.Pattern[] = [];
      while (!this.isOp(")")) { elems.push(this.pattern(decl)); if (!this.acceptOp(",")) break; }
      this.expectOp(")", "to close the tuple pattern", o);
      return elems.length === 1 ? elems[0] : mk({ k: "tuple", elems });
    }
    if (t.k === "op" && t.v === "[") {
      const o = this.next(); const elems: A.Pattern[] = []; let rest: { name?: string } | undefined; let restIndex = -1;
      while (!this.isOp("]")) {
        if (this.acceptOp("..")) {
          if (rest) this.fail("a list pattern can have only one `..rest`", this.span(start));
          rest = {}; restIndex = elems.length;
          if (this.t.k === "id") rest.name = this.next().v;
        } else elems.push(this.pattern(decl));
        if (!this.acceptOp(",")) break;
      }
      this.expectOp("]", "to close the list pattern", o);
      return mk({ k: "array", elems, rest, restIndex });
    }
    if (t.k === "op" && t.v === ".") { // .Variant(...)
      this.next(); const n = this.ident("after `.` in a pattern");
      return this.variantRest(start, [n.v]);
    }
    if (t.k === "int" || t.k === "float" || t.k === "str" || t.k === "char" || (t.k === "kw" && (t.v === "true" || t.v === "false" || t.v === "nil")) || (t.k === "op" && t.v === "-")) {
      const lo = this.unaryLiteral();
      if (this.isOp("..") || this.isOp("..=")) {
        const inclusive = this.next().v === "..=";
        const hasHi = this.t.k === "int" || this.t.k === "float" || this.t.k === "char" || this.isOp("-");
        return mk({ k: "range", lo, hi: hasHi ? this.unaryLiteral() : undefined, inclusive });
      }
      return mk({ k: "lit", value: lo });
    }
    if (t.k === "op" && (t.v === ".." || t.v === "..=")) {
      this.next(); const hi = this.unaryLiteral();
      return mk({ k: "range", hi, inclusive: t.v === "..=" });
    }
    if (t.k === "id" || (t.k === "kw" && t.v === "self")) {
      this.next();
      const path = [t.v];
      while (this.isOp(".") && this.peek().k === "id") { this.next(); path.push(this.next().v); }
      if (this.isOp("(") && !this.t.sp) return this.variantRest(start, path);
      if (this.isOp("{") && !this.t.sp && /^[A-Z]/.test(path[path.length - 1])) return this.objectRest(start, path);
      if (this.isOp("@")) { this.next(); const sub = this.patternAtom(decl); return mk({ k: "bind", name: t.v, mutable: false, sub }); }
      if (path.length > 1 || (/^[A-Z]/.test(t.v) && !decl)) return mk({ k: "variant", path, args: [] }); // unit variant / constant (a `let PI = ...` declaration still binds)
      return mk({ k: "bind", name: t.v, mutable: false });
    }
    this.fail(`expected a pattern, found ${this.describe(t)}`, this.here(), { why: "patterns are names, literals, _, (a, b), [a, ..rest], Variant(x), Type{field} or `is Type`", suggestion: "bind the value to a name, e.g. `x`, or use `_` to ignore it" });
  }
  unaryLiteral(): A.Expr {
    const t = this.t, start = t.start;
    if (this.isOp("-")) { this.next(); const o = this.unaryLiteral(); return { k: "unary", op: "-", operand: o, span: this.span(start) }; }
    return this.primary();
  }
  variantRest(start: number, path: string[]): A.Pattern {
    if (!(this.isOp("(") && !this.t.sp)) return { k: "variant", path, args: [], span: this.span(start) };
    const o = this.expectOp("(", "to start the variant pattern");
    const args: A.Pattern[] = []; const names: (string | undefined)[] = [];
    this.skipNl();
    while (!this.isOp(")")) {
      if (this.t.k === "id" && this.isOp(":", this.peek())) { names.push(this.next().v); this.next(); } else names.push(undefined);
      args.push(this.pattern());
      this.skipNl();
      if (!this.acceptOp(",")) break;
      this.skipNl();
    }
    this.expectOp(")", "to close the variant pattern", o);
    return { k: "variant", path, args, names, span: this.span(start) };
  }
  objectRest(start: number, path: string[]): A.Pattern {
    const o = this.next(); const fields: { name: string; pat: A.Pattern }[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      const n = this.ident("as a field name");
      let pat: A.Pattern;
      if (this.acceptOp(":")) pat = this.pattern(); else pat = { k: "bind", name: n.v, mutable: false, span: this.span(n.start) };
      fields.push({ name: n.v, pat });
      this.skipNl();
      if (!this.acceptOp(",")) break;
      this.skipNl();
    }
    this.expectOp("}", "to close the object pattern", o);
    return { k: "object", type: path, fields, span: this.span(start) };
  }

  // ---------- expressions ----------
  /** `noBrace`: stop before `{` ending a condition (call-less struct literals don't exist, so `{` never continues an expression). */
  expr(cond = false): A.Expr {
    const saved = this.inCond; this.inCond = cond;
    try { return this.assign(); } finally { this.inCond = saved; }
  }
  /** True while parsing the head of `if`/`while`/`for`/`match` outside any bracket: there a `{` starts the body unless it is
   *  a closure that is itself followed by the body's `{`. */
  inCond = false;

  assign(): A.Expr {
    const left = this.ternary();
    if (this.t.k === "op" && ASSIGN.has(this.t.v)) {
      const op = this.next().v;
      this.skipNl();
      const value = this.assign();
      if (!["id", "member", "index", "self"].includes(left.k) && left.k !== "tuple") this.fail("cannot assign to this expression", left.span, { why: "only variables, fields, indexed elements and tuple/destructuring targets can be assigned", suggestion: "assign to a variable or field instead" });
      return { k: "assign", op, target: left, value, span: this.span(left.span.start) };
    }
    return left;
  }

  ternary(): A.Expr {
    const cond = this.binary(1);
    // Python's `a if c else b` (the value comes first); only on the same line, where nothing else can follow.
    if (this.isKw("if")) {
      const value = cond;
      this.next();
      const test = this.binary(1);
      if (!this.acceptKw("else")) this.fail("`a if cond` needs an `else`", this.here(), { why: "Python-style conditional values are `a if cond else b`", suggestion: "add `else <value>`" });
      const els = this.ternary();
      return { k: "ternary", cond: test, then: value, else: els, span: this.span(value.span.start) };
    }
    if (this.isOp("?") && this.t.sp) {
      this.next(); this.skipNl();
      const then = this.ternary();
      this.skipNl();
      this.expectOp(":", "in the `cond ? a : b` expression");
      this.skipNl();
      const els = this.ternary();
      return { k: "ternary", cond, then, else: els, span: this.span(cond.span.start) };
    }
    return cond;
  }

  binary(minPrec: number): A.Expr {
    let left = this.unary();
    for (;;) {
      const t = this.t;
      if (t.k === "kw" && (t.v === "is" || t.v === "as") && minPrec <= 7) {
        this.next();
        if (t.v === "is") {
          if (this.isOp("!")) {
            const notSpan = this.here();
            this.next();
            if ((this.t.k === "id" || this.t.k === "kw") && (this.t.v === "None" || this.t.v === "nil" || this.t.v === "null")) {
              const val = this.t.v;
              this.next();
              this.fail("`is not` is Python — Mycel writes `!=` (e.g. `x != nil`)", notSpan, { suggestion: `write \`!= nil\` instead of \`is not ${val}\`` });
            } else if ((this.t.k === "id" || this.t.k === "kw") && (this.t.v === "true" || this.t.v === "false" || this.t.v === "True" || this.t.v === "False")) {
              const val = this.t.v;
              this.next();
              this.fail(`\`is not\` is Python — Mycel writes \`!= ${val.toLowerCase()}\``, notSpan, { suggestion: `write \`!= ${val.toLowerCase()}\`` });
            } else {
              this.fail("`is not` is Python — Mycel writes `!=` (or `!(x is Type)`)", notSpan, { suggestion: "write `!=` or wrap in `!(...)`" });
            }
          }
          if ((this.t.k === "id" || this.t.k === "kw") && (this.t.v === "None" || this.t.v === "nil" || this.t.v === "null")) {
            const valSpan = this.here();
            const name = this.t.v;
            this.next();
            this.fail(`\`is ${name}\` — Mycel writes \`== nil\``, valSpan, { suggestion: "write `== nil`" });
          }
          if ((this.t.k === "id" || this.t.k === "kw") && (this.t.v === "true" || this.t.v === "false" || this.t.v === "True" || this.t.v === "False")) {
            const valSpan = this.here();
            const name = this.t.v;
            this.next();
            this.fail(`\`is ${name}\` is Python — Mycel writes \`== ${name.toLowerCase()}\` (or check the truthiness directly: \`if x { ... }\`)`, valSpan, {
              suggestion: `write \`== ${name.toLowerCase()}\``
            });
          }
          const type = this.type(); left = { k: "is", operand: left, type, span: this.span(left.span.start) };
        }
        else { const safe = this.isOp("?") && !this.t.sp ? (this.next(), true) : false; const type = this.type(); left = { k: "cast", operand: left, type, safe, span: this.span(left.span.start) }; }
        continue;
      }
      // `x in c` / `x not in c` (Python, Kotlin `in`/`!in`): membership, i.e. `c.contains(x)`; comparison precedence
      const notIn = t.k === "op" && t.v === "!" && this.peek().k === "kw" && this.peek().v === "in";
      if (((t.k === "kw" && t.v === "in") || notIn) && minPrec <= 7) {
        if (notIn) this.next();
        this.next(); this.skipNl();
        const coll = this.binary(8);
        const sp = this.span(left.span.start);
        const call: A.Expr = { k: "call", callee: { k: "member", obj: coll, name: "contains", span: coll.span }, args: [{ value: left, span: left.span }], span: sp };
        left = notIn ? { k: "unary", op: "!", operand: call, span: sp } as A.Expr : call;
        continue;
      }
      if (t.k !== "op") break;
      const info = BIN[t.v];
      if (!info || info[0] < minPrec) break;
      // `a | b` in expression position is bitwise-or; `..` with nothing after it is an open range
      this.next();
      if (t.v === "..") { /* fallthrough to normal range */ }
      const isRangeOp = t.v === ".." || t.v === "..=";
      if (isRangeOp && (this.t.k === "nl" || this.t.k === "eof" || this.isOp(";") || this.isOp(")") || this.isOp("]") || this.isOp("}") || this.isOp(","))) {
        left = { k: "range", lo: left, hi: undefined, inclusive: t.v === "..=", span: this.span(left.span.start) };
        continue;
      }
      this.skipNl();
      const right = this.binary(info[1] ? info[0] : info[0] + 1);
      if (t.v === "|>") left = { k: "pipe", left, right, span: this.span(left.span.start) };
      else if (t.v === ".." || t.v === "..=") left = { k: "range", lo: left, hi: right, inclusive: t.v === "..=", span: this.span(left.span.start) };
      else left = { k: "binary", op: t.v, left, right, span: this.span(left.span.start) };
    }
    return left;
  }

  unary(): A.Expr {
    const t = this.t, start = t.start;
    const mk = <T extends object>(e: T): A.Expr => ({ ...(e as any), span: this.span(start) });
    if (t.k === "op" && (t.v === "-" || t.v === "!" || t.v === "~")) { this.next(); return mk({ k: "unary", op: t.v, operand: this.unary() }); }
    if (t.k === "op" && (t.v === ".." || t.v === "..=")) { // open-start range  ..5
      this.next();
      if (this.t.k === "nl" || this.t.k === "eof" || this.isOp(";") || this.isOp(")") || this.isOp("]") || this.isOp("}") || this.isOp(",")) {
        return mk({ k: "range", hi: undefined, inclusive: t.v === "..=" });
      }
      const hi = this.binary(9);
      return mk({ k: "range", hi, inclusive: t.v === "..=" });
    }
    if (t.k === "kw") {
      if (t.v === "await") { this.next(); return mk({ k: "await", operand: this.unary() }); }
      if (t.v === "spawn") { this.next(); return mk({ k: "spawn", operand: this.unary() }); }
      if (t.v === "try" && !this.isOp("{", this.peek())) { this.next(); return mk({ k: "try", operand: this.unary() }); }
      if (t.v === "yield") {
        this.next();
        const delegate = this.isOp("*") ? (this.next(), true) : false;
        let operand: A.Expr | undefined;
        if (this.t.k !== "nl" && !this.isOp("}") && !this.isOp(")") && !this.isOp(";")) operand = this.expr();
        return mk({ k: "yield", operand, delegate });
      }
    }
    return this.postfix(this.primary());
  }

  args(): A.Arg[] {
    const o = this.expectOp("(", "to start the argument list");
    const out: A.Arg[] = [];
    this.skipNl();
    while (!this.isOp(")")) {
      const s = this.t.start;
      let name: string | undefined;
      if (this.t.k === "id" && this.isOp(":", this.peek()) && !this.isOp(":", this.peek(2))) { name = this.next().v; this.next(); }
      const value = this.expr();
      out.push({ name, value, span: this.span(s) });
      this.skipNl();
      if (!this.acceptOp(",")) break;
      this.skipNl();
    }
    this.expectOp(")", "to close the call", o);
    return out;
  }

  postfix(e: A.Expr): A.Expr {
    for (;;) {
      const t = this.t;
      const start = e.span.start;
      if (t.k !== "op") break;
      if (t.v === "(" && !t.sp) { e = { k: "call", callee: e, args: this.args(), span: this.span(start) }; continue; }
      if (t.v === "(" && t.sp && (e.k === "id" || e.k === "member")) { e = { k: "call", callee: e, args: this.args(), span: this.span(start) }; continue; }
      if (t.v === "[") {
        const o = this.next(); this.skipNl();
        const index = this.expr(); this.skipNl();
        this.expectOp("]", "to close the index", o);
        e = { k: "index", obj: e, index, span: this.span(start) }; continue;
      }
      if (t.v === "." || t.v === "?.") {
        const optional = t.v === "?.";
        this.next();
        if (optional && this.isOp("[")) { const o = this.next(); const index = this.expr(); this.expectOp("]", "to close the index", o); e = { k: "index", obj: e, index, optional: true, span: this.span(start) }; continue; }
        const nt = this.next();
        if (nt.k === "float") { // t.0.1 lexed as float "0.1"
          for (const part of nt.v.split(".")) e = { k: "member", obj: e, name: part, optional, span: this.span(start) };
          continue;
        }
        if (nt.k !== "id" && nt.k !== "kw" && nt.k !== "int") this.fail(`expected a member name after \`.\`, found ${this.describe(nt)}`, this.span(nt.start, nt.end), { suggestion: "write `value.name`" });
        // generic call: `x.map<Int>(...)`
        if (this.isOp("<") && !this.t.sp) { const ta = this.tryTypeArgs(); if (ta) { e = { k: "call", callee: { k: "member", obj: e, name: nt.v, optional, span: this.span(start) }, args: this.args(), typeArgs: ta, span: this.span(start) }; continue; } }
        e = { k: "member", obj: e, name: nt.v, optional, span: this.span(start) };
        continue;
      }
      if (t.v === "{" && t.sp && this.trailingClosureOk(e)) {
        const c = this.closure();
        e = e.k === "call" ? { ...e, args: [...e.args, { value: c, span: c.span }], span: this.span(start) } : { k: "call", callee: e, args: [{ value: c, span: c.span }], span: this.span(start) };
        continue;
      }
      if (t.v === "!" && !t.sp) { this.next(); e = { k: "force", operand: e, span: this.span(start) }; continue; }
      if (t.v === "?" && !t.sp) { this.next(); e = { k: "propagate", operand: e, span: this.span(start) }; continue; }
      break;
    }
    return e;
  }

  /** Speculatively parse `<T, U>` followed by `(`; restores position on failure. */
  tryTypeArgs(): A.TypeExpr[] | undefined {
    const save = this.i;
    try {
      this.next();
      const args: A.TypeExpr[] = [];
      for (;;) { args.push(this.type()); if (!this.acceptOp(",")) break; }
      if (!this.isOp(">")) throw new Error("no");
      this.next();
      if (this.isOp("(") && !this.t.sp) return args;
    } catch { /* not type arguments */ }
    this.i = save;
    return undefined;
  }

  strLiteralText(): string {
    const t = this.next();
    if (t.k !== "str") this.fail("expected a string literal", this.span(t.start, t.end));
    if (t.parts!.some((p) => "code" in p)) this.fail("a name here cannot contain `{...}` interpolation", this.span(t.start, t.end));
    return t.parts!.map((p) => ("text" in p ? p.text : "")).join("");
  }

  /** `for pat in iter` and `if cond` clauses of a comprehension (at least one `for` first). */
  compClauses(): A.CompClause[] {
    const out: A.CompClause[] = [];
    while (this.isKw("for") || (out.length && this.isKw("if"))) {
      const start = this.t.start;
      if (this.acceptKw("if")) { out.push({ k: "if", cond: this.binary(1), span: this.span(start) }); this.skipNl(); continue; }
      this.next(); // for
      let pat = this.pattern(true), bare = false;
      if (this.isOp(",")) { // Python: [k for k, v in pairs] — same meaning as `for i, x in items` (position + value on a list)
        const elems = [pat];
        while (this.acceptOp(",")) elems.push(this.pattern(true));
        pat = { k: "tuple", elems, span: this.span(elems[0].span.start) } as A.Pattern; bare = true;
      }
      if (!this.acceptKw("in")) this.fail(`expected \`in\` in the comprehension, found ${this.describe(this.t)}`, this.here(), { why: "each `for` clause names the item and then the collection", suggestion: "write `[x * 2 for x in items]`" });
      out.push({ k: "for", pat, iter: this.binary(1), span: this.span(start), bare });
      this.skipNl();
    }
    return out;
  }

  isLambdaAhead(): boolean {
    // at "(": find matching ")" and look for "=>" or "-> T =>"
    let d = 0, j = this.i;
    for (; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.k === "op") { if (t.v === "(" || t.v === "[" || t.v === "{") d++; else if (t.v === ")" || t.v === "]" || t.v === "}") { d--; if (d === 0) break; } }
      if (t.k === "eof") return false;
    }
    const n = this.toks[j + 1];
    if (!n) return false;
    if (this.isOp("=>", n)) return true;
    if (this.isOp("->", n)) {
      for (let k = j + 2; k < this.toks.length && k < j + 40; k++) { const q = this.toks[k]; if (this.isOp("=>", q)) return true; if (q.k === "nl" || this.isOp("{", q)) return false; }
    }
    return false;
  }

  ifBranch(): A.Expr {
    const o = this.expectOp("{", "to start the branch of an `if` used as a value");
    this.skipNl();
    const oneExpr = { why: "the branch's value is its single expression", suggestion: "move the statements into a function, or use an `if` statement and assign inside it" };
    if (this.t.k === "kw" && ["let", "var", "return", "for", "while", "fn", "throw", "break", "continue"].includes(this.t.v)) this.fail("an `if` used as a value holds one expression in each branch", this.here(), oneExpr);
    const e = this.expr();
    this.skipNl();
    if (!this.isOp("}")) this.fail("an `if` used as a value holds one expression in each branch", this.here(), oneExpr);
    this.expectOp("}", "to close the branch", o);
    return e;
  }

  /** Index of the `}` matching the `{` at `from`, or -1. */
  matchBrace(from: number): number {
    let d = 0;
    for (let j = from; j < this.toks.length; j++) {
      const k = this.toks[j];
      if (k.k === "eof") return -1;
      if (k.k === "op") { if ("([{".includes(k.v)) d++; else if (")]}".includes(k.v)) { d--; if (d === 0) return k.v === "}" ? j : -1; } }
    }
    return -1;
  }

  /** `{` in an expression position: a closure, or a map literal? A map is `{}` or has a `key: value` colon directly inside
   *  its braces (a `:` after a `?` belongs to a ternary). Everything else is a closure: `{ it > 5 }`, `{ x => x * 2 }`,
   *  `{ (a, b) => a + b }`, or several statements on separate lines / `let` / `return` first. */
  braceIsClosure(): boolean {
    const end = this.matchBrace(this.i);
    if (end < 0) return false;
    let a = this.i + 1;
    while (this.toks[a].k === "nl") a++;
    if (a >= end) return false; // `{}` is the empty map
    const first = this.toks[a];
    if (first.k === "kw" && ["let", "var", "return", "if", "for", "while", "fn", "throw", "break", "continue", "match", "try"].includes(first.v)) return true;
    if (first.k === "id" && this.isOp("=>", this.toks[a + 1])) return true;
    if (this.isOp("(", first)) {
      const save = this.i; this.i = a;
      try { if (this.isLambdaAhead()) return true; } finally { this.i = save; }
    }
    let d = 0, q = 0;
    for (let j = this.i + 1; j < end; j++) {
      const k = this.toks[j];
      if (k.k === "op") {
        if ("([{".includes(k.v)) d++;
        else if (")]}".includes(k.v)) d--;
        else if (d === 0 && k.v === "?" && k.sp) q++;
        else if (d === 0 && k.v === ":") { if (q > 0) q--; else return false; }
        else if (d === 0 && k.v === ";") return true;
      } else if (d === 0 && k.k === "nl") {
        const p = this.toks[j - 1], n = this.toks[j + 1];
        if (!(p.k === "op" && [",", ":", "{"].includes(p.v)) && !(n && n.k === "op" && ["}", ",", ":"].includes(n.v)) && j !== this.i + 1) return true;
      }
    }
    return true;
  }

  /** `f(x) { ... }`, `xs.map { ... }`: a closure after a call, member or lower-case name. In an `if`/`while`/`for`/`match`
   *  head the `{` is the body unless the closure is followed by the body's own `{` (`if xs.any { it > 0 } { ... }`). */
  trailingClosureOk(e: A.Expr): boolean {
    if (!(e.k === "call" || e.k === "member" || (e.k === "id" && /^[a-z_]/.test(e.name)))) return false;
    if (!this.braceIsClosure()) return false;
    if (!this.inCond) return true;
    const end = this.matchBrace(this.i);
    if (end < 0) return false;
    let j = end + 1; // skip `.member`, `?.member`, `(args)` chained after the closure, then expect the body's `{`
    for (;;) {
      const k = this.toks[j];
      if (k && k.k === "op" && (k.v === "." || k.v === "?.") && this.toks[j + 1] && (this.toks[j + 1].k === "id" || this.toks[j + 1].k === "kw")) { j += 2; continue; }
      if (k && k.k === "op" && k.v === "(" && !k.sp) { let d = 0; for (; j < this.toks.length; j++) { const q = this.toks[j]; if (q.k === "op") { if (q.v === "(") d++; else if (q.v === ")" && --d === 0) break; } } j++; continue; }
      return !!k && this.isOp("{", k);
    }
  }

  /** `{ it > 5 }`, `{ x => x * 2 }`, `{ (a, b) => a + b }`, `{ (x: Int) => x * 2 }`; `it` is the single argument when none is named. */
  closure(): A.Expr {
    const o = this.expectOp("{", "to start the closure");
    this.skipNl();
    let params: A.Param[] = [], explicit = false, ret: A.TypeExpr | undefined;
    if (this.t.k === "id" && this.isOp("=>", this.peek())) { const n = this.next(); params = [{ name: n.v, span: this.span(n.start) }]; explicit = true; this.next(); }
    else if (this.isOp("(") && this.isLambdaAhead()) {
      params = this.params(); explicit = true;
      if (this.acceptOp("->")) ret = this.type();
      this.expectOp("=>", "after the closure parameters");
    }
    const stmts: A.Stmt[] = [];
    this.skipNl();
    const saved = this.inCond; this.inCond = false;
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", "to close the closure", o);
      stmts.push(this.stmt());
      this.endStmt();
      this.skipNl();
    }
    this.inCond = saved;
    const c = this.next();
    const span = this.span(o.start, c.end);
    let body: A.Expr | A.Block;
    if (stmts.length === 1 && stmts[0].k === "expr") body = stmts[0].expr;
    else {
      const last = stmts[stmts.length - 1];
      if (last && last.k === "expr") stmts[stmts.length - 1] = { k: "return", value: last.expr, implicit: true, span: last.span } as A.Stmt;
      body = { k: "block", stmts, span };
    }
    return { k: "lambda", params, ret, body, brace: true, implicitIt: !explicit, span } as A.Expr;
  }

  lambda(isAsync: boolean): A.Expr {
    const start = this.t.start;
    let params: A.Param[];
    if (this.t.k === "id") { const n = this.next(); params = [{ name: n.v, span: this.span(n.start) }]; }
    else params = this.params();
    let ret: A.TypeExpr | undefined;
    if (this.acceptOp("->")) ret = this.type();
    this.expectOp("=>", "after the lambda parameters");
    this.skipNl();
    const body = this.isOp("{") ? this.block() : this.expr();
    return { k: "lambda", params, ret, body, async: isAsync, span: this.span(start) };
  }

  matchExpr(): A.Expr {
    const start = this.t.start;
    this.next();
    const subject = this.expr(true);
    const o = this.expectOp("{", "to start the match arms");
    const arms: A.MatchArm[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.t.k === "eof") this.expectOp("}", "to close the match", o);
      const as = this.t.start;
      const pat = this.pattern();
      let guard: A.Expr | undefined;
      if (this.acceptKw("if")) guard = this.expr();
      if (!this.isOp("=>")) this.fail(`expected \`=>\` after the match pattern, found ${this.describe(this.t)}`, this.here(), { why: "each arm is `pattern => result`", suggestion: "write `pattern => expression`" });
      this.next(); this.skipNl();
      const body = this.isOp("{") ? this.block() : this.stmtOrExpr();
      arms.push({ pat, guard, body, span: this.span(as) });
      if (!this.acceptOp(",")) { if (!this.isOp("}")) { if (this.t.k !== "nl") this.fail(`expected a new line or \`,\` between match arms, found ${this.describe(this.t)}`); } }
      this.skipNl();
    }
    this.next();
    if (!arms.length) this.fail("a match needs at least one arm", this.span(start), { suggestion: "add `_ => ...` as a catch-all arm" });
    return { k: "match", subject, arms, span: this.span(start) };
  }
  /** Arm bodies are expressions; statements like `return`/`throw`/`break` are allowed through a wrapping block. */
  stmtOrExpr(): A.Expr | A.Block {
    if (this.isKw("return") || this.isKw("throw") || this.isKw("break") || this.isKw("continue")) {
      const s = this.stmt();
      return { k: "block", stmts: [s], span: s.span };
    }
    return this.expr();
  }

  primary(): A.Expr {
    const t = this.t, start = t.start;
    const mk = <T extends object>(e: T): A.Expr => ({ ...(e as any), span: this.span(start) });
    switch (t.k) {
      case "int": this.next(); return mk({ k: "int", value: t.big! });
      case "float": this.next(); return mk({ k: "float", value: t.num! });
      case "char": this.next(); return mk({ k: "char", value: t.v });
      case "str": {
        this.next();
        const parts: (string | A.Expr)[] = [];
        for (const p of t.parts!) {
          if ("text" in p) parts.push(p.text);
          else {
            const sub = new Parser(this.src, lex(this.src, p.code.start, p.code.end));
            sub.skipNl();
            if (sub.t.k === "eof") this.fail("empty `{}` in f-string", this.span(p.code.start - 2, p.code.end + 1), { suggestion: "put an expression inside `{...}`, or write `{{` `}}` for literal braces" });
            const e = sub.expr();
            sub.skipNl();
            if ((sub.t.k as string) !== "eof") sub.fail(`unexpected ${sub.describe(sub.t)} inside \`{...}\``);
            if (p.spec !== undefined || p.debug !== undefined) {
              if (p.debug !== undefined) parts.push(p.debug);
              parts.push({ k: "fmtx", e, spec: p.spec ?? "", debug: p.debug !== undefined, span: e.span } as A.Expr);
            } else parts.push(e);
          }
        }
        return mk({ k: "str", parts });
      }
      case "id": {
        if (this.isOp("=>", this.peek())) return this.lambda(false);
        if (t.v === "new" && this.peek().k === "id") this.fail(`\`new\` is JavaScript/Java — Mycel writes \`${this.peek().v}(...)\` without \`new\``, this.here(), { code: "E0101", suggestion: "call the class like a function" });
        if (t.v === "lambda" && this.peek().k === "id") this.fail("`lambda` is Python — Mycel writes `x => x + 1`", this.here(), { code: "E0101", suggestion: "arrow functions: `x => x + 1`, `(a, b) => a + b`" });
        if (t.v === "typeof") this.fail("`typeof` is JavaScript — check types with `x is Type` (e.g. `x is Int` or `x is String`)", this.here(), { code: "E0101", suggestion: "use `x is Type` to check types" });
        this.next();
        if (this.isOp("<") && !this.t.sp) {
          const ta = this.tryTypeArgs();
          if (ta) return { k: "call", callee: { k: "id", name: t.v, span: this.span(start, t.end) }, args: this.args(), typeArgs: ta, span: this.span(start) };
        }
        return mk({ k: "id", name: t.v });
      }
      case "kw":
        switch (t.v) {
          case "true": case "false": this.next(); return mk({ k: "bool", value: t.v === "true" });
          case "nil": this.next(); return mk({ k: "nil" });
          case "self": this.next(); return mk({ k: "self" });
          case "super": this.next(); return mk({ k: "super" });
          case "init": this.next(); return mk({ k: "id", name: "init" });
          case "match": return this.matchExpr();
          case "async": if (this.isOp("(", this.peek()) || this.peek().k === "id") { this.next(); return this.lambda(true); } break;
          case "if": {
            // `if` as a value: `if c { a } else { b }` (Rust/Kotlin/Swift); one expression per branch.
            this.next();
            const cond = this.expr(true);
            if (this.isKw("then")) this.fail("`then` is not Mycel syntax", this.here(), { code: "E0101", why: "an `if` used as a value is written like Rust, Kotlin and Swift", suggestion: "write `if cond { a } else { b }`, or Python's `a if cond else b`" });
            const th = this.ifBranch();
            const save = this.i;
            this.skipNl();
            if (!this.acceptKw("else")) { this.i = save; this.fail("an `if` used as a value needs an `else`", this.here(), { why: "the value has to exist whether the condition is true or false", suggestion: "add `else { <value> }`" }); }
            const el = this.isKw("if") ? this.expr() : this.ifBranch();
            return mk({ k: "ternary", cond, then: th, else: el });
          }
          case "fn": {
            // anonymous function: `fn(x) => x * 2` / `fn(x) { return x * 2 }` (Go `func(x)`, JS `function(x)`, Kotlin `fun(x)`)
            if (!this.isOp("(", this.peek())) break;
            this.next();
            const params = this.params();
            let ret: A.TypeExpr | undefined;
            if (this.acceptOp("->")) ret = this.type();
            const body = this.acceptOp("=>") ? (this.skipNl(), this.isOp("{") ? this.block() : this.expr()) : this.block();
            return mk({ k: "lambda", params, ret, body, async: false });
          }
        }
        break;
      case "op":
        if (t.v === "(") {
          if (this.isLambdaAhead()) return this.lambda(false);
          const o = this.next();
          this.skipNl();
          if (this.isOp(")")) { this.next(); return mk({ k: "tuple", elems: [] }); }
          const first = this.expr();
          this.skipNl();
          if (this.isOp(",")) {
            const elems = [first];
            while (this.acceptOp(",")) { this.skipNl(); if (this.isOp(")")) break; elems.push(this.expr()); this.skipNl(); }
            this.expectOp(")", "to close the tuple", o);
            return mk({ k: "tuple", elems });
          }
          this.expectOp(")", "to close the parenthesis", o);
          return first;
        }
        if (t.v === "[") {
          const o = this.next(); const elems: A.Expr[] = [];
          this.skipNl();
          // `[n * n for n in nums if n % 2 == 0]` (Python): a comprehension node, checked and run like nested for/if
          if (!this.isOp("]")) {
            const first = this.expr(); this.skipNl();
            if (this.isKw("for")) {
              const clauses = this.compClauses();
              this.expectOp("]", "to close the list comprehension", o);
              return mk({ k: "comp", kind: "list", elem: first, clauses });
            }
            elems.push(first);
            if (this.acceptOp(",")) { this.skipNl(); while (!this.isOp("]")) { elems.push(this.expr()); this.skipNl(); if (!this.acceptOp(",")) break; this.skipNl(); } }
          }
          this.expectOp("]", "to close the array", o);
          return mk({ k: "array", elems });
        }
        if (t.v === "#" && this.isOp("[", this.peek())) this.fail("`#[...]` is not Mycel syntax", this.here(), { code: "E0101", why: "sets are made the way Python, JavaScript and Swift make them", suggestion: "write `Set([1, 2])`" });
        if (t.v === "{" && this.braceIsClosure()) return this.closure();
        if (t.v === "{") {
          const o = this.next(); this.skipNl();
          const entries: { key: A.Expr; value: A.Expr }[] = [];
          if (this.isOp(":")) this.fail("`{:}` is not Mycel syntax", this.here(), { code: "E0101", why: "an empty map is `{}`, as in Python and JavaScript", suggestion: "write `{}`" });
          if (this.isOp("}")) { this.next(); return mk({ k: "map", entries }); }
          while (!this.isOp("}")) {
            const key = this.expr();
            this.expectOp(":", "between a map key and its value");
            this.skipNl();
            const value = this.expr();
            this.skipNl();
            if (this.isKw("for") && !entries.length) { // `{w: len(w) for w in words}` (Python dict comprehension)
              const clauses = this.compClauses();
              this.expectOp("}", "to close the map comprehension", o);
              return mk({ k: "comp", kind: "map", key, elem: value, clauses });
            }
            entries.push({ key, value });
            if (!this.acceptOp(",")) break;
            this.skipNl();
          }
          this.expectOp("}", "to close the map", o);
          return mk({ k: "map", entries });
        }
        if (t.v === ".") { // implicit member  .Circle(1.0)
          this.next(); const n = this.ident("after `.`");
          const args = this.isOp("(") && !this.t.sp ? this.args() : undefined;
          return mk({ k: "implicit", name: n.v, args });
        }
        break;
    }
    if (t.k === "kw" && !["self", "super"].includes(t.v)) {
      this.fail(`expected an expression, found the keyword \`${t.v}\``, this.here(), { why: `\`${t.v}\` is a keyword and cannot be used as a value`, suggestion: "rename the variable, or write an expression here" });
    }
    this.fail(`expected an expression, found ${this.describe(t)}`, this.here(), { why: "a value (number, string, name, call, ...) is needed at this point", suggestion: t.k === "nl" || t.k === "eof" ? "finish the expression — an operator at the end of a line expects something after it" : "check for a missing operand or a stray symbol" });
  }
}

/** True when a top-level statement awaits (not counting nested functions/lambdas, which are async on their own). */
function hasAwait(n: unknown): boolean {
  if (Array.isArray(n)) return n.some(hasAwait);
  if (!n || typeof n !== "object") return false;
  const o = n as Record<string, unknown>;
  if (o.k === "await") return true;
  if (o.k === "lambda" || o.k === "fn") return false;
  for (const [key, v] of Object.entries(o)) if (key !== "span" && key !== "src" && hasAwait(v)) return true;
  return false;
}

/** Does a top-level script statement declare `name` (`let name = ...` / `var name = ...` inside the script)? */
function declares(st: A.Stmt, name: string): boolean {
  return st.k === "let" && (st.pat as any).k === "bind" && (st.pat as any).name === name;
}
