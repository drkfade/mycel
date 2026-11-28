import * as A from "./ast";
import { Span } from "./diag";
import { Checker, jsId } from "./checker";
import { Ty, TypeDecl, FnInfo, ModuleInfo, GlobalInfo, VariantInfo, prune, supertypes, app } from "./types";

export interface Generated { code: string; spans: Span[] }

const q = (s: string) => JSON.stringify(s);

interface Frame { temps: number; async: boolean; gen: boolean; selfJs: string; isInit?: boolean }

/** Compile checked modules to one JS source. Runtime helpers ($-prefixed) come from runtime.ts. */
export function generate(ck: Checker, mods: ModuleInfo[], opts: { live?: string } = {}): Generated {
  const spans: Span[] = [];
  const parts: string[] = [];
  for (const m of mods) parts.push(new ModuleGen(ck, m, spans, m.name === opts.live).emit());
  return { code: parts.join("\n"), spans };
}

class ModuleGen {
  frames: Frame[] = [{ temps: 0, async: false, gen: false, selfJs: "this" }];
  chainTemps = new Map<A.Expr, string>();
  /** live: record each binding/assignment/value line for the playground's live-values column (Swift playgrounds) */
  constructor(readonly ck: Checker, readonly m: ModuleInfo, readonly spans: Span[], readonly live = false) {}
  get fr(): Frame { return this.frames[this.frames.length - 1]; }

  // ---------- naming ----------
  mref(mod: ModuleInfo): string { return `$M[${q(mod.name)}]`; }
  typeRef(d: TypeDecl): string { return d.module === this.m ? d.js : `${this.mref(d.module)}.${d.js}`; }
  variantRef(d: TypeDecl, v: VariantInfo): string { return d.module === this.m ? v.js : `${this.mref(d.module)}.${v.js}`; }
  fnRef(f: FnInfo): string { return f.module === this.m ? f.js : `${this.mref(f.module)}.${f.js}`; }
  globalRef(g: GlobalInfo): string { return g.module === this.m ? g.js : `${this.mref(g.module)}.${g.js}`; }
  isNative(f: FnInfo): boolean { return !!f.native; }
  nat(key: string): string { return `$n[${q(key)}]`; }
  temp(): string { return `$${++this.fr.temps}`; }
  mark(span: Span | undefined): string {
    if (!span) return "\n";
    this.spans.push(span);
    return `\n/*@${this.spans.length - 1}*/`;
  }
  isInt(t: Ty) { t = prune(t); return t.k === "prim" && t.name === "Int"; }
  isFloat(t: Ty) { t = prune(t); return t.k === "prim" && t.name === "Float"; }
  isStr(t: Ty) { t = prune(t); return t.k === "prim" && (t.name === "String"); }
  isForeignVal(t: Ty) { t = prune(t); return t.k === "app" && t.decl.name === "Value" && t.decl.module.name === "std.foreign"; }
  isPrimScalar(t: Ty) { t = prune(t); return t.k === "prim" && ["Int", "Float", "Bool", "String", "Char"].includes(t.name); }
  tyOf(e: A.Expr): Ty { return (e as any).ty as Ty; }

  // ======================================================================
  // module
  // ======================================================================
  emit(): string {
    const m = this.m;
    const o: string[] = [];
    o.push(`$M[${q(m.name)}] = (function () {`);
    const body: string[] = [];
    const exports: string[] = [];
    if (m.name !== "prelude") body.push(`const $P = $M["prelude"];`);
    for (const [name, b] of m.imports) {
      const js = jsId(name);
      if (b.kind === "type") body.push(`const ${js} = ${this.mref(b.decl.module)}.${b.decl.js};`);
      else if (b.kind === "fn") body.push(`const ${js} = ${this.mref(b.fns[0].module)}.${b.fns[0].js};`);
      else if (b.kind === "module") { /* accessed as $M[...] directly */ }
    }
    // types in dependency order (bases first)
    const decls = [...m.types.values()].filter((d) => d.kind !== "extern" && !d.alias);
    const done = new Set<TypeDecl>();
    const out: string[] = [];
    const visit = (d: TypeDecl) => {
      if (done.has(d) || d.module !== m) return;
      done.add(d);
      if (d.base) visit(d.base.decl);
      for (const i of d.ifaces) visit(i.decl);
      out.push(this.typeDecl(d));
      exports.push(d.js);
      if (d.variants) for (const v of d.variants) exports.push(v.js);
    };
    for (const d of decls) visit(d);
    body.push(...out);
    // functions
    for (const [, g] of m.fns) for (const f of g) {
      if (f.decl?.extern) continue;
      body.push(this.topFn(f));
      exports.push(f.js);
    }
    // extensions
    for (const e of m.exts) for (const [, g] of e.methods) for (const f of g) {
      body.push(this.extFn(f, e));
      exports.push(f.js);
    }
    // globals + tests in source order
    const getters: string[] = [];
    for (const d of m.ast!.decls) {
      if (d.k === "let") {
        const g = m.globals.get((d.stmt.pat as any).name);
        if (!g) continue;
        body.push(this.mark(d.span) + `${g.mutable ? "let" : "const"} ${g.js} = ${d.stmt.init ? this.ex(d.stmt.init) : "null"};` + (this.live && d.stmt.init ? `\n$live(${this.lineOf(d.span)}, ${q(g.name)}, ${g.js});` : ""));
        getters.push(`get ${g.js}() { return ${g.js}; }`);
        if (g.mutable) getters.push(`set ${g.js}(v) { ${g.js} = v; }`);
      } else if (d.k === "test") {
        this.frames.push({ temps: 0, async: true, gen: false, selfJs: "this" });
        const bodyCode = this.block(d.body);
        const f = this.frames.pop()!;
        body.push(`$tests.push({ module: ${q(m.name)}, name: ${q(d.name)}, fn: async () => {${this.tempDecl(f)}${bodyCode}\n} });`);
      }
    }
    const top = this.frames[0];
    const header = top.temps ? `let ${Array.from({ length: top.temps }, (_, i) => "$" + (i + 1)).join(", ")};` : "";
    o.push(header, ...body);
    o.push(`return { ${[...exports.map((x) => x), ...getters].join(", ")} };`);
    o.push(`})();`);
    return o.join("\n");
  }

  tempDecl(f: Frame): string { return f.temps ? `let ${Array.from({ length: f.temps }, (_, i) => "$" + (i + 1)).join(", ")};` : ""; }

  // ======================================================================
  // declarations
  // ======================================================================
  params(fn: FnInfo, decl: A.FnDecl, skipDefaults = false): string {
    return decl.params.map((p) => {
      const js = p.js ?? jsId(p.name);
      if (p.variadic) return `...${js}`;
      return p.default && !skipDefaults ? `${js} = ${this.ex(p.default)}` : js;
    }).join(", ");
  }

  /** Destructured parameters (`(a, b): (Int, Int)`) unpack their generated `$argN` at the top of the body. */
  paramBinds(ps: A.Param[]): string { return ps.map((p) => (p.pat ? this.patBinds(p.pat, p.js!) : "")).join(""); }

  /** Function body for FnInfo (block or expression). */
  fnBody(f: FnInfo, d: A.FnDecl, selfJs: string, isMethod: boolean): { params: string; body: string; flags: string } {
    const frame: Frame = { temps: 0, async: f.async, gen: f.gen, selfJs, isInit: f.isInit };
    this.frames.push(frame);
    const params = this.params(f, d);
    let inner: string;
    if (d.body && d.body.k === "block") inner = this.block(d.body);
    else if (d.body) inner = this.mark(d.body.span) + (f.isInit || isPrimVoid(f.ret) ? `${this.ex(d.body as A.Expr)};` : `return ${this.ex(d.body as A.Expr)};`);
    else inner = "";
    inner = this.paramBinds(d.params) + inner;
    if (f.isInit) inner += `\nreturn this;`;
    this.frames.pop();
    const usesProp = (f as any).usesPropagate;
    const decl = this.tempDecl(frame);
    let body = `${decl}\n$tick();${inner}`;
    if (usesProp) body = `${decl}\n$tick();\ntry {${inner}\n} catch ($e) { if ($e instanceof $Early) return $e.value; throw $e; }`;
    return { params, body, flags: "" };
  }

  topFn(f: FnInfo): string {
    const d = f.decl!;
    const name = f.js;
    const { params, body } = this.fnBody(f, d, "this", false);
    const pos = this.mark(d.span);
    if (f.gen) return `${pos}function ${name}(${params}) { return $gen((function* () {${body}\n}).call(this)); }`;
    return `${pos}${f.async ? "async " : ""}function ${name}(${params}) {${body}\n}`;
  }

  extFn(f: FnInfo, ext: any): string {
    const d = f.decl!;
    const { params, body } = this.fnBody(f, d, "self_", false);
    const pos = this.mark(d.span);
    const sig = f.static ? params : ["self_", params].filter(Boolean).join(", ");
    const reg = `$extReg(${q(this.ck.extKey(ext.target))}, ${q(f.name)}, ${f.js});`;
    if (f.gen) return `${pos}function ${f.js}(${sig}) { return $gen((function* () {${body}\n}).call(this)); }\n${reg}`;
    return `${pos}${f.async ? "async " : ""}function ${f.js}(${sig}) {${body}\n}\n${reg}`;
  }

  method(f: FnInfo, isStatic: boolean): string {
    const d = f.decl!;
    const pos = this.mark(d.span);
    const { params, body } = this.fnBody(f, d, "this", true);
    const st = isStatic ? "static " : "";
    if (f.accessor === "get") return `${pos}${st}get ${f.js}() {${body}\n}`;
    if (f.accessor === "set") return `${pos}${st}set ${f.js}(${params}) {${body}\n}`;
    if (f.gen) return `${pos}${st}${f.js}(${params}) { return $gen((function* () {${body}\n}).call(this)); }`;
    return `${pos}${st}${f.async ? "async " : ""}${f.js}(${params}) {${body}\n}`;
  }

  typeDecl(d: TypeDecl): string {
    const ast = d.ast!;
    const o: string[] = [];
    if (d.kind === "interface") {
      const methods = [...d.methods.values()].flat().filter((f) => f.decl?.body);
      o.push(`const ${d.js} = { id: ${q(d.id)}, defaults: {`);
      for (const f of methods) o.push(this.method(f, false).replace(/^(\n\/\*@\d+\*\/)?/, "$1") + ",");
      o.push(`} };`);
      return o.join("\n");
    }
    const isEnum = d.kind === "enum";
    const base = d.base ? this.typeRef(d.base.decl) : "$Obj";
    const mem: string[] = [];
    if (ast.k === "class") {
      for (const f of d.fields.values()) {
        if (f.static) continue;
        const fd: A.FieldDecl = (f as any).decl;
        mem.push(`${f.js} = ${fd.init ? this.ex(fd.init) : "undefined"};`);
      }
    }
    for (const f of d.ctors) {
      if ((f as any).inherited) continue;
      mem.push(this.ctor(d, f));
    }
    if (d.kind === "struct") mem.push(this.structWith(d));
    for (const list of d.methods.values()) for (const f of list) {
      if ((f as any).synth || !f.decl || !f.decl.body) continue;
      mem.push(this.method(f, false));
    }
    for (const f of d.getters.values()) if (f.decl?.body) mem.push(this.method(f, false));
    for (const f of d.setters.values()) if (f.decl?.body) mem.push(this.method(f, false));
    for (const list of d.statics.values()) for (const f of list) if (f.decl?.body) mem.push(this.method(f, true));
    o.push(`class ${d.js} extends ${base} {\n${mem.join("\n")}\n}`);
    const allIfaces = new Set<string>();
    for (const s of supertypes(app(d, d.params) as any)) if (s.decl.kind === "interface") allIfaces.add(s.decl.id);
    const fields = d.kind === "enum" ? [] : [...this.ck.allFieldsOf(app(d, d.params) as any).values()].map((f) => f.js);
    o.push(`$meta(${d.js}, ${q(d.name)}, ${q(d.kind)}, ${JSON.stringify(fields)}, ${JSON.stringify([...allIfaces])});`);
    // interface default methods
    for (const s of supertypes(app(d, d.params) as any)) if (s.decl.kind === "interface" && [...s.decl.methods.values()].flat().some((f) => f.decl?.body)) o.push(`$mix(${d.js}, ${this.typeRef(s.decl)}.defaults);`);
    if (isEnum) {
      for (const v of d.variants!) {
        o.push(`const ${v.js} = $variant(${d.js}, ${q(v.name)}, ${v.index}, ${JSON.stringify(v.fields.map((f, i) => (f.name ? this.ck.memberJs(f.name) : `_${i}`)))}, ${JSON.stringify(v.fields.map((f) => f.name ?? null))});`);
        if (!v.fields.length) o.push(`${v.js}.v = new ${v.js}();`);
      }
    }
    // static fields
    if (ast.k === "class") for (const f of d.fields.values()) if (f.static) { const fd: A.FieldDecl = (f as any).decl; o.push(`${d.js}.${f.js} = ${fd.init ? this.ex(fd.init) : "undefined"};`); }
    return o.join("\n");
  }

  structWith(d: TypeDecl): string {
    const fs = [...d.fields.values()].filter((f) => !f.static);
    if (!d.methods.has("with")) return "";
    return `with_(${fs.map((f) => f.js).join(", ")}) { return new ${d.js}().$init(${fs.map((f) => `${f.js} === undefined ? this.${f.js} : ${f.js}`).join(", ")}); }`;
  }

  ctor(d: TypeDecl, f: FnInfo): string {
    if ((f as any).memberwise) {
      const fieldsAll = [...this.ck.allFieldsOf(app(d, d.params) as any).values()];
      const own = new Set([...d.fields.values()].filter((x) => !x.static).map((x) => x.name));
      const baseFields = fieldsAll.filter((x) => !own.has(x.name));
      const ps = f.params.map((p, i) => {
        const fi = fieldsAll[i];
        const fd: A.FieldDecl | undefined = fi && (fi as any).decl;
        return p.hasDefault && fd?.init ? `${fi.js} = ${this.ex(fd.init)}` : fi.js;
      });
      const lines: string[] = [];
      if (d.base && baseFields.length) lines.push(`super.$init(${baseFields.map((x) => x.js).join(", ")});`);
      for (const x of [...d.fields.values()].filter((y) => !y.static)) lines.push(`this.${x.js} = ${x.js};`);
      return `${f.js}(${ps.join(", ")}) { ${lines.join(" ")} return this; }`;
    }
    const d2 = f.decl!;
    const { params, body } = this.fnBody(f, d2, "this", true);
    return `${this.mark(d2.span)}${f.js}(${params}) {${body}\n}`;
  }

  // ======================================================================
  // statements
  // ======================================================================
  block(b: { stmts: A.Stmt[] }): string { return b.stmts.map((s) => this.stmt(s)).join(""); }
  scopeBlock(b: { stmts: A.Stmt[] }): string { return `{${this.block(b)}\n}`; }

  stmt(s: A.Stmt): string {
    const pos = this.mark(s.span);
    switch (s.k) {
      case "let": {
        const code = pos + this.letStmt(s);
        if (this.live && s.pat.k === "bind" && !s.pat.sub && s.init) return `${code}\n$live(${this.lineOf(s.span)}, ${q(s.pat.name)}, ${(s.pat as any).js});`;
        return code;
      }
      case "expr": {
        if (this.live) { const lv = this.liveExpr(s); if (lv) return pos + lv; }
        // a Task nobody holds: report its failure instead of letting it become an unhandled rejection
        const t = prune(this.tyOf(s.expr));
        const dropped = t.k === "app" && t.decl.builtin && t.decl.name === "Task";
        return pos + (dropped ? `$drop(${this.ex(s.expr)})` : this.ex(s.expr)) + ";";
      }
      case "if": return pos + this.ifStmt(s);
      case "while": {
        const lab = s.label ? `$L_${s.label}: ` : "";
        if (s.cond.pat) {
          const v = this.temp();
          return `${pos}${lab}while (true) {\n$tick();\n${v} = ${this.ex(s.cond.expr)};\nif (!(${this.condTest(s.cond.pat, v, (s.cond as any).unwrap)})) break;${this.patBinds(s.cond.pat, v)}${this.block(s.body)}\n}`;
        }
        return `${pos}${lab}while (${this.ex(s.cond.expr)}) {\n$tick();${this.block(s.body)}\n}`;
      }
      case "for": return pos + this.forStmt(s);
      case "match": return pos + this.matchStmt(s.subject, s.arms, false);
      case "return": {
        if (this.fr.isInit) return `${pos}return this;`;
        return `${pos}return${s.value ? " " + this.ex(s.value) : ""};`;
      }
      case "break": return pos + (s.label ? `break $L_${s.label};` : "break;");
      case "continue": return pos + (s.label ? `continue $L_${s.label};` : "continue;");
      case "throw": return `${pos}throw $thr(${this.ex(s.value)});`;
      case "try": return pos + this.tryStmt(s);
      case "block": return `${pos}{${this.block(s)}\n}`;
      case "fn": {
        const d = s.decl;
        const lam = (d as any).lambda as A.Expr;
        return `${pos}const ${(d as any).localJs} = ${this.lambdaCode(lam as any)};`;
      }
    }
  }

  lineOf(span: Span): number { return span.src.pos(span.start).line; }

  /** Live values: `x = ...` / `x += 1` report the new value of x; a line that computes a value (not Void, not a Task)
   *  reports it. Anything else is left alone (undefined). */
  liveExpr(s: Extract<A.Stmt, { k: "expr" }>): string | undefined {
    const e = s.expr, line = this.lineOf(s.span);
    if (e.k === "assign" && e.target.k === "id") return `${this.ex(e)};\n$live(${line}, ${q(e.target.name)}, ${this.ex(e.target)});`;
    if (e.k === "assign") return undefined;
    const t = prune(this.tyOf(e));
    if (t.k === "err" || isPrimVoid(t) || (t.k === "prim" && t.name === "Never") || (t.k === "app" && t.decl.builtin && t.decl.name === "Task")) return undefined;
    return `$live(${line}, "", ${this.ex(e)});`;
  }

  letStmt(s: Extract<A.Stmt, { k: "let" }>): string {
    const kw = s.mutable ? "let" : "const";
    const init = s.init ? this.ex(s.init) : "null";
    if (s.pat.k === "bind" && !s.pat.sub) return `${kw} ${(s.pat as any).js} = ${init};`;
    if (s.pat.k === "wild") return `${init};`;
    const v = this.temp();
    return `${v} = ${init};${this.patBinds(s.pat, v, kw)}`;
  }

  ifStmt(s: Extract<A.Stmt, { k: "if" }>): string {
    const els = s.else ? (s.else.k === "block" ? ` else {${this.block(s.else)}\n}` : ` else {${this.stmt(s.else as A.Stmt)}\n}`) : "";
    if (s.cond.pat) {
      const v = this.temp();
      // the else branch must not see the pattern bindings, but the subject temp is function-scoped so it is safe
      return `${v} = ${this.ex(s.cond.expr)};\nif (${this.condTest(s.cond.pat, v, (s.cond as any).unwrap)}) {${this.patBinds(s.cond.pat, v)}${this.block(s.then)}\n}${els}`;
    }
    return `if (${this.ex(s.cond.expr)}) {${this.block(s.then)}\n}${els}`;
  }

  forStmt(s: Extract<A.Stmt, { k: "for" }>): string {
    const it = s.iter;
    const bindBody = (v: string) => (s.pat.k === "bind" && !s.pat.sub ? "" : this.patBinds(s.pat, v));
    const simple = s.pat.k === "bind" && !s.pat.sub ? (s.pat as any).js : this.temp();
    const itT = prune(this.tyOf(it));
    const lab = s.label ? `$L_${s.label}: ` : "";
    // fast path: integer range literal
    if (it.k === "range" && it.lo && it.hi && s.pat.k === "bind" && !s.pat.sub) {
      const hi = this.temp();
      return `${hi} = ${this.ex(it.hi)};\n${lab}for (let ${simple} = ${this.ex(it.lo)}; ${simple} ${it.inclusive ? "<=" : "<"} ${hi}; ${simple} += 1n) {\n$tick();${this.block(s.body)}\n}`;
    }
    const decl = s.pat.k === "bind" && !s.pat.sub ? `const ${simple}` : `const ${simple}`;
    const iterable = itT.k === "app" && itT.decl.builtin && itT.decl.name === "Array" ? this.ex(it) : `$iter(${this.ex(it)})`;
    return `${lab}for (${decl} of ${iterable}) {\n$tick();${bindBody(simple)}${this.block(s.body)}\n}`;
  }

  tryStmt(s: Extract<A.Stmt, { k: "try" }>): string {
    let out = `try {${this.block(s.body)}\n}`;
    if (s.catches.length) {
      out += ` catch ($c) {\n$c = $norm($c);`;
      let first = true;
      for (const c of s.catches) {
        const ty = prune((c as any).ty as Ty);
        const test = ty.k === "app" ? `$c instanceof ${this.typeRef(ty.decl)}` : "true";
        const bind = c.name ? `const ${(c as any).js} = $c;` : "";
        out += `${first ? "" : " else "}if (${test}) {${bind}${this.block(c.body)}\n}`;
        first = false;
      }
      out += ` else { throw $c; }\n}`;
    }
    if (s.finally) out += ` finally {${this.block(s.finally)}\n}`;
    return out;
  }

  // ======================================================================
  // match / patterns
  // ======================================================================
  matchStmt(subject: A.Expr, arms: A.MatchArm[], asExpr: boolean): string {
    const sv = this.temp();
    const label = `$m${++this.labelN}`;
    let out = `${sv} = ${this.ex(subject)};\n${label}: {`;
    const sty = prune((subject as any).matchTy ?? this.tyOf(subject));
    for (const arm of arms) {
      const unwrap = sty.k === "opt";
      const cond = this.patCond(arm.pat, sv, unwrap && arm.pat.k !== "lit" ? true : false);
      const binds = this.patBinds(arm.pat, sv);
      const guard = arm.guard ? `if (${this.ex(arm.guard)}) ` : "";
      let body: string;
      if (arm.body.k === "block") body = this.block(arm.body) + (asExpr ? "" : "");
      else if (asExpr) body = `\nreturn ${this.ex(arm.body)};`;
      else body = `\n${this.ex(arm.body)};`;
      const end = asExpr ? "" : `\nbreak ${label};`;
      out += `\nif (${cond}) {${binds}\n${guard}{${body}${end}\n}}`;
    }
    out += `\n$nomatch(${sv});\n}`;
    return out;
  }
  labelN = 0;

  /** `if let` / `while let`: an optional subject must be non-nil before the pattern is tried. */
  condTest(p: A.Pattern, acc: string, unwrap: boolean): string {
    const c = this.patCond(p, acc, unwrap);
    return unwrap ? `(${acc} !== null && ${c})` : c;
  }

  /** JS condition testing whether `acc` matches pattern p (no bindings). */
  patCond(p: A.Pattern, acc: string, unwrapOpt = false): string {
    const nn = unwrapOpt ? `${acc} !== null && ` : "";
    switch (p.k) {
      case "wild": return "true";
      case "bind": return p.sub ? this.patCond(p.sub, acc, unwrapOpt) : "true";
      case "lit": {
        if (p.value.k === "nil") return `${acc} === null`;
        return `${this.litEq(p.value, acc)}`;
      }
      case "range": {
        const c: string[] = [];
        if (p.lo) c.push(`${acc} >= ${this.ex(p.lo)}`);
        if (p.hi) c.push(`${acc} ${p.inclusive ? "<=" : "<"} ${this.ex(p.hi)}`);
        return `(${nn}${c.join(" && ") || "true"})`;
      }
      case "tuple": return `(${nn}${p.elems.map((q2, i) => this.patCond(q2, `${acc}[${i}]`)).join(" && ") || "true"})`;
      case "array": {
        const n = p.elems.length;
        const head = p.rest ? `${acc}.length >= ${n}` : `${acc}.length === ${n}`;
        const elems = p.elems.map((q2, i) => this.patCond(q2, p.rest && i >= p.restIndex ? `${acc}[${acc}.length - ${n - i}]` : `${acc}[${i}]`));
        return `(${nn}${[head, ...elems].filter((x) => x !== "true").join(" && ")})`;
      }
      case "variant": {
        const pp = p as any;
        if (pp.constant) return `${acc} === ${this.globalRef(pp.constant)}`;
        const v = pp.v as VariantInfo;
        const order = (pp.order as number[]) ?? p.args.map((_: any, i: number) => i);
        const subs = v.fields.map((f, fi) => (order[fi] >= 0 && p.args[order[fi]] ? this.patCond(p.args[order[fi]], `${acc}.${f.name ? this.ck.memberJs(f.name) : "_" + fi}`) : "true")).filter((x) => x !== "true");
        return `(${nn}${[`${acc}.$t === ${v.index}`, ...subs].join(" && ")})`;
      }
      case "object": {
        const pp = p as any;
        const decl = pp.decl as TypeDecl;
        const subs = p.fields.map((f) => this.patCond(f.pat, `${acc}.${this.ck.memberJs(f.name)}`)).filter((x) => x !== "true");
        return `(${[`${acc} instanceof ${this.typeRef(decl)}`, ...subs].join(" && ")})`;
      }
      case "is": return `(${this.typeTest((p as any).isTy, acc)})`;
      case "or": return `(${p.alts.map((a) => this.patCond(a, acc, unwrapOpt)).join(" || ")})`;
    }
  }
  litEq(e: A.Expr, acc: string): string {
    const lit = this.ex(e);
    const t = prune(this.tyOf(e));
    if (t.k === "prim" || t.k === "nil") return `${acc} === ${lit}`;
    return `$eq(${acc}, ${lit})`;
  }

  /** `const x = acc.path;` statements for every binding in p. */
  patBinds(p: A.Pattern, acc: string, kw = "const"): string {
    const out: string[] = [];
    const walk = (q2: A.Pattern, a: string) => {
      switch (q2.k) {
        case "bind": {
          const info = (q2 as any).info;
          out.push(`${info?.mutable || kw === "let" ? "let" : "const"} ${(q2 as any).js} = ${a};`);
          if (q2.sub) walk(q2.sub, a);
          return;
        }
        case "tuple": q2.elems.forEach((x, i) => walk(x, `${a}[${i}]`)); return;
        case "array": {
          const n = q2.elems.length;
          q2.elems.forEach((x, i) => walk(x, q2.rest && i >= q2.restIndex ? `${a}[${a}.length - ${n - i}]` : `${a}[${i}]`));
          if (q2.rest?.name) out.push(`const ${(q2 as any).restInfo.js} = ${a}.slice(${q2.restIndex}, ${a}.length - ${n - q2.restIndex});`);
          return;
        }
        case "variant": {
          const pp = q2 as any;
          if (!pp.v) return;
          const v = pp.v as VariantInfo;
          const order = (pp.order as number[]) ?? q2.args.map((_: any, i: number) => i);
          v.fields.forEach((f, fi) => { if (order[fi] >= 0 && q2.args[order[fi]]) walk(q2.args[order[fi]], `${a}.${f.name ? this.ck.memberJs(f.name) : "_" + fi}`); });
          return;
        }
        case "object": q2.fields.forEach((f) => walk(f.pat, `${a}.${this.ck.memberJs(f.name)}`)); return;
        case "or": return;
        default: return;
      }
    };
    walk(p, acc);
    return out.length ? "\n" + out.join("\n") : "";
  }

  typeTest(t0: Ty, v: string): string {
    const t = prune(t0);
    switch (t.k) {
      case "prim":
        switch (t.name) {
          case "Int": return `typeof ${v} === "bigint"`;
          case "Float": return `typeof ${v} === "number"`;
          case "Bool": return `typeof ${v} === "boolean"`;
          case "String": case "Char": return `typeof ${v} === "string"`;
          case "Void": return `${v} === undefined`;
          default: return "true";
        }
      case "opt": return `(${v} === null || ${this.typeTest(t.inner, v)})`;
      case "tuple": return `(Array.isArray(${v}) && ${v}.length === ${t.elems.length})`;
      case "fn": return `typeof ${v} === "function"`;
      case "app": {
        const d = t.decl;
        if (d.builtin) {
          if (d.name === "Array") return `Array.isArray(${v})`;
          if (d.name === "Map") return `${v} instanceof Map`;
          if (d.name === "Set") return `${v} instanceof Set`;
          if (d.name === "Range") return `$isRange(${v})`;
          if (d.name === "Task") return `${v} instanceof Promise`;
          if (d.name === "Gen") return `$isGen(${v})`;
          if (d.kind === "extern") return `$kindOf(${v}) === ${q(d.name)}`;
        }
        if (d.kind === "interface") return `$impl(${v}, ${q(d.id)})`;
        return `${v} instanceof ${this.typeRef(d)}`;
      }
      default: return "true";
    }
  }

  // ======================================================================
  // expressions
  // ======================================================================
  over = new Map<A.Expr, string>();
  chainDone = new Set<A.Expr>();

  ex(e: A.Expr): string {
    const o = this.over.get(e);
    if (o !== undefined) return o;
    const fc = (e as any).fcoerce as string | undefined;
    if ((e as any).chain && !this.chainDone.has(e)) {
      const res = this.chainExpr(e);
      return fc ? `${this.nat("std.foreign.$coerce")}(${res}, ${q(fc)})` : res;
    }
    const res = this.ex0(e);
    return !(e as any).chain && fc ? `${this.nat("std.foreign.$coerce")}(${res}, ${q(fc)})` : res;
  }

  private spineNext(x: A.Expr): A.Expr | undefined {
    if (x.k === "member" || x.k === "index") return x.obj;
    if (x.k === "call") return x.callee;
    return undefined;
  }
  private isLink(x: A.Expr): boolean {
    if (x.k === "member" || x.k === "index") return !!x.optional;
    return false;
  }
  private chainExpr(e: A.Expr): string {
    // find the innermost optional link (closest to the base), which decides the null test
    const spine: A.Expr[] = [];
    for (let cur: A.Expr | undefined = e; cur; cur = this.spineNext(cur)) spine.push(cur);
    let linkIdx = -1;
    for (let i = spine.length - 1; i >= 0; i--) if (this.isLink(spine[i])) { linkIdx = i; break; }
    if (linkIdx < 0) { this.chainDone.add(e); return this.ex(e); }
    const link = spine[linkIdx] as Extract<A.Expr, { k: "member" | "index" }>;
    for (let i = 0; i <= linkIdx; i++) this.chainDone.add(spine[i]);
    const t = this.temp();
    const base = this.ex(link.obj);
    this.over.set(link.obj, t);
    const inner = this.ex(e);
    this.over.delete(link.obj);
    return `((${t} = ${base}) == null ? null : ${inner})`;
  }

  lit(v: number): string { return Number.isFinite(v) ? (Object.is(v, -0) ? "(-0)" : String(v)) : v > 0 ? "Infinity" : v < 0 ? "(-Infinity)" : "NaN"; }

  strPart(p: string | A.Expr): string {
    if (typeof p === "string") return q(p);
    if (p.k === "fmtx") return `$fmt(${this.ex(p.e)}, ${q(p.spec)}, ${p.debug})`;
    const t = prune(this.tyOf(p));
    const c = this.ex(p);
    if (t.k === "prim") {
      if (t.name === "String" || t.name === "Char") return `(${c})`;
      if (t.name === "Int") return `String(${c})`;
      if (t.name === "Float") return `$fs(${c})`;
    }
    return `$s(${c})`;
  }

  private ex0(e: A.Expr): string {
    switch (e.k) {
      case "int": return `${e.value}n`;
      case "float": return this.lit(e.value);
      case "char": return q(e.value);
      case "bool": return String(e.value);
      case "nil": return "null";
      case "fmtx": return this.strPart(e);
      case "str": return e.parts.length === 1 && typeof e.parts[0] === "string" ? q(e.parts[0]) : e.parts.length === 0 ? '""' : `(${e.parts.map((p) => this.strPart(p)).join(" + ")})`;
      case "id": return this.idRef(e);
      case "self": return this.fr.selfJs;
      case "super": return "super";
      case "array": return `[${e.elems.map((x) => this.ex(x)).join(", ")}]`;
      case "set": return `new Set([${e.elems.map((x) => this.ex(x)).join(", ")}])`;
      case "map": return `new Map([${e.entries.map((x) => `[${this.ex(x.key)}, ${this.ex(x.value)}]`).join(", ")}])`;
      case "tuple": return e.elems.length ? `$t(${e.elems.map((x) => this.ex(x)).join(", ")})` : "undefined";
      case "unary": return this.unary(e);
      case "binary": return this.binary(e);
      case "assign": return this.assign(e);
      case "call": return this.call(e);
      case "index": return this.index(e);
      case "member": return this.member(e);
      case "implicit": return this.implicit(e);
      case "force": return `$fu(${this.ex(e.operand)})`;
      case "propagate": return `$q(${this.ex(e.operand)})`;
      case "cast": {
        const to = prune(this.resolveCastTy(e));
        const v = this.temp();
        const test = this.typeTest(to, v);
        return e.safe ? `((${v} = ${this.ex(e.operand)}), (${test}) ? ${v} : null)` : `((${v} = ${this.ex(e.operand)}), (${test}) ? ${v} : $castFail(${v}, ${q(this.tyName(to))}))`;
      }
      case "is": {
        const to = this.resolveCastTy(e);
        const v = this.temp();
        return `((${v} = ${this.ex(e.operand)}), ${this.typeTest(to, v)})`;
      }
      case "range": return `$range(${e.lo ? this.ex(e.lo) : "null"}, ${e.hi ? this.ex(e.hi) : "null"}, ${e.inclusive})`;
      case "lambda": return this.lambdaCode(e);
      case "comp": return this.compCode(e);
      case "ternary": return `(${this.ex(e.cond)} ? ${this.ex(e.then)} : ${this.ex(e.else)})`;
      case "match": return this.matchExpr(e);
      case "await": return `(await ${this.ex(e.operand)})`;
      case "spawn": return `$spawn(() => ${this.ex(e.operand)})`;
      case "yield": return e.delegate ? `(yield* $iter(${this.ex(e.operand!)}))` : `(yield ${e.operand ? this.ex(e.operand) : "undefined"})`;
      case "try": {
        const asyncInner = this.containsAwait(e.operand);
        return asyncInner ? `(await $tryA(async () => ${this.ex(e.operand)}))` : `$try(() => ${this.ex(e.operand)})`;
      }
      case "pipe": return this.ex((e as any).rewritten);
    }
  }

  tyName(t: Ty): string { return (require("./types") as typeof import("./types")).show(t); }
  resolveCastTy(e: any): Ty { return e.castTy ?? e.type?.resolved ?? (e as any).targetTy; }

  idRef(e: Extract<A.Expr, { k: "id" }>): string {
    const sym = (e as any).sym;
    if (!sym) return jsId(e.name);
    switch (sym.k) {
      case "local": return sym.info.js;
      case "global": return this.globalRef(sym.g);
      case "fn": { const f: FnInfo = sym.fns[0]; return f.native ? this.nat(f.native) : this.fnRef(f); }
      case "variant": {
        const v = sym.v as VariantInfo;
        return v.fields.length ? `((...a) => ${this.variantRef(sym.decl, v)}.of(...a))` : `${this.variantRef(sym.decl, v)}.v`;
      }
    }
    return jsId(e.name);
  }

  // ---------- operators ----------
  unary(e: Extract<A.Expr, { k: "unary" }>): string {
    const x = this.ex(e.operand);
    const opFn = (e as any).opFn as FnInfo | undefined;
    if (opFn) return this.callOp(opFn, x, []);
    if (e.op === "!") return `(!${x})`;
    if (e.op === "~") return `(~${x})`;
    const t = prune(this.tyOf(e.operand));
    if (this.isInt(t)) return `$w(-${x})`;
    if (t.k === "param" || this.isForeignVal(t)) return `$neg(${x})`;
    return `(-${x})`;
  }

  callOp(fn: FnInfo, recv: string, args: string[]): string {
    // operators declared on an extern class (e.g. Set's & | -) are natives taking the receiver first
    if (fn.native) return `${this.nat(fn.native)}(${[recv, ...args].join(", ")})`;
    if ((fn as any).ext) return `${this.fnRef(fn)}(${[recv, ...args].join(", ")})`;
    return `${recv}.${fn.js}(${args.join(", ")})`;
  }

  binary(e: Extract<A.Expr, { k: "binary" }>): string {
    const op = e.op;
    const lt = prune(this.tyOf(e.left)), rt = prune(this.tyOf(e.right));
    if (op === "&&" || op === "||") return `(${this.ex(e.left)} ${op} ${this.ex(e.right)})`;
    if (op === "??") { const t = this.temp(); return `((${t} = ${this.ex(e.left)}) != null ? ${t} : ${this.ex(e.right)})`; }
    const a = this.ex(e.left), b = this.ex(e.right);
    const opFn = (e as any).opFn as FnInfo | undefined;
    if (op === "==" || op === "!=") {
      let c: string;
      if (opFn) c = this.callOp(opFn, a, [b]);
      else if (this.isPrimScalar(lt) && this.isPrimScalar(rt)) {
        if ((this.isInt(lt) && this.isFloat(rt)) || (this.isFloat(lt) && this.isInt(rt))) {
          c = `(Number(${a}) === Number(${b}))`;
        } else {
          c = `(${a} === ${b})`;
        }
      }
      else c = `$eq(${a}, ${b})`;
      return op === "!=" ? `(!${c})` : c;
    }
    if (opFn) {
      const use = (e as any).opUse as string;
      if (["<", "<=", ">", ">="].includes(op) && use === "<") {
        // derive > <= >= from <
        const [x, y] = op === ">" || op === "<=" ? [b, a] : [a, b];
        const c = this.callOp(opFn, x, [y]);
        return op === ">" || op === "<" ? c : `(!${c})`;
      }
      return this.callOp(opFn, a, [b]);
    }
    const cmp = ["<", "<=", ">", ">="].includes(op);
    if (cmp) {
      if (lt.k === "param" || this.isForeignVal(lt) || this.isForeignVal(rt)) return `$cmp(${q(op)}, ${a}, ${b})`;
      return `(${a} ${op} ${b})`;
    }
    if (this.isInt(lt) && this.isInt(rt)) {
      switch (op) {
        case "+": case "-": case "*": return `$w(${a} ${op} ${b})`;
        case "/": return `$div(${a}, ${b})`;
        case "//": return `$idiv(${a}, ${b})`;
        case "%": return `$imod(${a}, ${b})`;
        case "**": return `$ipow(${a}, ${b})`;
        case "<<": return `$shl(${a}, ${b})`;
        case ">>": return `$shr(${a}, ${b})`;
        default: return `(${a} ${op} ${b})`;
      }
    }
    if (this.isInt(lt) && this.isFloat(rt)) {
      if (op === "/") return `$div(${a}, ${b})`;
      if (op === "//") return `$fidiv(${a}, ${b})`;
      if (op === "%") return `$fmod(${a}, ${b})`;
      return `(Number(${a}) ${op} ${b})`;
    }
    if (this.isFloat(lt) && this.isInt(rt)) {
      if (op === "/") return `$div(${a}, ${b})`;
      if (op === "//") return `$fidiv(${a}, ${b})`;
      if (op === "%") return `$fmod(${a}, ${b})`;
      return `(${a} ${op} Number(${b}))`;
    }
    if (this.isFloat(lt) && this.isFloat(rt)) {
      if (op === "**") return `(${a} ** ${b})`;
      if (op === "//") return `$fidiv(${a}, ${b})`;
      if (op === "%") return `$fmod(${a}, ${b})`;
      return `(${a} ${op} ${b})`;
    }
    if (this.isStr(lt) && op === "+") return `$sc(${a}, ${b})`;
    if (lt.k === "app" && op === "+") return `${a}.concat(${b})`;
    if (lt.k === "param" || this.isForeignVal(lt) || this.isForeignVal(rt)) return `$arith(${q(op)}, ${a}, ${b})`;
    return `(${a} ${op} ${b})`;
  }

  // ---------- assignment ----------
  private isPure(x: A.Expr): boolean {
    return x.k === "id" || x.k === "self" || x.k === "int" || x.k === "str" || (x.k === "member" && !x.optional && this.isPure(x.obj));
  }

  assign(e: Extract<A.Expr, { k: "assign" }>): string {
    const tgt = e.target;
    const compound = e.op !== "=" ? e.op.slice(0, -1) : undefined;
    if (tgt.k === "tuple") {
      const t = this.temp();
      const parts = tgt.elems.map((x, i) => this.assignTo(x, `${t}[${i}]`));
      return `(${t} = ${this.ex(e.value)}, ${parts.join(", ")}, undefined)`;
    }
    if (tgt.k === "index") {
      const idx = (tgt as any).idx as string;
      let o = this.ex(tgt.obj), i = this.ex(tgt.index);
      const pre: string[] = [];
      if (compound) {
        if (!this.isPure(tgt.obj)) { const t = this.temp(); pre.push(`${t} = ${o}`); o = t; }
        if (!(tgt.index.k === "id" || tgt.index.k === "int")) { const t = this.temp(); pre.push(`${t} = ${i}`); i = t; }
      }
      const cur = idx === "foreign" ? `${this.nat("std.foreign.$idx")}(${o}, ${i})` : idx === "map" ? `$mg(${o}, ${i})` : `$ai(${o}, ${i})`;
      const val = compound ? this.compoundValue(compound, cur, e) : this.ex(e.value);
      const set = idx === "foreign" ? `${this.nat("std.foreign.$setIdx")}(${o}, ${i}, ${val})` : idx === "map" ? `${o}.set(${i}, ${val})` : `$as(${o}, ${i}, ${val})`;
      return pre.length ? `(${pre.join(", ")}, ${set}, undefined)` : `(${set}, undefined)`;
    }
    if (tgt.k === "member" && (tgt as any).mres?.kind === "foreign-set-attr") {
      let o = this.ex(tgt.obj);
      const name = (tgt as any).mres.name as string;
      const pre: string[] = [];
      if (compound && !this.isPure(tgt.obj)) { const t = this.temp(); pre.push(`${t} = ${o}`); o = t; }
      const cur = `${this.nat("std.foreign.$attr")}(${o}, ${q(name)})`;
      const val = compound === "??" ? `(((${cur}) != null) ? ${cur} : ${this.ex(e.value)})` : compound ? this.compoundValue(compound, cur, e) : this.ex(e.value);
      const set = `${this.nat("std.foreign.$setAttr")}(${o}, ${q(name)}, ${val})`;
      return pre.length ? `(${pre.join(", ")}, ${set}, undefined)` : `(${set}, undefined)`;
    }
    let target = this.targetRef(tgt);
    const pre: string[] = [];
    if (compound && tgt.k === "member" && !this.isPure(tgt.obj)) {
      const t = this.temp(); pre.push(`${t} = ${this.ex(tgt.obj)}`);
      target = `${t}.${(tgt as any).mres?.fn?.js ?? (tgt as any).mres?.f?.js ?? tgt.name}`;
    }
    if (compound === "??") { return `(${pre.length ? pre.join(", ") + ", " : ""}${target} == null ? (${target} = ${this.ex(e.value)}) : undefined, undefined)`; }
    const val = compound ? this.compoundValue(compound, target, e) : this.ex(e.value);
    return `(${pre.length ? pre.join(", ") + ", " : ""}${target} = ${val}, undefined)`;
  }
  assignTo(x: A.Expr, val: string): string {
    if (x.k === "index") {
      const idx = (x as any).idx;
      if (idx === "foreign") return `${this.nat("std.foreign.$setIdx")}(${this.ex(x.obj)}, ${this.ex(x.index)}, ${val})`;
      return idx === "map" ? `${this.ex(x.obj)}.set(${this.ex(x.index)}, ${val})` : `$as(${this.ex(x.obj)}, ${this.ex(x.index)}, ${val})`;
    }
    return `${this.targetRef(x)} = ${val}`;
  }
  targetRef(x: A.Expr): string {
    if (x.k === "id") {
      const sym = (x as any).sym;
      if (sym?.k === "local") return sym.info.js;
      if (sym?.k === "global") return this.globalRef(sym.g);
      return jsId(x.name);
    }
    if (x.k === "member") {
      const m = (x as any).mres;
      if (m?.kind === "static-field") return `${this.typeRef(m.decl ?? m.f.owner)}.${m.f.js}`;
      if (m?.kind === "setter") return `${this.ex(x.obj)}.${m.fn.js}`;
      if (m?.kind === "field") return `${this.ex(x.obj)}.${m.f.js}`;
      return `${this.ex(x.obj)}.${this.ck.memberJs(x.name)}`;
    }
    return this.ex(x);
  }
  compoundValue(op: string, cur: string, e: Extract<A.Expr, { k: "assign" }>): string {
    const lt = prune(this.tyOf(e.target)), rt = prune(this.tyOf(e.value));
    const b = this.ex(e.value);
    const opFn = (e as any).opFn as FnInfo | undefined;
    if (opFn) return this.callOp(opFn, cur, [b]);
    if (this.isInt(lt)) {
      switch (op) {
        case "+": case "-": case "*": return `$w(${cur} ${op} ${b})`;
        case "//": return `$idiv(${cur}, ${b})`;
        case "%": return `$imod(${cur}, ${b})`;
        case "**": return `$ipow(${cur}, ${b})`;
        case "<<": return `$shl(${cur}, ${b})`;
        case ">>": return `$shr(${cur}, ${b})`;
        default: return `(${cur} ${op} ${b})`;
      }
    }
    if (this.isFloat(lt) && (op === "//" || op === "%")) return `${op === "//" ? "$fidiv" : "$fmod"}(${cur}, ${this.isInt(rt) ? `Number(${b})` : b})`;
    if (this.isFloat(lt)) {
      return op === "**"
        ? (this.isInt(rt) ? `(${cur} ** Number(${b}))` : `(${cur} ** ${b})`)
        : (this.isInt(rt) ? `(${cur} ${op} Number(${b}))` : `(${cur} ${op} ${b})`);
    }
    if (this.isStr(lt) && op === "+") return `$sc(${cur}, ${b})`;
    if (lt.k === "app" && op === "+") return `${cur}.concat(${b})`;
    return `$arith(${q(op)}, ${cur}, ${b})`;
  }

  // ---------- index / member ----------
  index(e: Extract<A.Expr, { k: "index" }>): string {
    const o = this.ex(e.obj), i = this.ex(e.index);
    switch ((e as any).idx) {
      case "array": return `$ai(${o}, ${i})`;
      case "map": return `$mg(${o}, ${i})`;
      case "string": return `$si(${o}, ${i})`;
      case "slice": return `$slice(${o}, ${i})`;
      case "foreign": return `${this.nat("std.foreign.$idx")}(${o}, ${i})`;
      case "op": return this.callOp((e as any).opFn, o, [i]);
    }
    return `${o}[${i}]`;
  }

  member(e: Extract<A.Expr, { k: "member" }>): string {
    const m = (e as any).mres;
    const sym = (e as any).sym;
    if (sym) {
      if (sym.k === "global") return this.globalRef(sym.g);
      if (sym.k === "fn") { const f: FnInfo = sym.fns[0]; return f.native ? this.nat(f.native) : this.fnRef(f); }
    }
    if (!m) return `${this.ex(e.obj)}.${this.ck.memberJs(e.name)}`;
    switch (m.kind) {
      case "tuple": return `${this.ex(e.obj)}[${m.i}]`;
      case "field": return `${this.ex(e.obj)}.${m.f.js}`;
      case "getter": {
        if (m.fn && m.fn.native) return `${this.nat(m.fn.native)}(${this.ex(e.obj)})`;
        if (m.fn && (m.fn as any).ext) return `${this.fnRef(m.fn)}(${this.ex(e.obj)})`;
        if (!m.fn) return `$prop(${this.ex(e.obj)}, ${q(this.ck.memberJs(e.name))})`;
        return `${this.ex(e.obj)}.${m.fn.js}`;
      }
      case "methods": {
        const f: FnInfo = m.cands[0].fn;
        const recv = this.ex(e.obj);
        const t = this.temp();
        if (f.native) return `((${t} = ${recv}), (...a) => ${this.nat(f.native)}(${t}, ...a))`;
        if ((f as any).ext) return `((${t} = ${recv}), (...a) => ${this.fnRef(f)}(${t}, ...a))`;
        if ((e as any).dyn) return `((${t} = ${recv}), (...a) => $d(${t}, ${q(f.js)}, ...a))`;
        return `((${t} = ${recv}), ${t}.${f.js}.bind(${t}))`;
      }
      case "variant": {
        const v: VariantInfo = m.v;
        return v.fields.length ? `((...a) => ${this.variantRef(m.decl, v)}.of(...a))` : `${this.variantRef(m.decl, v)}.v`;
      }
      case "static-field": return `${this.typeRef(m.decl ?? m.f.owner)}.${m.f.js}`;
      case "static-getter": return m.fn.native ? `${this.nat(m.fn.native)}()` : `${this.typeRef(m.decl)}.${m.fn.js}`;
      case "static-method": {
        const f: FnInfo = m.cands[0].fn;
        return f.native ? this.nat(f.native) : `${this.typeRef(m.decl)}.${f.js}.bind(${this.typeRef(m.decl)})`;
      }
      case "foreign-attr": return `${this.nat("std.foreign.$attr")}(${this.ex(e.obj)}, ${q(m.name)})`;
    }
    return `${this.ex(e.obj)}.${this.ck.memberJs(e.name)}`;
  }

  implicit(e: Extract<A.Expr, { k: "implicit" }>): string {
    const iv = (e as any).variant;
    if (iv) {
      const v: VariantInfo = iv.v;
      const ref = this.variantRef(iv.decl, v);
      if (e.args) return `${ref}.of(${this.argList((e as any).call, e.args)})`;
      return `${ref}.v`;
    }
    const info = (e as any).call;
    if (info && e.args) return this.call(e as any);
    const sf = (e as any).staticField;
    if (sf) return `${this.typeRef(sf.decl)}.${sf.f.js}`;
    return "undefined";
  }

  // ---------- calls ----------
  argList(info: any, args: A.Arg[]): string {
    if (!info || !info.ordered) return args.map((a) => this.ex(a.value)).join(", ");
    const out: string[] = (info.ordered as (A.Arg | undefined)[]).map((a) => (a ? this.ex(a.value) : "undefined"));
    const extraKw = (info.extraKw as A.Arg[] | undefined) ?? [];
    if (extraKw.length && info.fn) {
      const ni = (info.fn as FnInfo).params.findIndex((p) => p.name === "named");
      if (ni >= 0) {
        while (out.length <= ni) out.push("undefined");
        const entries = extraKw.map((a) => `[${q(a.name!)}, ${this.ex(a.value)}]`).join(", ");
        const prev = out[ni] !== "undefined" ? `...${out[ni]}, ` : "";
        out[ni] = `new Map([${prev}${entries}])`;
      }
    }
    while (out.length && out[out.length - 1] === "undefined") out.pop();
    // a variadic parameter slot is empty in `ordered`; rest arguments follow positionally
    const rest = ((info.rest as A.Arg[]) ?? []).map((a) => this.ex(a.value));
    if (rest.length) {
      const variadicAt = info.fn ? info.fn.params.length - 1 : out.length;
      while (out.length < variadicAt) out.push("undefined");
      return [...out.slice(0, variadicAt), ...rest].join(", ");
    }
    return out.join(", ");
  }

  private foreignArgPair(args: A.Arg[]): { pos: string; named: string } {
    const pos = args.filter((a) => a.name === undefined).map((a) => this.ex(a.value));
    const kw = args.filter((a) => a.name !== undefined).map((a) => `[${q(a.name!)}, ${this.ex(a.value)}]`);
    return { pos: `[${pos.join(", ")}]`, named: kw.length ? `new Map([${kw.join(", ")}])` : "new Map()" };
  }

  call(e: Extract<A.Expr, { k: "call" }>): string {
    const ex = (e as any).extract as { kinds: string[]; filter?: A.Expr } | undefined;
    if (ex) return `${this.nat("String.extract")}(${this.ex((e.callee as Extract<A.Expr, { k: "member" }>).obj)}, ${JSON.stringify(ex.kinds)}${ex.filter ? ", " + this.ex(ex.filter) : ""})`;
    const info = (e as any).call;
    const c = e.callee;
    if (!info) return `${this.ex(c)}(${e.args.map((a) => this.ex(a.value)).join(", ")})`;
    if (info.kind === "foreign-method") {
      const mem = c as Extract<A.Expr, { k: "member" }>;
      const { pos, named } = this.foreignArgPair(e.args);
      return `${this.nat("std.foreign.$call")}(${this.ex(mem.obj)}, ${q(info.name)}, ${pos}, ${named})`;
    }
    if (info.kind === "foreign-invoke") {
      const { pos, named } = this.foreignArgPair(e.args);
      return `${this.nat("std.foreign.$invoke")}(${this.callee(c)}, ${pos}, ${named})`;
    }
    const args = this.argList(info, e.args);
    const fn: FnInfo | undefined = info.fn;
    switch (info.kind) {
      case "value": return `${this.callee(c)}(${args})`;
      case "variant": return `${this.variantRef(info.decl, info.v)}.of(${args})`;
      case "fn": return fn!.native ? `${this.nat(fn!.native)}(${args})` : `${this.fnRef(fn!)}(${args})`;
      case "ctor": {
        const d: TypeDecl = info.decl;
        if (fn!.native) return `${this.nat(fn!.native)}(${args})`;
        return `new ${this.typeRef(d)}().${fn!.js}(${args})`;
      }
      case "super-init": return `super.${fn!.js}(${args})`;
      case "super-method": return `super.${fn!.js}(${args})`;
      case "static-method": {
        if (fn!.native) return `${this.nat(fn!.native)}(${args})`;
        return `${this.typeRef(fn!.owner ?? info.decl)}.${fn!.js}(${args})`;
      }
      case "method": {
        const mem = c as Extract<A.Expr, { k: "member" }>;
        const recv = this.ex(mem.obj);
        if (fn!.native) return `${this.nat(fn!.native)}(${[recv, args].filter(Boolean).join(", ")})`;
        if ((fn as any).ext) return `${this.fnRef(fn!)}(${[recv, args].filter(Boolean).join(", ")})`;
        if ((mem as any).dyn) return `$d(${[recv, q(fn!.js), args].filter(Boolean).join(", ")})`;
        if ((fn as any).synth === "with") return `${recv}.with_(${args})`;
        return `${recv}.${fn!.js}(${args})`;
      }
    }
    return `${this.callee(c)}(${args})`;
  }
  callee(c: A.Expr): string {
    const s = this.ex(c);
    return c.k === "lambda" || c.k === "ternary" || c.k === "match" ? `(${s})` : s;
  }

  // ---------- lambdas ----------
  lambdaCode(e: Extract<A.Expr, { k: "lambda" }>): string {
    const async = !!e.async;
    const frame: Frame = { temps: 0, async, gen: false, selfJs: this.fr.selfJs };
    this.frames.push(frame);
    const ps = e.params.map((p) => ((p as any).js ?? jsId(p.name)) + (p.default ? ` = ${this.ex(p.default)}` : "")).join(", ");
    let inner: string;
    const prop = (e as any).usesPropagate;
    const info = (e as any).fnInfo as FnInfo | undefined;
    const propagate = prop || (info as any)?.usesPropagate;
    if (e.body.k === "block") inner = this.block(e.body);
    else inner = `\nreturn ${this.ex(e.body)};`;
    inner = this.paramBinds(e.params) + inner;
    this.frames.pop();
    const decl = this.tempDecl(frame);
    const body = propagate ? `${decl}\n$tick();\ntry {${inner}\n} catch ($e) { if ($e instanceof $Early) return $e.value; throw $e; }` : `${decl}\n$tick();${inner}`;
    return `${async ? "async " : ""}(${ps}) => {${body}\n}`;
  }

  // ---------- comprehensions: nested for/if loops inside an IIFE; push/set go through the natives (collection limit) ----------
  compCode(e: Extract<A.Expr, { k: "comp" }>): string {
    const r = this.temp();
    let inner = e.kind === "list" ? `$n["Array.push"](${r}, ${this.ex(e.elem)});` : `$n["Map.set"](${r}, ${this.ex(e.key!)}, ${this.ex(e.elem)});`;
    for (const c of [...e.clauses].reverse()) {
      if (c.k === "if") { inner = `if (${this.ex(c.cond)}) {\n${inner}\n}`; continue; }
      const simple = c.pat.k === "bind" && !c.pat.sub;
      const v = simple ? (c.pat as any).js : this.temp();
      const itT = prune(this.tyOf(c.iter));
      const iterable = itT.k === "app" && itT.decl.builtin && itT.decl.name === "Array" ? this.ex(c.iter) : `$iter(${this.ex(c.iter)})`;
      inner = `for (const ${v} of ${iterable}) {\n$tick();${simple ? "" : this.patBinds(c.pat, v)}\n${inner}\n}`;
    }
    const code = `${r} = ${e.kind === "list" ? "[]" : "new Map()"};\n${inner}\nreturn ${r};`;
    if (this.containsAwait(e) && this.fr.async) return `(await (async () => {${code}\n})())`;
    if (this.containsYield(e) && this.fr.gen) return `(yield* (function* () {${code}\n}).call(this))`;
    return `(() => {${code}\n})()`;
  }

  // ---------- match as expression ----------
  matchExpr(e: Extract<A.Expr, { k: "match" }>): string {
    const hasAwait = this.containsAwait(e.subject) || e.arms.some((a) => this.containsAwait(a.body) || (a.guard && this.containsAwait(a.guard)));
    const hasYield = this.containsYield(e.subject) || e.arms.some((a) => this.containsYield(a.body) || (a.guard && this.containsYield(a.guard)));
    const code = this.matchStmt(e.subject, e.arms, true);
    if (hasAwait && this.fr.async) return `(await (async () => {${code}\n})())`;
    if (hasYield && this.fr.gen) return `(yield* (function* () {${code}\n}).call(this))`;
    return `(() => {${code}\n})()`;
  }

  containsAwait(n: any): boolean { return this.scan(n, (x) => x.k === "await"); }
  containsYield(n: any): boolean { return this.scan(n, (x) => x.k === "yield"); }
  private scan(n: any, pred: (x: any) => boolean, seen = new Set<any>()): boolean {
    if (!n || typeof n !== "object" || seen.has(n)) return false;
    seen.add(n);
    if (Array.isArray(n)) return n.some((x) => this.scan(x, pred, seen));
    if (typeof n.k === "string" && pred(n)) return true;
    if (n.k === "lambda") return false; // closures have their own async/gen context
    for (const key of Object.keys(n)) {
      if (SKIP_KEYS.has(key)) continue;
      if (this.scan(n[key], pred, seen)) return true;
    }
    return false;
  }
}
const SKIP_KEYS = new Set(["span", "ty", "sym", "call", "mres", "info", "decl", "v", "isTy", "matchTy", "opFn", "rewritten", "restInfo", "inst", "variant", "constant", "src", "fn", "lambda", "staticField"]);
function isPrimVoid(t: Ty): boolean { const p = prune(t); return p.k === "prim" && p.name === "Void"; }
