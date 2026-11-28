import { VALUE_WORDS, TYPE_WORDS, MODULE_WORDS } from "./habits";
import * as A from "./ast";
import { Diagnostic, Span, closest } from "./diag";
import { EXTRACT_KINDS } from "./extract";
const EXTRACT_KINDS_ALL = new Set<string>(EXTRACT_KINDS);
import {
  Ty, T, TypeDecl, FnInfo, FieldInfo, ModuleInfo, GlobalInfo, VariantInfo, ExtInfo,
  prune, show, subst, app, opt, fnTy, freshVar, mkParam, occurs, same, supertypes, isNum, isPrim, containsVar, collectVars,
} from "./types";

// ---------- scopes ----------
export interface LocalInfo { name: string; ty: Ty; mutable: boolean; js: string; span: Span; kind: "local" | "param" | "self"; used: boolean; narrowedFrom?: Ty; captured?: boolean }
export class Scope {
  vars = new Map<string, LocalInfo>();
  constructor(readonly parent?: Scope, readonly isFnRoot = false) {}
  lookup(n: string): LocalInfo | undefined { return this.vars.get(n) ?? this.parent?.lookup(n); }
  lookupHere(n: string) { return this.vars.get(n); }
}
export interface FnCtx {
  ret: Ty; retDeclared: boolean; async: boolean; gen: boolean; yieldTy?: Ty; usesPropagate: boolean;
  isLambda: boolean; returns: { ty: Ty; span: Span }[]; info?: FnInfo; isInit?: boolean; selfAssigned?: Set<string>;
  mutatesCaptured?: boolean;
}
export interface Ctx {
  mod: ModuleInfo; tparams: Map<string, Ty>; scope: Scope; fn?: FnCtx; cls?: TypeDecl; selfTy?: Ty;
  inStatic?: boolean; loopDepth: number; extTarget?: Ty;
  /** labels of the enclosing loops, innermost last (`outer: for`); reset inside closures like loopDepth */
  labels?: string[];
}

export const JS_RESERVED = new Set(("break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await async arguments eval undefined NaN Infinity Object Array Map Set Promise Symbol BigInt Number String Boolean Error Math JSON Date RegExp Function globalThis process require module exports console constructor prototype __proto__ toString valueOf hasOwnProperty Reflect Proxy WeakMap WeakSet Atomics Buffer").split(" "));
export const jsId = (n: string) => (JS_RESERVED.has(n) ? n + "_" : n);

const PRIMS: Record<string, Ty> = { Int: T.Int, Float: T.Float, Bool: T.Bool, String: T.String, Char: T.Char, Void: T.Void, Never: T.Never, Any: T.Any };

export interface CheckOptions { maxErrors?: number }

export class Checker {
  diags: Diagnostic[] = [];
  /** modules the project's Python/npm packages provide (ply.lock), for did-you-mean on a missing import */
  foreignNames: string[] = [];
  modules = new Map<string, ModuleInfo>();
  order: ModuleInfo[] = [];
  prelude!: ModuleInfo;
  private fnId = 0;
  private pendingBodies: (() => void)[] = [];
  private unresolvedVars: { v: Ty; span: Span; what: string }[] = [];
  private declId = 0;
  private currentCheckingFn?: FnInfo;

  constructor(readonly opts: CheckOptions = {}) {}

  // ---------- diagnostics ----------
  err(span: Span | undefined, code: string, message: string, extra: { why?: string; suggestion?: string; notes?: string[] } = {}): Ty {
    if (this.diags.filter((d) => d.severity === "error").length >= (this.opts.maxErrors ?? 100)) return T.err;
    if (this.currentCheckingFn && (this.currentCheckingFn as any).hasUntypedParams && (this.currentCheckingFn as any).callSites?.length) {
      const site = (this.currentCheckingFn as any).callSites[0];
      const pos = site.span ? site.span.src.pos(site.span.start) : undefined;
      const locStr = pos ? `${site.span.src.name}:${pos.line}:${pos.col}` : "call site";
      (extra.notes ??= []).push(`in call from ${locStr}`);
      if (!extra.why) extra.why = `parameter types were inferred from call site at ${locStr}`;
      if (!extra.suggestion) extra.suggestion = `declare parameter types on \`fn ${this.currentCheckingFn.name}(...)\` or check the call at ${locStr}`;
    }
    // A beginner reads the headline first: a near-miss name goes there ("cannot find `prnt` — did you mean `print`?")
    const dym = /^did you mean `([^`]+)`\?$/.exec(extra.suggestion ?? "");
    if (dym) { message = `${message.replace(/ in this scope$/, "")} — did you mean \`${dym[1]}\`?`; extra = { ...extra, suggestion: `change it to \`${dym[1]}\`` }; }
    this.diags.push({ severity: "error", code, message, span, ...extra });
    return T.err;
  }
  warn(span: Span | undefined, code: string, message: string, extra: { why?: string; suggestion?: string } = {}) {
    this.diags.push({ severity: "warning", code, message, span, ...extra });
  }

  // ======================================================================
  // Phase 1: declare modules
  // ======================================================================
  addModule(name: string, file: string, ast: A.Module, isStd: boolean, deps: string[]): ModuleInfo {
    const m: ModuleInfo = {
      name, path: name, file, ast, imports: new Map(), types: new Map(), fns: new Map(), globals: new Map(), exts: [], deps,
      js: name.replace(/[^A-Za-z0-9_]/g, "_"), isStd, checked: false,
    };
    this.modules.set(name, m);
    if (name === "prelude") this.prelude = m;
    return m;
  }

  /** Check all modules, which must be added in dependency order (dependencies first). */
  checkAll(mods: ModuleInfo[]) {
    this.order.push(...mods);
    for (const m of mods) this.declareTypes(m);
    for (const m of mods) this.bindImports(m, 1);       // modules and types: needed to resolve signatures
    for (const m of mods) this.resolveTypeHeaders(m);
    for (const m of mods) this.resolveMembers(m);
    for (const m of mods) this.bindImports(m, 2);       // functions and globals exist now
    for (const m of mods) this.queueBodies(m);
    // bodies may enqueue more (lazy inference); drain until empty
    while (this.pendingBodies.length) this.pendingBodies.shift()!();
    const checkUntypedFn = (f: FnInfo) => {
      if (!(f as any).hasUntypedParams) return;
      for (const up of (f as any).untypedParams) {
        const pt = prune(f.params[up.index].ty);
        if (pt.k === "var") {
          const calls: { span: Span }[] = (f as any).callSites ?? [];
          if (calls.length) {
            const site = calls[0];
            const pos = site.span ? site.span.src.pos(site.span.start) : undefined;
            const locStr = pos ? `${site.span.src.name}:${pos.line}:${pos.col}` : "call site";
            this.err(up.param.span, "E0221", `cannot infer type of parameter \`${up.name}\` of \`${f.name}\` from call site at ${locStr}`, {
              why: `call site at ${locStr} does not determine a concrete type for \`${up.name}\``,
              suggestion: `write \`${up.name}: Type\``,
            });
          } else {
            this.err(up.param.span, "E0221", `parameter \`${up.name}\` needs a type`, {
              why: "cannot infer parameter type without a call site",
              suggestion: `write \`${up.name}: Type\``,
            });
          }
        }
      }
    };
    for (const m of mods) {
      for (const [, g] of m.fns) for (const f of g) checkUntypedFn(f);
      for (const [, d] of m.types) for (const list of [...d.methods.values(), ...d.statics.values()]) for (const f of list) checkUntypedFn(f);
      for (const e of m.exts) for (const list of e.methods.values()) for (const f of list) checkUntypedFn(f);
    }
    const reported = new Set<string>();
    for (const u of this.unresolvedVars) {
      if (prune(u.v).k === "var") {
        const key = `${u.span.src.name}:${u.span.start}:${u.what}`;
        if (!reported.has(key)) {
          reported.add(key);
          this.err(u.span, "E0230", `cannot infer the type of ${u.what}`, { why: "nothing in the program fixes this type", suggestion: "add a type annotation, e.g. `var items: [Int] = []`" });
        }
      }
    }
    for (const m of mods) m.checked = true;
  }

  private declareTypes(m: ModuleInfo) {
    for (const d of m.ast!.decls) {
      if (d.k === "class" || d.k === "interface" || d.k === "enum" || d.k === "alias") {
        const name = d.name;
        if (m.types.has(name)) { this.err(d.span, "E0201", `${name} is declared twice in module ${m.name}`, { suggestion: "rename one of them" }); continue; }
        const kind = d.k === "class" ? ((d as any).extern ? "extern" : d.struct ? "struct" : "class") : d.k === "interface" ? "interface" : d.k === "enum" ? "enum" : "class";
        const decl: TypeDecl = {
          id: `${m.name}.${name}#${++this.declId}`, name, kind: kind as TypeDecl["kind"], params: [], ifaces: [], fields: new Map(), methods: new Map(),
          statics: new Map(), getters: new Map(), setters: new Map(), module: m, pub: d.pub || m === this.prelude, ast: d, js: jsId(name), ctors: [], resolved: false,
          builtin: m === this.prelude,
        };
        if (d.k === "alias") decl.alias = { params: [], target: d.type, scope: undefined };
        if (d.k === "interface") decl.abstractIface = true;
        m.types.set(name, decl);
      }
    }
  }

  private bindImports(m: ModuleInfo, phase: 1 | 2) {
    const canon = (name: string, d: Extract<A.Decl, { k: "import" }>) => (!d.flag && !d.quoted && !this.modules.has(name) && this.modules.has(`std.${name}`) ? `std.${name}` : name);
    for (const d of m.ast!.decls) {
      if (d.k !== "import") continue;
      const full = d.path.join(".");
      const target = this.modules.get(canon(full, d));
      const bindMember = (modName: string, member: string, alias: string | undefined, span: Span) => {
        const mod = this.modules.get(modName);
        if (!mod) return false;
        const name = alias ?? member;
        const t = mod.types.get(member), f = mod.fns.get(member), g = mod.globals.get(member);
        if (phase === 1 && !t) return true;                 // values are bound in phase 2
        if (phase === 2 && t) return true;                  // types were bound in phase 1
        if (!t && !f && !g) {
          const near = closest(member, [...mod.types.keys(), ...mod.fns.keys(), ...mod.globals.keys()]);
          this.err(span, "E0202", `module ${modName} has no member \`${member}\``, { suggestion: near ? `did you mean \`${near}\`?` : `members of ${modName}: ${[...mod.types.keys(), ...mod.fns.keys(), ...mod.globals.keys()].filter((k) => this.isPub(mod, k)).join(", ") || "(none exported)"}` });
          return true;
        }
        if (!this.isPub(mod, member)) {
          this.err(span, "E0203", `\`${member}\` is private to module ${modName}`, { why: "only declarations marked `pub` can be imported", suggestion: `add \`pub\` to the declaration of ${member} in ${mod.file}` });
          return true;
        }
        if ((m.types.has(name) || m.fns.has(name) || m.globals.has(name)) && m.ast!.decls.some((x) => (x.k === "class" || x.k === "enum" || x.k === "interface" || x.k === "alias" ? x.name === name : x.k === "fn" ? x.fn.name === name : x.k === "let" && (x.stmt.pat as any).name === name))) {
          this.err(span, "E0206", `the imported name \`${name}\` conflicts with a declaration in this module`, { suggestion: `import it under another name: \`from ${modName} import ${member} as ${name}2\`` });
          return true;
        }
        if (t) m.imports.set(name, { kind: "type", decl: t });
        else if (f) m.imports.set(name, { kind: "fn", fns: f });
        else if (g) m.imports.set(name, { kind: "global", g });
        return true;
      };
      if (target && !d.names && !d.all) { if (phase === 1) m.imports.set(d.alias ?? d.path[d.path.length - 1], { kind: "module", mod: target }); continue; }
      if (target && (d.names || d.all)) {
        if (d.all) { for (const k of [...target.types.keys(), ...target.fns.keys(), ...target.globals.keys()]) if (this.isPub(target, k)) bindMember(target.name, k, undefined, d.span); }
        else for (const n of d.names!) bindMember(target.name, n.name, n.alias, n.span);
        continue;
      }
      // `import a.b.member`: module a.b, member `member`
      if (!target && d.path.length > 1) {
        const parent = canon(d.path.slice(0, -1).join("."), d);
        if (this.modules.has(parent)) {
          bindMember(parent, d.path[d.path.length - 1], d.alias, d.span);
          continue;
        }
      }
      if (phase === 2) continue;
      const near = closest(full, [...this.modules.keys()].filter((k) => !k.includes(":") && k !== "prelude").map((k) => (k.startsWith("std.") ? k.slice(4) : k)).concat(this.foreignNames));
      const install = `if it is a Python, npm, or Java package, install it (\`ply install ${d.path[0]} --python|--npm|--java\`) or add \`--python\`/\`--npm\`/\`--java\` to the import`;
      this.err(d.span, "E0204", Object.prototype.hasOwnProperty.call(MODULE_WORDS, full) ? MODULE_WORDS[full] : `cannot find module \`${full}\``, { suggestion: near ? `did you mean \`${near}\`? — or ${install}` : `check the path (modules are files under src/: src/models/user.myc is \`models.user\`; built-ins: \`import json\`); ${install}` });
    }
  }

  isPub(mod: ModuleInfo, name: string): boolean {
    return !!(mod.types.get(name)?.pub || mod.fns.get(name)?.some((f) => f.pub) || mod.globals.get(name)?.pub);
  }

  // ---------- type resolution ----------
  typeScope(m: ModuleInfo, tparams: Map<string, Ty>): Ctx {
    return { mod: m, tparams, scope: new Scope(), loopDepth: 0 };
  }

  lookupTypeDecl(name: string, cx: Pick<Ctx, "mod">): TypeDecl | undefined {
    const own = cx.mod.types.get(name);
    if (own) return own;
    const imp = cx.mod.imports.get(name);
    if (imp?.kind === "type") return imp.decl;
    return this.prelude?.types.get(name);
  }
  primDecl(name: string): TypeDecl | undefined { return this.prelude.types.get(name); }
  preludeType(name: string, args: Ty[] = []): Ty { const d = this.prelude.types.get(name)!; return app(d, args); }
  arrayOf(t: Ty): Ty { return this.preludeType("Array", [t]); }
  mapOf(k: Ty, v: Ty): Ty { return this.preludeType("Map", [k, v]); }
  setOf(t: Ty): Ty { return this.preludeType("Set", [t]); }
  resultOf(t: Ty, e: Ty): Ty { return this.preludeType("Result", [t, e]); }
  taskOf(t: Ty): Ty { return this.preludeType("Task", [t]); }

  resolveType(te: A.TypeExpr, cx: Pick<Ctx, "mod" | "tparams">, allowInfer = false): Ty {
    switch (te.k) {
      case "optional": { const i = this.resolveType(te.inner, cx); if (prune(i).k === "opt") { this.err(te.span, "E0210", "nested optional types are not supported", { why: "`T??` is ambiguous at runtime because nil is a single value", suggestion: "use a single `T?` or wrap in a Result" }); return i; } return opt(i); }
      case "array": return this.arrayOf(this.resolveType(te.elem, cx));
      case "map": {
        const k = this.resolveType(te.key, cx), v = this.resolveType(te.val, cx);
        this.checkKey(k, te.key.span);
        return this.mapOf(k, v);
      }
      case "tuple": return { k: "tuple", elems: te.elems.map((e) => this.resolveType(e, cx)) };
      case "fn": return fnTy(te.params.map((e) => this.resolveType(e, cx)), this.resolveType(te.ret, cx));
      case "named": {
        if (te.path.length > 1) {
          const imp = cx.mod.imports.get(te.path[0]);
          if (imp?.kind === "module" && te.path.length === 2) {
            const d = imp.mod.types.get(te.name);
            if (!d) return this.err(te.span, "E0211", `module ${imp.mod.name} has no type \`${te.name}\``, { suggestion: closest(te.name, imp.mod.types.keys()) ? `did you mean \`${closest(te.name, imp.mod.types.keys())}\`?` : undefined });
            if (!d.pub && imp.mod !== cx.mod) this.err(te.span, "E0203", `type \`${te.name}\` is private to module ${imp.mod.name}`, { suggestion: "mark it `pub`" });
            return this.instantiateDeclType(d, te, cx);
          }
          return this.err(te.span, "E0211", `cannot resolve type \`${te.path.join(".")}\``, { suggestion: `import the module first, e.g. \`import ${te.path.slice(0, -1).join(".")}\`` });
        }
        const tp = cx.tparams.get(te.name);
        if (tp) { if (te.args.length) this.err(te.span, "E0212", `type parameter ${te.name} takes no type arguments`); return tp; }
        const prim = PRIMS[te.name];
        if (prim && (!cx.mod.types.has(te.name) || cx.mod === this.prelude)) { if (te.args.length) this.err(te.span, "E0212", `${te.name} takes no type arguments`); return prim; }
        const d = this.lookupTypeDecl(te.name, cx);
        if (!d) {
          const cands = [...cx.tparams.keys(), ...Object.keys(PRIMS), ...cx.mod.types.keys(), ...[...cx.mod.imports].filter(([, b]) => b.kind === "type").map(([k]) => k), ...(this.prelude?.types.keys() ?? [])];
          const near = closest(te.name, cands);
          if (Object.prototype.hasOwnProperty.call(TYPE_WORDS, te.name)) return this.err(te.span, "E0211", TYPE_WORDS[te.name], { why: `no type named \`${te.name}\` exists in Mycel`, suggestion: "see `mycel help habits`" });
          return this.err(te.span, "E0211", `unknown type \`${te.name}\``, { why: "no type with this name is declared or imported in this module", suggestion: near ? `did you mean \`${near}\`?` : "declare it with class/struct/enum/interface, or import it" });
        }
        return this.instantiateDeclType(d, te, cx);
      }
    }
  }

  private instantiateDeclType(d: TypeDecl, te: Extract<A.TypeExpr, { k: "named" }>, cx: Pick<Ctx, "mod" | "tparams">): Ty {
    if (d.alias) return this.resolveAlias(d, te.args.map((a) => this.resolveType(a, cx)), te);
    const args = te.args.map((a) => this.resolveType(a, cx));
    this.ensureHeader(d);
    if (args.length !== d.params.length) {
      if (args.length === 0 && d.params.length > 0) return this.err(te.span, "E0212", `${d.name} needs ${d.params.length} type argument${d.params.length > 1 ? "s" : ""}: ${d.name}<${d.params.map((p) => p.name).join(", ")}>`, { suggestion: `write ${d.name}<${d.params.map((p) => p.name === "T" ? "Int" : p.name).join(", ")}> with concrete types` });
      return this.err(te.span, "E0212", `${d.name} takes ${d.params.length} type argument${d.params.length === 1 ? "" : "s"}, but ${args.length} given`, { suggestion: `write ${d.name}<${d.params.map((p) => p.name).join(", ")}>` });
    }
    d.params.forEach((p, i) => this.checkBounds(p, args[i], te.span));
    return app(d, args);
  }

  private resolveAlias(d: TypeDecl, args: Ty[], te: A.TypeExpr): Ty {
    const al = d.alias!;
    if (al.resolving) return this.err(te.span, "E0213", `type alias ${d.name} refers to itself`, { suggestion: "break the cycle with a class or enum" });
    this.ensureHeader(d);
    if (args.length !== al.params.length) return this.err(te.span, "E0212", `type alias ${d.name} takes ${al.params.length} type argument(s), but ${args.length} given`);
    al.resolving = true;
    const tparams = new Map<string, Ty>();
    al.params.forEach((p) => tparams.set(p.name, p));
    const target = this.resolveType(al.target, { mod: d.module, tparams });
    al.resolving = false;
    const m = new Map<Ty, Ty>(); al.params.forEach((p, i) => m.set(p, args[i]));
    return subst(target, m);
  }

  checkKey(k: Ty, span: Span) {
    k = prune(k);
    const okPrim = k.k === "prim" && ["Int", "String", "Char", "Bool", "Float"].includes(k.name);
    if (!okPrim && k.k !== "err" && k.k !== "var" && k.k !== "param") {
      this.err(span, "E0214", `${show(k)} cannot be a map key or set element`, { why: "keys are compared by JS identity, which is only correct for Int, String, Char, Bool and Float", suggestion: `use one of those, e.g. a String id: ${show(k)}.id` });
    }
  }

  private checkBounds(p: Extract<Ty, { k: "param" }>, arg: Ty, span: Span) {
    for (const b of p.bounds) {
      if (!this.conforms(arg, b)) this.err(span, "E0215", `${show(arg)} does not satisfy the bound ${show(p)}: ${show(b)}`, { why: `${show(arg)} must conform to ${show(b)}`, suggestion: `declare \`${show(arg)}: ${show(b)}\` (or use \`extend ${show(arg)}: ${show(b)} { }\`)` });
    }
  }

  /** Does `t` conform to interface/class type `b` (nominally, via declared supertypes and extensions)? */
  conforms(t0: Ty, b0: Ty): boolean {
    const t = prune(t0), b = prune(b0);
    if (t.k === "err" || b.k === "err" || t.k === "var") return true;
    if (b.k !== "app") return this.assignable(t, b);
    if (t.k === "param") return t.bounds.some((x) => this.conforms(x, b));
    if (t.k === "opt" || t.k === "nil") return false;
    const base = this.declTypeOf(t);
    if (!base) return false;
    if (supertypes(base).some((s) => s.decl === b.decl)) return true;
    for (const m of this.order) for (const e of m.exts) {
      if (e.ifaces.some((i) => { const ii = prune(i); return ii.k === "app" && ii.decl === b.decl; }) && this.extMatches(e, t)) return true;
    }
    return false;
  }

  /** The nominal type (as app) a value of type t has, for member lookup. */
  declTypeOf(t0: Ty): Extract<Ty, { k: "app" }> | undefined {
    const t = prune(t0);
    if (t.k === "app") return t;
    if (t.k === "prim" && t.name !== "Void" && t.name !== "Never" && t.name !== "Any") { const d = this.primDecl(t.name); return d ? app(d) as any : undefined; }
    return undefined;
  }

  private extMatches(e: ExtInfo, t: Ty): boolean {
    const m = new Map<Ty, Ty>(); e.params.forEach((p) => m.set(p, freshVar()));
    const target = subst(e.target, m);
    return this.canAssign(t, target);
  }

  // ---------- headers: type params, supertypes ----------
  private ensureHeader(d: TypeDecl) {
    if (d.resolved) return;
    d.resolved = true;
    const ast = d.ast!;
    const tps = (ast as any).typeParams as A.TypeParam[] | undefined ?? [];
    const tparams = new Map<string, Ty>();
    for (const tp of tps) {
      const p = mkParam(tp.name);
      d.params.push(p);
      tparams.set(tp.name, p);
    }
    if (d.alias) d.alias.params = d.params;
    const cx = { mod: d.module, tparams };
    tps.forEach((tp, i) => { d.params[i].bounds = tp.bounds.map((b) => this.resolveType(b, cx)); });
    (d as any).tparams = tparams;
    if (ast.k === "class" || ast.k === "enum") {
      const sups = ast.k === "class" ? ast.ifaces : ast.ifaces;
      for (const s of sups) {
        const t = prune(this.resolveType(s, cx));
        if (t.k !== "app") { if (t.k !== "err") this.err(s.span, "E0216", `${d.name} cannot inherit from ${show(t)}`); continue; }
        if (t.decl.kind === "interface" || t.decl === undefined) d.ifaces.push(t);
        else if (t.decl.kind === "class" || t.decl.kind === "extern") {
          if (d.kind !== "class" || d.base || sups.indexOf(s) !== 0) { this.err(s.span, "E0216", `${d.name} can only inherit from one class, and it must be listed first`, { suggestion: "list the base class first, then interfaces: `class Dog: Animal, Printable`" }); continue; }
          if (t.decl === d) { this.err(s.span, "E0216", `${d.name} cannot inherit from itself`); continue; }
          d.base = t;
        } else this.err(s.span, "E0216", `${d.name} cannot inherit from ${t.decl.kind} ${t.decl.name}`, { why: "structs and enums are final", suggestion: "use a class or an interface" });
      }
    }
    if (ast.k === "interface") {
      for (const s of ast.extends) { const t = prune(this.resolveType(s, cx)); if (t.k === "app" && t.decl.kind === "interface") d.ifaces.push(t); else if (t.k !== "err") this.err(s.span, "E0216", `interface ${d.name} can only extend interfaces`); }
    }
    // cycle check
    let cur = d.base?.decl;
    for (let n = 0; cur && n < 100; n++) { if (cur === d) { this.err(ast.span, "E0216", `inheritance cycle through ${d.name}`); d.base = undefined; break; } cur = cur.base?.decl; }
  }

  private resolveTypeHeaders(m: ModuleInfo) { for (const d of m.types.values()) this.ensureHeader(d); }

  // ======================================================================
  // Phase 2: members (fields, method signatures, functions, globals, extensions)
  // ======================================================================
  memberJs(n: string): string {
    if (n.startsWith("operator ")) {
      const names: Record<string, string> = { "+": "add", "-": "sub", "*": "mul", "/": "div", "//": "floordiv", "%": "mod", "==": "eq", "<": "lt", "[]": "idx", "**": "pow", "&": "and", "|": "or", "^": "xor", "<<": "shl", ">>": "shr" };
      return "$op_" + (names[n.slice(9)] ?? "x");
    }
    return ["constructor", "__proto__", "prototype", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toJSON", "then", "catch", "finally"].includes(n) ? n + "_" : jsId(n);
  }

  private sigKey(f: FnInfo): string { return f.params.map((p) => show(p.ty).replace(/[^A-Za-z0-9]/g, "_")).join("$"); }

  /** Give overloaded groups distinct JS names (`name$Int`, `name$String`). */
  private assignJs(group: FnInfo[], member: boolean) {
    const base = (n: string) => (member ? this.memberJs(n) : jsId(n));
    if (group.length === 1) { group[0].js = base(group[0].name); return; }
    for (const f of group) f.js = base(f.name) + "$" + (this.sigKey(f) || "0");
    // two overloads with identical parameter types are indistinguishable
    const seen = new Map<string, FnInfo>();
    for (const f of group) {
      const k = this.sigKey(f);
      if (seen.has(k) && f.decl) this.err(f.decl.span, "E0220", `\`${f.name}\` is declared twice with the same parameter types`, { suggestion: "give the overloads different parameter types or counts" });
      seen.set(k, f);
    }
  }

  makeFn(fd: A.FnDecl, owner: TypeDecl | undefined, mod: ModuleInfo, outer: Map<string, Ty>, extra: Partial<FnInfo> = {}): FnInfo {
    const tparams = new Map(outer);
    const tps = fd.typeParams.map((tp) => { const p = mkParam(tp.name); tparams.set(tp.name, p); return p; });
    fd.typeParams.forEach((tp, i) => { tps[i].bounds = tp.bounds.map((b) => this.resolveType(b, { mod, tparams })); });
    const untypedParams: { name: string; param: A.Param; ty: Ty; index: number }[] = [];
    const params = fd.params.map((p, i) => {
      let ty: Ty;
      if (p.type) ty = this.resolveType(p.type, { mod, tparams });
      else if (fd.extern || (extra as any).sigOnly) ty = this.err(p.span, "E0221", `parameter \`${p.name}\` needs a type`, { why: "extern functions and interfaces cannot infer parameter types", suggestion: `write \`${p.name}: Type\`` });
      else {
        ty = freshVar();
        untypedParams.push({ name: p.name, param: p, ty, index: i });
      }
      if (p.variadic) ty = this.arrayOf(ty);
      return { name: p.name, ty, hasDefault: !!p.default, variadic: p.variadic };
    });
    let ret: Ty;
    if (fd.ret) ret = this.resolveType(fd.ret, { mod, tparams });
    else if (fd.extern || fd.isInit) ret = T.Void;
    else if (fd.accessor === "set") ret = T.Void;
    else ret = freshVar();
    if (fd.gen && fd.ret) { /* declared Gen<T> / Iterator<T> */ }
    const info: FnInfo = {
      name: fd.name, js: fd.name, params, ret, typeParams: tps, async: fd.async, gen: fd.gen, vis: fd.vis ?? "public", static: !!fd.static,
      owner, module: mod, decl: fd, pub: fd.pub, isInit: fd.isInit, accessor: fd.accessor, override: fd.override, operator: fd.operator, id: ++this.fnId,
      ...extra,
    };
    (info as any).tparams = tparams;
    (info as any).inferRet = !fd.ret && !fd.extern && !fd.isInit && fd.accessor !== "set";
    if (untypedParams.length > 0) {
      (info as any).hasUntypedParams = true;
      (info as any).untypedParams = untypedParams;
    }
    if (fd.extern) info.native = `${mod.name === "prelude" ? "" : mod.name + "."}${owner ? owner.name + "." : ""}${fd.accessor ? fd.accessor + "_" : ""}${fd.name}`;
    return info;
  }

  private resolveMembers(m: ModuleInfo) {
    const groups = new Map<string, FnInfo[]>();
    for (const d of m.ast!.decls) {
      if (d.k === "fn") {
        const info = this.makeFn(d.fn, undefined, m, new Map(), { pub: d.pub, module: m });
        if (d.fn.async && d.fn.gen) this.err(d.fn.span, "E0222", "a function cannot be both `async` and `gen`", { suggestion: "collect results with `await` into an array, or use a Channel" });
        if (d.fn.extern) info.native = `${m.name === "prelude" ? "" : m.name + "."}${d.fn.name}`;
        const g = groups.get(d.fn.name) ?? []; g.push(info); groups.set(d.fn.name, g);
      } else if (d.k === "let") {
        this.declareGlobal(m, d);
      }
    }
    for (const [n, g] of groups) {
      if (m.types.has(n)) this.err(g[0].decl!.span, "E0201", `\`${n}\` is both a function and a type in module ${m.name}`);
      this.assignJs(g, false); m.fns.set(n, g);
    }
    for (const d of m.types.values()) this.resolveTypeMembers(d);
    for (const d of m.ast!.decls) if (d.k === "extend") this.declareExtension(m, d);
  }

  private declareGlobal(m: ModuleInfo, d: Extract<A.Decl, { k: "let" }>) {
    const s = d.stmt;
    if (s.pat.k !== "bind") { this.err(s.span, "E0223", "top-level `let` must bind a single name", { suggestion: "destructure inside a function" }); return; }
    const name = s.pat.name;
    if (m.globals.has(name) || m.fns.has(name)) { this.err(s.span, "E0201", `\`${name}\` is declared twice in module ${m.name}`); return; }
    const ty = s.type ? this.resolveType(s.type, { mod: m, tparams: new Map() }) : freshVar();
    const g: GlobalInfo = { name, ty, mutable: s.mutable, pub: d.pub, js: jsId(name), module: m, decl: d };
    (g as any).state = s.type ? "typed" : "pending";
    m.globals.set(name, g);
  }

  /** Infer an un-annotated global's type on demand. */
  /** Check the initialiser of an annotated global (references only need its declared type). */
  checkGlobalInit(g: GlobalInfo) {
    if ((g as any).state === "typed") {
      (g as any).state = "done";
      const s = (g.decl as Extract<A.Decl, { k: "let" }>).stmt;
      const cx = this.typeScope(g.module, new Map());
      cx.fn = this.topFn();
      if (!s.init) { this.err(s.span, "E0224", `\`${g.name}\` needs an initial value`); return; }
      const t = this.infer(s.init, cx, g.ty);
      if (!this.assignable(t, g.ty)) this.mismatch(s.init, t, g.ty, "initial value"); else this.coerceLit(s.init, g.ty);
    } else this.globalType(g);
  }

  globalType(g: GlobalInfo): Ty {
    const st = (g as any).state;
    if (st === "pending") {
      (g as any).state = "running";
      const s = (g.decl as Extract<A.Decl, { k: "let" }>).stmt;
      const cx = this.typeScope(g.module, new Map());
      cx.fn = this.topFn();
      if (!s.init) this.err(s.span, "E0224", `\`${g.name}\` needs an initial value`);
      else { const t = this.infer(s.init, cx, prune(g.ty).k === "var" ? undefined : g.ty); if (!this.assignable(t, g.ty)) this.mismatch(s.init, t, g.ty, "initial value"); else this.coerceLit(s.init, g.ty); }
      (g as any).state = "done";
    } else if (st === "running") {
      this.err((g.decl as any).span, "E0225", `the initial value of \`${g.name}\` depends on itself`, { suggestion: "add a type annotation or break the cycle" });
      (g as any).state = "done";
    }
    return g.ty;
  }
  topFn(): FnCtx { return { ret: T.Void, retDeclared: true, async: false, gen: false, usesPropagate: false, isLambda: false, returns: [] }; }

  private resolveTypeMembers(d: TypeDecl) {
    this.ensureHeader(d);
    const ast = d.ast!;
    const tparams: Map<string, Ty> = (d as any).tparams;
    const cx = { mod: d.module, tparams };
    const selfTy = app(d, d.params);
    if (ast.k === "alias") { return; }
    const addMethod = (map: Map<string, FnInfo[]>, f: FnInfo) => { const g = map.get(f.name) ?? []; g.push(f); map.set(f.name, g); };
    if (ast.k === "class") {
      for (const f of ast.fields) {
        if (d.fields.has(f.name)) { this.err(f.span, "E0226", `field \`${f.name}\` is declared twice in ${d.name}`); continue; }
        if (d.kind === "struct" && f.mutable) this.err(f.span, "E0227", `struct field \`${f.name}\` cannot be \`var\``, { why: "structs are immutable value types; this keeps copies and equality predictable", suggestion: `declare it \`let ${f.name}\`, or make ${d.name} a class if it needs mutable state` });
        const ty = f.type ? this.resolveType(f.type, cx) : freshVar();
        const fi: FieldInfo = { name: f.name, ty, mutable: f.mutable && d.kind !== "struct", vis: f.vis, static: f.static, owner: d, hasInit: !!f.init, js: this.memberJs(f.name), span: f.span };
        (fi as any).decl = f;
        d.fields.set(f.name, fi);
      }
      const byName = new Map<string, FnInfo[]>();
      for (const fd of ast.methods) {
        const info = this.makeFn(fd, d, d.module, tparams);
        if (fd.isInit) { info.static = false; d.ctors.push(info); continue; }
        if (fd.accessor === "get") { if (d.getters.has(fd.name)) this.err(fd.span, "E0226", `property \`${fd.name}\` is declared twice`); d.getters.set(fd.name, info); continue; }
        if (fd.accessor === "set") { d.setters.set(fd.name, info); continue; }
        if (fd.operator) info.name = "operator " + fd.operator;
        const g = byName.get(info.name) ?? []; g.push(info); byName.set(info.name, g);
      }
      for (const [, g] of byName) {
        const inst = g.filter((x) => !x.static), sta = g.filter((x) => x.static);
        if (inst.length) { this.assignJs(inst, true); for (const f of inst) addMethod(d.methods, f); }
        if (sta.length) { this.assignJs(sta, true); for (const f of sta) addMethod(d.statics, f); }
      }
      for (const f of d.fields.values()) if (f.static) { /* static fields live on the class object */ }
      this.assignCtorJs(d);
      if (d.kind === "extern") return;
      if (!d.ctors.length) this.synthesizeInit(d, ast, selfTy);
    } else if (ast.k === "interface") {
      d.ifaceGetters = new Map();
      for (const g of ast.getters) d.ifaceGetters.set(g.name, this.resolveType(g.type, cx));
      const byName = new Map<string, FnInfo[]>();
      for (const fd of ast.methods) {
        const info = this.makeFn(fd, d, d.module, tparams);
        info.abstract = !fd.body;
        if (byName.has(fd.name)) this.err(fd.span, "E0220", `interface methods cannot be overloaded (\`${fd.name}\`)`);
        byName.set(fd.name, [info]);
      }
      for (const [, g] of byName) { g[0].js = this.memberJs(g[0].name); addMethod(d.methods, g[0]); }
    } else if (ast.k === "enum") {
      d.variants = [];
      const seen = new Set<string>();
      ast.variants.forEach((v, index) => {
        if (seen.has(v.name)) this.err(v.span, "E0226", `variant \`${v.name}\` is declared twice in ${d.name}`);
        seen.add(v.name);
        d.variants!.push({ name: v.name, index, value: v.value, js: `${d.js}$${v.name}`, fields: v.fields.map((f) => ({ name: f.name, ty: this.resolveType(f.type, cx) })) });
      });
      const byName = new Map<string, FnInfo[]>();
      for (const fd of ast.methods) {
        const info = this.makeFn(fd, d, d.module, tparams);
        if (fd.accessor === "get") { d.getters.set(fd.name, info); continue; }
        if (fd.operator) info.name = "operator " + fd.operator; // enums overload operators like classes (Json's [])
        const g = byName.get(info.name) ?? []; g.push(info); byName.set(info.name, g);
      }
      for (const [, g] of byName) {
        const inst = g.filter((x) => !x.static), sta = g.filter((x) => x.static);
        if (inst.length) { this.assignJs(inst, true); for (const f of inst) addMethod(d.methods, f); }
        if (sta.length) { this.assignJs(sta, true); for (const f of sta) addMethod(d.statics, f); }
      }
    }
  }

  private assignCtorJs(d: TypeDecl) {
    if (d.ctors.length === 1) d.ctors[0].js = "$init";
    else d.ctors.forEach((c) => (c.js = "$init$" + (this.sigKey(c) || "0")));
  }

  /** Memberwise initializer: every stored field in order (base fields first), defaults optional. */
  private synthesizeInit(d: TypeDecl, ast: Extract<A.Decl, { k: "class" }>, selfTy: Ty) {
    const params: FnInfo["params"] = [];
    if (d.base) {
      const bd = d.base.decl;
      if (bd.ctors.length) {
        // inherit the base initializers when this class adds no stored fields without defaults
        const own = [...d.fields.values()].filter((f) => !f.static);
        if (own.every((f) => f.hasInit)) {
          for (const c of bd.ctors) {
            const mm = new Map<Ty, Ty>(); bd.params.forEach((p, i) => mm.set(p, d.base!.args[i] ?? T.err));
            d.ctors.push({ ...c, params: c.params.map((p) => ({ ...p, ty: subst(p.ty, mm) })), owner: d, id: ++this.fnId, js: c.js, inherited: true } as any);
          }
          return;
        }
        this.err(ast.span, "E0228", `class ${d.name} adds fields but has no \`init\`, and its base ${bd.name} has its own initializers`, { suggestion: `add \`init(...) { super.init(...); ... }\` to ${d.name}` });
        return;
      }
      for (const [, f] of this.allFieldsOf(d.base)) params.push({ name: f.name, ty: f.ty, hasDefault: f.hasInit });
    }
    for (const f of d.fields.values()) if (!f.static) params.push({ name: f.name, ty: f.ty, hasDefault: f.hasInit });
    const info: FnInfo = {
      name: "init", js: "$init", params, ret: T.Void, typeParams: [], async: false, gen: false, vis: "public", static: false, owner: d, module: d.module, pub: true,
      isInit: true, id: ++this.fnId,
    };
    (info as any).memberwise = true;
    d.ctors.push(info);
    if (d.kind === "struct") {
      const w: FnInfo = {
        name: "with", js: "with_", params: [...d.fields.values()].filter((f) => !f.static).map((f) => ({ name: f.name, ty: f.ty, hasDefault: true })), ret: selfTy, typeParams: [],
        async: false, gen: false, vis: "public", static: false, owner: d, module: d.module, pub: true, id: ++this.fnId,
      };
      (w as any).synth = "with";
      d.methods.set("with", [w]);
    }
  }

  /** All instance fields, base class first (with the base's type arguments applied). */
  allFieldsOf(t: Extract<Ty, { k: "app" }>): Map<string, FieldInfo> {
    const out = new Map<string, FieldInfo>();
    const walk = (x: Extract<Ty, { k: "app" }>) => {
      if (x.decl.base) {
        const mm = new Map<Ty, Ty>(); x.decl.params.forEach((p, i) => mm.set(p, x.args[i] ?? T.err));
        walk(subst(x.decl.base, mm) as any);
      }
      const mm = new Map<Ty, Ty>(); x.decl.params.forEach((p, i) => mm.set(p, x.args[i] ?? T.err));
      for (const f of x.decl.fields.values()) if (!f.static) out.set(f.name, { ...f, ty: subst(f.ty, mm) });
    };
    walk(t);
    return out;
  }

  private declareExtension(m: ModuleInfo, d: Extract<A.Decl, { k: "extend" }>) {
    const tparams = new Map<string, Ty>();
    const tps = d.typeParams.map((tp) => { const p = mkParam(tp.name); tparams.set(tp.name, p); return p; });
    d.typeParams.forEach((tp, i) => { tps[i].bounds = tp.bounds.map((b) => this.resolveType(b, { mod: m, tparams })); });
    const target = this.resolveType(d.target, { mod: m, tparams });
    const ifaces = d.ifaces.map((i) => this.resolveType(i, { mod: m, tparams }));
    const ext: ExtInfo = { target, methods: new Map(), params: tps, module: m, ifaces };
    const byName = new Map<string, FnInfo[]>();
    for (const fd of d.methods) {
      const info = this.makeFn(fd, undefined, m, tparams, { static: !!fd.static });
      (info as any).ext = ext;
      if (fd.operator) info.name = "operator " + fd.operator;
      const g = byName.get(info.name) ?? []; g.push(info); byName.set(info.name, g);
    }
    for (const [n, g] of byName) { this.assignJs(g, true); for (const f of g) f.js = `ext$${this.extKey(target)}$${f.js}`; ext.methods.set(n, g); }
    m.exts.push(ext);
    // an extension must not shadow an existing member
    const base = this.declTypeOf(target);
    if (base) for (const [n] of ext.methods) {
      if (this.findMethods(base, n).length) this.err(d.span, "E0229", `${show(target)} already has a member \`${n}\`; an extension cannot replace it`, { suggestion: "pick a different name" });
    }
    // conformance for declared interfaces: all required methods must exist
    for (const it of ifaces) { const i = prune(it); if (i.k === "app") this.checkConformance(target, i, ext, d.span); }
  }
  extKey(t: Ty): string {
    t = prune(t);
    switch (t.k) { case "prim": return t.name; case "app": return t.decl.name; case "opt": return "Opt" + this.extKey(t.inner); case "tuple": return "Tuple"; case "fn": return "Fn"; default: return "X"; }
  }

  // ======================================================================
  // Assignability / unification (with a rollback trail)
  // ======================================================================
  private trail: Extract<Ty, { k: "var" }>[] = [];
  private bind(v: Extract<Ty, { k: "var" }>, t: Ty) { v.ref = t; this.trail.push(v); }
  private rollback(n: number) { while (this.trail.length > n) this.trail.pop()!.ref = undefined; }

  /** Is `from` usable where `to` is expected? Binds inference variables on success, leaves no trace on failure. */
  assignable(from: Ty, to: Ty): boolean {
    const mark = this.trail.length;
    const ok = this.assign(from, to);
    if (!ok) this.rollback(mark);
    return ok;
  }
  /** Same test without keeping any bindings. */
  canAssign(from: Ty, to: Ty): boolean {
    const mark = this.trail.length;
    const ok = this.assign(from, to);
    this.rollback(mark);
    return ok;
  }

  private assign(f0: Ty, t0: Ty): boolean {
    const f = prune(f0), t = prune(t0);
    if (f === t) return true;
    if (f.k === "err" || t.k === "err") return true;
    if (t.k === "var") { if (occurs(t, f)) return false; this.bind(t, f); return true; }
    if (f.k === "var") { if (occurs(f, t)) return false; this.bind(f, t); return true; }
    if (t.k === "prim" && t.name === "Any") return !(f.k === "prim" && f.name === "Void");
    if (f.k === "prim" && f.name === "Never") return true;
    if (f.k === "nil") return t.k === "opt";
    if (t.k === "opt") return f.k === "opt" ? this.assign(f.inner, t.inner) : this.assign(f, t.inner);
    if (f.k === "opt") return false;
    const fa = f.k === "app" ? f : this.declTypeOf(f);
    const isFVal = (x: Ty) => x.k === "app" && x.decl.name === "Value" && x.decl.module.name === "std.foreign";
    if (isFVal(f) && !isPrim(t, "Void") && t.k !== "fn" && (t.k === "prim" || (t.k === "app" && t.decl.builtin && (t.decl.name === "Array" || t.decl.name === "Map")) || isFVal(t))) return true;
    if (isFVal(t) && !isPrim(f, "Void")) return true;
    switch (t.k) {
      case "prim": return f.k === "prim" && f.name === t.name;
      case "nil": return false;
      case "tuple": return f.k === "tuple" && f.elems.length === t.elems.length && f.elems.every((e, i) => this.assign(e, t.elems[i]));
      case "fn": {
        if (f.k !== "fn" || f.params.length !== t.params.length) return false;
        if (!t.params.every((p, i) => this.assign(p, f.params[i]))) return false;
        if (isPrim(t.ret, "Void")) return true;
        return this.assign(f.ret, t.ret);
      }
      case "param": return f.k === "param" && f === t;
      case "app": {
        if (f.k === "param") return f.bounds.some((b) => this.assign(b, t));
        if (!fa) return false;
        for (const s of supertypes(fa)) if (s.decl === t.decl) return s.args.length === t.args.length && s.args.every((a, i) => this.assignArg(a, t.args[i]));
        if (t.decl.kind === "interface" && f.k !== "app") return this.conforms(f, t);
        if (t.decl.kind === "interface" && f.k === "app") return this.conforms(f, t);
        return false;
      }
    }
    return false;
  }
  private assignArg(a: Ty, b: Ty): boolean {
    if (containsVar(a) || containsVar(b)) return this.assign(a, b) && this.assign(b, a);
    return same(a, b) || (isPrim(b, "Any") && false);
  }

  // ======================================================================
  // Member lookup
  // ======================================================================
  /** Substitution mapping `owner`'s type parameters as seen from receiver type `recv`. */
  ownerMap(recv: Extract<Ty, { k: "app" }>, owner: TypeDecl): Map<Ty, Ty> {
    const m = new Map<Ty, Ty>();
    for (const s of supertypes(recv)) if (s.decl === owner) { owner.params.forEach((p, i) => m.set(p, s.args[i] ?? T.err)); break; }
    return m;
  }

  findMethods(recv: Extract<Ty, { k: "app" }>, name: string, statics = false): { fn: FnInfo; map: Map<Ty, Ty> }[] {
    const out: { fn: FnInfo; map: Map<Ty, Ty> }[] = [];
    const seen = new Set<string>();
    for (const s of supertypes(recv)) {
      const list = (statics ? s.decl.statics : s.decl.methods).get(name);
      if (!list) continue;
      const map = new Map<Ty, Ty>(); s.decl.params.forEach((p, i) => map.set(p, s.args[i] ?? T.err));
      for (const fn of list) { const key = fn.js; if (seen.has(key)) continue; seen.add(key); out.push({ fn, map }); }
    }
    return out;
  }
  findField(recv: Extract<Ty, { k: "app" }>, name: string, statics = false): { f: FieldInfo; map: Map<Ty, Ty> } | undefined {
    for (const s of supertypes(recv)) {
      const f = s.decl.fields.get(name);
      if (f && f.static === statics) { const map = new Map<Ty, Ty>(); s.decl.params.forEach((p, i) => map.set(p, s.args[i] ?? T.err)); return { f, map }; }
    }
    return undefined;
  }
  findGetter(recv: Extract<Ty, { k: "app" }>, name: string): { fn?: FnInfo; ty: Ty; map: Map<Ty, Ty>; iface?: boolean; setter?: FnInfo } | undefined {
    for (const s of supertypes(recv)) {
      const map = new Map<Ty, Ty>(); s.decl.params.forEach((p, i) => map.set(p, s.args[i] ?? T.err));
      const g = s.decl.getters.get(name);
      if (g) return { fn: g, ty: g.ret, map, setter: s.decl.setters.get(name) };
      const ig = s.decl.ifaceGetters?.get(name);
      if (ig) return { ty: ig, map, iface: true };
    }
    return undefined;
  }
  /** Extension methods applicable to a receiver type. */
  findExt(t: Ty, name: string): { fn: FnInfo; map: Map<Ty, Ty> }[] {
    const out: { fn: FnInfo; map: Map<Ty, Ty> }[] = [];
    for (const m of this.order) for (const e of m.exts) {
      const g = e.methods.get(name);
      if (!g) continue;
      const map = new Map<Ty, Ty>(); e.params.forEach((p) => map.set(p, freshVar()));
      const target = subst(e.target, map);
      if (this.canAssign(t, target)) { this.assignable(t, target); for (const fn of g) out.push({ fn, map }); }
    }
    return out;
  }

  // ---------- conformance ----------
  private checkConformance(target: Ty, iface: Extract<Ty, { k: "app" }>, ext: ExtInfo | undefined, span: Span, selfDecl?: TypeDecl) {
    const idecl = iface.decl;
    const base = this.declTypeOf(target);
    const imap = new Map<Ty, Ty>(); idecl.params.forEach((p, i) => imap.set(p, iface.args[i] ?? T.err));
    const missing: string[] = [];
    const walk = (it: Extract<Ty, { k: "app" }>) => {
      for (const [name, [req]] of it.decl.methods) {
        if (!req.abstract) continue;
        const im = new Map<Ty, Ty>(); it.decl.params.forEach((p, i) => im.set(p, it.args[i] ?? T.err));
        const cands: { fn: FnInfo; map: Map<Ty, Ty> }[] = [];
        if (base) cands.push(...this.findMethods(base, name).filter((c) => !c.fn.abstract));
        if (ext) { for (const f of ext.methods.get(name) ?? []) cands.push({ fn: f, map: new Map() }); }
        else cands.push(...this.findExt(target, name));
        const match = cands.find((c) => c.fn.params.length === req.params.length && c.fn.params.every((p, i) => this.canAssign(subst(req.params[i].ty, im), subst(p.ty, c.map))));
        if (!match) { missing.push(`fn ${name}(${req.params.map((p) => `${p.name}: ${show(subst(p.ty, im))}`).join(", ")}) -> ${show(subst(req.ret, im))}`); continue; }
        if (selfDecl) match.fn.js = req.js;     // implementing method adopts the interface's JS name
        const rr = subst(match.fn.ret, match.map);
        if (!prune(rr).k.startsWith("v") && !this.canAssign(rr, subst(req.ret, im)) && !isPrim(req.ret, "Void")) {
          this.err(match.fn.decl?.span ?? span, "E0240", `\`${name}\` returns ${show(rr)} but interface ${idecl.name} requires ${show(subst(req.ret, im))}`, { suggestion: `change the return type to ${show(subst(req.ret, im))}` });
        }
      }
      for (const [gname, gty] of it.decl.ifaceGetters ?? []) {
        const gt = subst(gty, imap);
        const fld = base && this.findField(base, gname);
        const gg = base && this.findGetter(base, gname);
        const have = fld ? subst(fld.f.ty, fld.map) : gg ? subst(gg.ty, gg.map) : undefined;
        if (!have) missing.push(`get ${gname}: ${show(gt)}`);
        else if (!this.canAssign(have, gt)) this.err(span, "E0240", `property \`${gname}\` has type ${show(have)} but ${idecl.name} requires ${show(gt)}`);
      }
      if (it.decl === this.prelude.types.get("Comparable") && base) {
        if (!this.findMethods(base, "operator <").length && !ext?.methods.has("operator <") && target.k !== "prim") missing.push("operator <(other: " + show(target) + ") -> Bool");
      }
      for (const sup of it.decl.ifaces) { const sm = new Map<Ty, Ty>(); it.decl.params.forEach((p, i) => sm.set(p, it.args[i] ?? T.err)); walk(subst(sup, sm) as any); }
    };
    if (target.k === "prim" && !ext) return;
    walk(iface);
    if (missing.length) this.err(span, "E0241", `${show(target)} does not implement ${show(iface)}`, { why: `missing: ${missing.join("; ")}`, suggestion: `add ${missing.length === 1 ? "this member" : "these members"} to ${show(target)}: ${missing.join("; ")}` });
  }

  // ======================================================================
  // Phase 3: bodies
  // ======================================================================
  private queueBodies(m: ModuleInfo) {
    const tests: { name: string; body: A.Block; fnCtx: () => void }[] = [];
    (m as any).tests = tests;
    const untypedFns: (() => void)[] = [];
    for (const d of m.ast!.decls) {
      switch (d.k) {
        case "fn": {
          const info = m.fns.get(d.fn.name)?.find((f) => f.decl === d.fn);
          if (info && !d.fn.extern) {
            if ((info as any).hasUntypedParams) untypedFns.push(() => this.checkFnBody(info));
            else this.pendingBodies.push(() => this.checkFnBody(info));
          }
          break;
        }
        case "let": { const g = m.globals.get((d.stmt.pat as any).name); if (g) this.pendingBodies.push(() => { this.checkGlobalInit(g); }); break; }
        case "class": case "enum": case "interface": {
          const decl = m.types.get(d.name)!;
          if (!(d as any).extern) this.pendingBodies.push(() => this.checkTypeBodies(decl));
          break;
        }
        case "extend": {
          const ext = m.exts.find((e) => e.methods.size && [...e.methods.values()][0][0].decl === d.methods[0]) ?? m.exts[m.exts.length - 1];
          for (const fd of d.methods) for (const g of ext?.methods.values() ?? []) for (const f of g) if (f.decl === fd) this.pendingBodies.push(() => this.checkFnBody(f));
          break;
        }
        case "test": {
          const body = d.body;
          this.pendingBodies.push(() => {
            const cx = this.typeScope(m, new Map());
            cx.fn = { ...this.topFn(), async: true };
            this.checkBlock(body, cx);
          });
          tests.push({ name: d.name, body, fnCtx: () => {} });
          break;
        }
      }
    }
    this.pendingBodies.push(...untypedFns);
  }

  private checkTypeBodies(d: TypeDecl) {
    const ast = d.ast!;
    const selfTy = app(d, d.params);
    const tparams: Map<string, Ty> = (d as any).tparams;
    // conformance of the declared interfaces
    for (const it of d.ifaces) if (d.kind !== "interface") this.checkConformance(selfTy, it, undefined, ast.span, d);
    if (ast.k === "class") {
      // overrides
      for (const [, list] of d.methods) for (const f of list) this.checkOverride(d, f);
      // field initialisers
      for (const f of d.fields.values()) {
        const fd: A.FieldDecl = (f as any).decl;
        if (fd.init) {
          const cx = this.bodyCtx(d.module, tparams, d, f.static ? undefined : undefined, !!f.static);
          cx.fn = this.topFn();
          const t = this.infer(fd.init, cx, prune(f.ty).k === "var" ? undefined : f.ty);
          if (prune(f.ty).k === "var" && !fd.type) { if (prune(t).k === "nil") this.err(fd.span, "E0231", `field \`${f.name}\` initialised with nil needs a type`, { suggestion: `write \`var ${f.name}: Type? = nil\`` }); this.assignable(t, f.ty); }
          else if (!this.assignable(t, f.ty)) this.mismatch(fd.init, t, f.ty);
          else this.coerceLit(fd.init, f.ty);
        } else if (!fd.type) this.err(fd.span, "E0231", `field \`${f.name}\` needs a type`);
      }
    }
    for (const list of [...d.methods.values(), ...d.statics.values()]) for (const f of list) if (f.decl && f.decl.body) this.checkFnBody(f);
    for (const f of d.ctors) if (f.decl && f.decl.body && !(f as any).inherited) this.checkFnBody(f);
    for (const f of d.getters.values()) if (f.decl?.body) this.checkFnBody(f);
    for (const f of d.setters.values()) if (f.decl?.body) this.checkFnBody(f);
    if (d.kind === "struct") this.checkStruct(d);
  }

  private checkStruct(d: TypeDecl) {
    for (const f of d.fields.values()) {
      const t = prune(f.ty);
      if (t.k === "app" && t.decl === d) this.err(f.span, "E0242", `struct ${d.name} contains itself`, { why: "a struct stores its fields inline, so it would be infinitely large", suggestion: `make the field optional ${d.name}? or use a class` });
    }
  }

  private checkOverride(d: TypeDecl, f: FnInfo) {
    if (!d.base || f.static) return;
    const bm = this.findMethods(d.base, f.name).filter((c) => c.fn.params.length === f.params.length && c.fn.params.every((p, i) => this.canAssign(subst(p.ty, c.map), f.params[i].ty) && this.canAssign(f.params[i].ty, subst(p.ty, c.map))));
    if (f.override) {
      if (!bm.length) this.err(f.decl!.span, "E0243", `\`${f.name}\` is marked override but ${d.base.decl.name} has no such method`, { suggestion: "remove `override`, or check the name and parameter types" });
      else { f.js = bm[0].fn.js; this.checkOverrideRet(f, bm[0]); }
    } else if (bm.length && !bm[0].fn.decl?.extern) {
      this.err(f.decl!.span, "E0244", `\`${f.name}\` overrides a method of ${bm[0].fn.owner?.name} and must be marked \`override\``, { why: "explicit `override` prevents accidentally replacing base behaviour", suggestion: `write \`override fn ${f.name}(...)\`` });
      f.js = bm[0].fn.js;
    }
  }
  private checkOverrideRet(f: FnInfo, b: { fn: FnInfo; map: Map<Ty, Ty> }) {
    const br = subst(b.fn.ret, b.map);
    if (prune(f.ret).k === "var" || prune(br).k === "var") return;
    if (!this.canAssign(f.ret, br) && !isPrim(br, "Void")) this.err(f.decl!.span, "E0245", `override of \`${f.name}\` returns ${show(f.ret)} but the base method returns ${show(br)}`, { suggestion: `return ${show(br)} (or a subtype)` });
  }

  bodyCtx(mod: ModuleInfo, tparams: Map<string, Ty>, cls?: TypeDecl, _unused?: undefined, isStatic = false): Ctx {
    const cx: Ctx = { mod, tparams, scope: new Scope(undefined, true), loopDepth: 0, cls, inStatic: isStatic };
    if (cls && !isStatic) {
      cx.selfTy = app(cls, cls.params);
      cx.scope.vars.set("self", { name: "self", ty: cx.selfTy, mutable: false, js: "this", span: undefined as any, kind: "self", used: true });
    }
    return cx;
  }

  private bodyDone = new Set<FnInfo>();
  private bodyRunning = new Set<FnInfo>();

  /** Check a function body (once). Safe to call on demand to infer an un-annotated return type. */
  checkFnBody(f: FnInfo) {
    if (this.bodyDone.has(f) || this.bodyRunning.has(f)) return;
    const fd = f.decl;
    if (!fd || !fd.body) { this.bodyDone.add(f); return; }
    this.bodyRunning.add(f);
    const prevCheckingFn = this.currentCheckingFn;
    this.currentCheckingFn = f;
    try {
      const ext: ExtInfo | undefined = (f as any).ext;
      const tparams: Map<string, Ty> = (f as any).tparams;
      const cx = this.bodyCtx(f.module, tparams, f.owner, undefined, f.static && !f.isInit);
      if (ext && !f.static) {
        const selfTy = ext.target;
        cx.selfTy = selfTy;
        cx.extTarget = selfTy;
        cx.scope.vars.set("self", { name: "self", ty: selfTy, mutable: false, js: "self_", span: fd.span, kind: "self", used: true });
      }
      const inferRet = (f as any).inferRet as boolean;
      const fnCx: FnCtx = {
        ret: f.ret, retDeclared: !inferRet, async: f.async, gen: f.gen, usesPropagate: false, isLambda: false, returns: [], info: f, isInit: f.isInit,
        selfAssigned: new Set(),
      };
      if (f.gen) {
        const r = prune(f.ret);
        let yt: Ty = freshVar();
        if (r.k === "app" && ["Gen", "Iterator", "Iterable"].includes(r.decl.name) && r.decl.builtin !== false) yt = r.args[0];
        else if (r.k === "var") this.assignable(this.preludeType("Gen", [yt]), r);
        else if (r.k !== "err") this.err(fd.ret?.span ?? fd.span, "E0250", `a \`gen\` function must return Gen<T>, Iterator<T> or Iterable<T>, not ${show(r)}`, { suggestion: "write `gen fn name() -> Gen<Int>` (or omit the return type)" });
        fnCx.yieldTy = yt;
        fnCx.ret = T.Void; fnCx.retDeclared = true;
      }
      cx.fn = fnCx;
      for (const p of fd.params) {
        const pi = f.params.find((q) => q.name === p.name)!;
        if (cx.scope.lookupHere(p.name)) { this.err(p.span, "E0251", `duplicate parameter \`${p.name}\``); continue; }
        cx.scope.vars.set(p.name, { name: p.name, ty: pi.ty, mutable: false, js: p.js ?? jsId(p.name), span: p.span, kind: "param", used: true });
        if (p.pat) this.checkParamPattern(p, pi.ty, cx);
        if (p.default) {
          const dcx = { ...cx, scope: new Scope(cx.scope) };
          const dt = this.infer(p.default, dcx, p.variadic ? undefined : pi.ty);
          if (!this.assignable(dt, pi.ty)) this.mismatch(p.default, dt, pi.ty);
          else this.coerceLit(p.default, pi.ty);
        }
      }
      const body = fd.body;
      if (body.k === "block") {
        this.checkBlock(body, cx, true);
        const rt = prune(fnCx.ret);
        if (inferRet) {
          // unify collected returns; a fall-off body means Void
          const exits = this.blockExits(body);
          if (rt.k === "var") {
            if (!fnCx.returns.length) this.bind(rt, T.Void);
            else if (!exits && !fnCx.returns.every((r) => isPrim(r.ty, "Void"))) this.err(fd.span, "E0252", `\`${f.name}\` returns a value on some paths but not all`, { suggestion: "return a value at the end, or on every branch" });
            else if (prune(fnCx.ret).k === "var") this.bind(rt, T.Void);
          } else if (!exits && !isPrim(rt, "Void") && !isPrim(rt, "Never") && rt.k !== "err" && !f.gen && !f.isInit) {
            this.err(fd.span, "E0252", `\`${f.name}\` returns a value on some paths but not all`, { suggestion: "return a value at the end, or on every branch" });
          }
        } else if (!exits(body, this) && !isPrim(rt, "Void") && !isPrim(rt, "Never") && rt.k !== "err" && !f.gen && !f.isInit) {
          this.err(body.span.end ? { src: body.span.src, start: body.span.end - 1, end: body.span.end } : fd.span, "E0252", `\`${f.name}\` must return ${show(rt)} on every path`, { why: "execution can reach the end of the function without a return", suggestion: `add \`return <${show(rt)}>\` at the end, or on the branch that falls through` });
        }
      } else {
        // expression-bodied: `fn f() => expr`
        const exp = inferRet ? undefined : fnCx.ret;
        const t = this.infer(body, cx, exp && prune(exp).k !== "var" ? exp : undefined);
        if (f.gen) { /* expression generators are not meaningful */ }
        if (inferRet) { this.assignable(t, fnCx.ret); }
        else if (isPrim(fnCx.ret, "Void")) { /* any value is discarded */ }
        else if (!this.assignable(t, fnCx.ret)) this.mismatch(body, t, fnCx.ret);
        else this.coerceLit(body, fnCx.ret);
      }
      if (f.isInit) this.checkInit(f, cx, fnCx);
      (f as any).usesPropagate = fnCx.usesPropagate;
      this.reportUnused(cx.scope);
    } finally {
      this.currentCheckingFn = prevCheckingFn;
      this.bodyRunning.delete(f);
      this.bodyDone.add(f);
    }
  }

  private checkInit(f: FnInfo, cx: Ctx, fnCx: FnCtx) {
    const d = f.owner!;
    const fd = f.decl!;
    // fields without defaults must be assigned (straight-line) in this initializer
    const assigned = new Set<string>();
    const body = fd.body as A.Block;
    let callsSuper = false;
    for (const s of body.stmts) {
      if (s.k === "expr" && s.expr.k === "assign" && s.expr.target.k === "member" && s.expr.target.obj.k === "self") assigned.add(s.expr.target.name);
      if (s.k === "expr" && s.expr.k === "call" && s.expr.callee.k === "member" && s.expr.callee.obj.k === "super" && s.expr.callee.name === "init") callsSuper = true;
    }
    for (const n of fnCx.selfAssigned ?? []) assigned.add(n);
    const missing = [...d.fields.values()].filter((x) => !x.static && !x.hasInit && !assigned.has(x.name) && prune(x.ty).k !== "opt").map((x) => x.name);
    if (missing.length) this.err(fd.span, "E0253", `initializer of ${d.name} does not set ${missing.map((m) => "`" + m + "`").join(", ")}`, { why: "every stored property needs a value before the object can be used", suggestion: missing.map((m) => `self.${m} = ...`).join("; ") });
    if (d.base) {
      const needs = d.base.decl.ctors.length > 0 && !d.base.decl.ctors.some((c) => c.params.every((p) => p.hasDefault));
      if (needs && !callsSuper) this.err(fd.span, "E0254", `initializer of ${d.name} must call \`super.init(...)\``, { why: `${d.base.decl.name} has no initializer that takes no arguments`, suggestion: "call `super.init(...)` as the first statement" });
    }
  }

  /** Does control definitely leave this block (return/throw/loop-forever)? */
  private blockExits(b: A.Block): boolean { return exits(b, this); }

  private reportUnused(scope: Scope) {
    for (const [n, v] of scope.vars) {
      if (!scope.isFnRoot && v.span && this.implicitSpans.has(v.span)) this.innerImplicit.set(n, v.span);
      if (v.used || v.kind !== "local" || n.startsWith("_") || !v.span) continue;
      const near = this.implicitNear.get(v.span);
      // a never-read `x = ...` that created a new name next to a similar one is almost always a typo
      if (near) this.warn(v.span, "W0101", `\`${n} = ...\` made a new variable that is never used`, { why: `no variable named \`${n}\` existed, so this assignment created one`, suggestion: `did you mean \`${near}\`?` });
      else this.warn(v.span, "W0101", `variable \`${n}\` is never used`, { suggestion: `remove it, or rename it \`_${n}\` to silence this warning` });
    }
  }

  // ---------- statements ----------
  checkBlock(b: A.Block, cx: Ctx, sameScope = false) {
    const inner: Ctx = sameScope ? { ...cx, scope: new Scope(cx.scope) } : { ...cx, scope: new Scope(cx.scope) };
    this.checkStmts(b.stmts, inner);
    this.reportUnused(inner.scope);
  }

  checkStmts(stmts: A.Stmt[], cx: Ctx) {
    let dead = false, warned = false;
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (dead && !warned) { this.warn(s.span, "W0102", "unreachable code", { why: "an earlier statement always returns, throws, breaks or continues" }); warned = true; }
      this.checkStmt(s, cx);
      if (stmtExits(s, this)) dead = true;
      // early-exit narrowing: `if x == nil { return }` narrows x for the rest of the block
      if (s.k === "if" && !s.else && !s.cond.pat && exits(s.then, this)) {
        const n = this.narrowings(s.cond.expr, false, cx);
        if (n.size) cx.scope = this.applyNarrow(cx.scope, n);
      }
    }
  }

  declareLocal(cx: Ctx, name: string, ty: Ty, mutable: boolean, span: Span, kind: LocalInfo["kind"] = "local"): LocalInfo {
    const here = cx.scope.lookupHere(name);
    if (here && !cx.scope.isFnRoot) this.err(span, "E0260", `\`${name}\` is already declared in this scope`, { why: `first declared at line ${here.span ? here.span.src.pos(here.span.start).line : "?"}`, suggestion: "choose another name, or assign to the existing variable if it is `var`" });
    let js = jsId(name);
    if (cx.scope.lookup(name)) js = `${js}$${++this.localCounter}`;
    const info: LocalInfo = { name, ty, mutable, js, span, kind, used: false };
    cx.scope.vars.set(name, info);
    return info;
  }
  private localCounter = 0;

  /** Python/Ruby-style first assignment: `total = 0` (or `a, b = 1, 2`) where no such name exists yet declares a new
   *  variable, as if written `var total = 0`. Rewrites the statement in place into a `let`; returns whether it did. */
  /** implicit declarations next to a similar visible name (typo hint), and names an inner block declared implicitly */
  private implicitNear = new Map<Span, string>();
  private innerImplicit = new Map<string, Span>();
  private implicitSpans = new Set<Span>();
  private implicitLet(s: Extract<A.Stmt, { k: "expr" }>, cx: Ctx): boolean {
    const e = s.expr;
    if (e.k !== "assign" || e.op !== "=") return false;
    const unknown = (x: A.Expr) => x.k === "id" && !cx.scope.lookup(x.name) && !this.lookupModuleSym(x.name, cx) && !this.bareVariant(x.name)
      && !(cx.selfTy && !cx.inStatic && prune(cx.selfTy).k === "app" && this.hasMember(prune(cx.selfTy) as any, x.name))
      && !Object.prototype.hasOwnProperty.call(VALUE_WORDS, x.name);
    const bind = (x: any): A.Pattern => ({ k: "bind", name: x.name, mutable: true, span: x.span });
    let pat: A.Pattern;
    if (e.target.k === "id" && unknown(e.target)) pat = bind(e.target);
    else if (e.target.k === "tuple" && e.target.elems.length && e.target.elems.every(unknown)) pat = { k: "tuple", elems: e.target.elems.map(bind), span: e.target.span };
    else return false;
    if (pat.k === "bind") this.implicitSpans.add(pat.span); else for (const x of (pat as any).elems) this.implicitSpans.add(x.span);
    if (pat.k === "bind") {
      const near = closest(pat.name, [...this.visibleNames(cx)]);
      if (near && near !== pat.name) this.implicitNear.set(pat.span, near);
    }
    const st = s as any;
    st.k = "let"; st.pat = pat; st.mutable = true; st.init = e.value; st.implicit = true; delete st.expr;
    return true;
  }

  checkStmt(s: A.Stmt, cx: Ctx) {
    switch (s.k) {
      case "let": return this.checkLet(s, cx);
      case "expr": {
        if (this.implicitLet(s, cx)) return this.checkLet(s as any, cx);
        const t = this.infer(s.expr, cx);
        const pt = prune(t);
        if (pt.k === "app" && pt.decl.name === "Task" && pt.decl.builtin && s.expr.k === "call") this.warn(s.expr.span, "W0301", "the Task returned by this async call is ignored", { why: "the work starts, but errors in it will not be reported and nothing waits for it", suggestion: "write `await call()` to wait for it, or `spawn call()` and keep the Task" });
        return;
      }
      case "if": return this.checkIf(s, cx);
      case "while": {
        const { scope } = this.condScope(s.cond, cx);
        this.checkBlock(s.body, { ...scope, loopDepth: cx.loopDepth + 1, labels: this.pushLabel(s, cx) });
        return;
      }
      case "for": {
        let it = this.infer(s.iter, cx);
        if (s.bare && prune(it).k === "app" && (prune(it) as any).decl.name === "Array") { // `for i, x in list` = position + value
          s.iter = { k: "call", callee: { k: "member", obj: s.iter, name: "enumerate", span: s.iter.span }, args: [], span: s.iter.span } as A.Expr;
          it = this.infer(s.iter, cx);
        }
        const elem = this.iterElem(it, s.iter);
        const inner: Ctx = { ...cx, scope: new Scope(cx.scope), loopDepth: cx.loopDepth + 1, labels: this.pushLabel(s, cx) };
        this.checkPattern(s.pat, elem, inner, false);
        this.checkStmts(s.body.stmts, inner);
        this.reportUnused(inner.scope);
        return;
      }
      case "match": { this.checkMatch(s.subject, s.arms, cx, undefined, s.span, true); return; }
      case "return": return this.checkReturn(s, cx);
      case "break": case "continue":
        if (cx.loopDepth <= 0) this.err(s.span, "E0261", `\`${s.k}\` outside of a loop`, { suggestion: s.k === "break" ? "`break` only works inside `for` and `while`; use `return` to leave a function" : "`continue` only works inside `for` and `while`" });
        else if (s.label && !(cx.labels ?? []).includes(s.label)) {
          const near = closest(s.label, cx.labels ?? []);
          this.err(s.span, "E0270", `no enclosing loop is labeled \`${s.label}\``, { why: (cx.labels ?? []).length ? `the loops around this ${s.k} are labeled ${(cx.labels ?? []).map((l) => "`" + l + "`").join(", ")}` : "a label is written before a loop: `outer: for x in xs { ... }`", suggestion: near ? `did you mean \`${s.k} ${near}\`?` : `label the loop: \`${s.label}: for ...\`` });
        }
        return;
      case "throw": {
        const t = this.infer(s.value, cx);
        if (!this.canAssign(t, this.preludeType("Error")) && prune(t).k !== "err") this.err(s.value.span, "E0262", `can only throw an Error, not ${show(t)}`, { why: "thrown values must be instances of Error (or a subclass) so catch clauses can be typed", suggestion: `throw Error("${isPrim(t, "String") ? "message" : "..."}") or define \`class MyError: Error { }\`` });
        return;
      }
      case "try": return this.checkTry(s, cx);
      case "block": { this.checkBlock({ k: "block", stmts: s.stmts, span: s.span }, cx); return; }
      case "fn": return this.checkLocalFn(s.decl, cx);
    }
  }

  private checkLocalFn(fd: A.FnDecl, cx: Ctx) {
    if (fd.gen) { this.err(fd.span, "E0263", "local functions cannot be generators", { suggestion: "move the `gen fn` to the top level" }); return; }
    if (fd.typeParams.length) { this.err(fd.span, "E0263", "local functions cannot be generic", { suggestion: "move the function to the top level" }); return; }
    const info = this.makeFn(fd, undefined, cx.mod, cx.tparams);
    const fty = fnTy(info.params.map((p) => p.ty), info.async ? this.taskOf(info.ret) : info.ret);
    const local = this.declareLocal(cx, fd.name, fty, false, fd.span);
    local.used = true;
    (fd as any).localJs = local.js;
    (info as any).tparams = cx.tparams;
    // body checked like a lambda that may close over locals and refer to itself
    const lam: A.Expr = { k: "lambda", params: fd.params, ret: fd.ret, body: fd.body!, async: fd.async, span: fd.span } as any;
    (lam as any).fnInfo = info; (lam as any).named = fd.name; (lam as any).gen = fd.gen;
    (fd as any).lambda = lam;
    this.inferLambda(lam as any, cx, fty, info);
    if ((info as any).inferRet && fty.k === "fn") fty.ret = info.async ? this.taskOf(info.ret) : info.ret;
  }

  private checkReturn(s: Extract<A.Stmt, { k: "return" }>, cx: Ctx) {
    const f = cx.fn;
    if (!f) { this.err(s.span, "E0264", "`return` outside of a function"); return; }
    if (f.gen) { if (s.value) this.err(s.span, "E0265", "a generator cannot return a value", { suggestion: "use `yield value` to produce values and plain `return` to stop" }); return; }
    if (f.isInit) { if (s.value) this.err(s.span, "E0265", "an initializer cannot return a value"); return; }
    if (!s.value) {
      if (!f.retDeclared || !isPrim(f.ret, "Void")) {
        if (f.retDeclared && !isPrim(f.ret, "Void") && prune(f.ret).k !== "err" && prune(f.ret).k !== "var") this.err(s.span, "E0266", `this function returns ${show(f.ret)}, so \`return\` needs a value`, { suggestion: `write \`return <${show(f.ret)}>\`` });
        else f.returns.push({ ty: T.Void, span: s.span });
      }
      if (prune(f.ret).k === "var" && !f.retDeclared) this.assignable(T.Void, f.ret);
      return;
    }
    const exp = prune(f.ret).k === "var" ? undefined : f.ret;
    const t = this.infer(s.value, cx, exp);
    if (s.implicit && isPrim(t, "Void")) return; // the last line of a closure body is a call that gives nothing: no result
    f.returns.push({ ty: t, span: s.span });
    if (isPrim(f.ret, "Void") && f.retDeclared) {
      if (!isPrim(t, "Void")) this.err(s.value.span, "E0266", `this function returns nothing, but \`return\` gives a ${show(t)}`, { suggestion: `declare the return type: \`-> ${show(t)}\`` });
      return;
    }
    if (!this.assignable(t, f.ret)) this.mismatch(s.value, t, f.ret, "return value");
    else this.coerceLit(s.value, f.ret);
  }

  private checkLet(s: Extract<A.Stmt, { k: "let" }>, cx: Ctx) {
    let declared: Ty | undefined = s.type ? this.resolveType(s.type, cx) : undefined;
    let ty: Ty;
    if (s.init) {
      const t = this.infer(s.init, cx, declared);
      if (declared) {
        if (!this.assignable(t, declared)) this.mismatch(s.init, t, declared, "initial value");
        else this.coerceLit(s.init, declared);
        ty = declared;
      } else {
        const pt = prune(t);
        if (pt.k === "nil") { this.err(s.span, "E0231", `cannot infer a type from \`nil\``, { why: "nil alone does not say which type of optional this is", suggestion: `write \`${s.mutable ? "var" : "let"} name: Type? = nil\`` }); ty = T.err; }
        else if (isPrim(pt, "Void")) { this.err(s.init.span, "E0267", "this expression has no value (it returns Void)", { suggestion: "call it as a statement instead of binding it" }); ty = T.err; }
        else ty = t;
        if (s.pat.k === "bind") this.noteUnresolved(ty, s.pat.span, `\`${s.pat.name}\``);
      }
    } else {
      ty = declared!;
      if (!s.mutable) this.err(s.span, "E0224", "`let` needs an initial value", { why: "an immutable binding cannot be assigned later", suggestion: "write `let name = value`, or use `var name: Type?` for a value that starts as nil" });
      else if (prune(ty).k !== "opt" && prune(ty).k !== "err") this.err(s.span, "E0224", `\`var\` of type ${show(ty)} needs an initial value`, { why: "Mycel has no uninitialised variables; only optionals start as nil", suggestion: `write \`var name: ${show(ty)} = <value>\`, or make the type optional: \`${show(ty)}?\`` });
    }
    this.checkPattern(s.pat, ty, cx, s.mutable, true);
    if (s.pat.k !== "bind" && s.pat.k !== "wild" && !this.irrefutable(s.pat, ty)) this.err(s.pat.span, "E0268", "this pattern can fail to match, so it cannot be used with `let`", { suggestion: "use `if let <pattern> = value { ... }` or `match` for patterns that may not match" });
  }

  noteUnresolved(t: Ty, span: Span, what: string) {
    if (containsVar(t)) {
      for (const v of collectVars(t)) {
        this.unresolvedVars.push({ v, span, what });
      }
    }
  }
  private firstVar(t0: Ty): Ty | undefined {
    const t = prune(t0);
    if (t.k === "var") return t;
    if (t.k === "opt") return this.firstVar(t.inner);
    if (t.k === "tuple") for (const e of t.elems) { const v = this.firstVar(e); if (v) return v; }
    if (t.k === "app") for (const e of t.args) { const v = this.firstVar(e); if (v) return v; }
    if (t.k === "fn") { for (const e of t.params) { const v = this.firstVar(e); if (v) return v; } return this.firstVar(t.ret); }
    return undefined;
  }

  private checkTry(s: Extract<A.Stmt, { k: "try" }>, cx: Ctx) {
    this.checkBlock(s.body, cx);
    const errTy = this.preludeType("Error");
    let sawCatchAll = false;
    for (const c of s.catches) {
      if (sawCatchAll) this.err(c.span, "E0269", "this catch clause can never run", { why: "an earlier `catch` without a type already catches every error", suggestion: "put the typed catch clauses first" });
      let ty: Ty = errTy;
      if (c.type) {
        ty = this.resolveType(c.type, cx);
        if (!this.canAssign(ty, errTy) && prune(ty).k !== "err") this.err(c.type.span, "E0262", `can only catch an Error type, not ${show(ty)}`, { suggestion: "catch `Error` or one of its subclasses" });
      } else sawCatchAll = true;
      const inner: Ctx = { ...cx, scope: new Scope(cx.scope) };
      if (c.name) { const l = this.declareLocal(inner, c.name, ty, false, c.span); l.used = true; (c as any).js = l.js; }
      (c as any).ty = ty;
      this.checkStmts(c.body.stmts, inner);
    }
    if (s.finally) this.checkBlock(s.finally, cx);
  }

  private checkIf(s: Extract<A.Stmt, { k: "if" }>, cx: Ctx) {
    const { scope: thenCx } = this.condScope(s.cond, cx);
    this.checkBlock(s.then, thenCx);
    if (s.else) {
      let ecx = cx;
      if (!s.cond.pat) {
        const n = this.narrowings(s.cond.expr, false, cx);
        if (n.size) ecx = { ...cx, scope: this.applyNarrow(cx.scope, n) };
      }
      if (s.else.k === "block") this.checkBlock(s.else, ecx); else this.checkStmt(s.else as A.Stmt, ecx);
    }
  }

  /** Check an `if`/`while` condition (boolean or `let` pattern); returns the context for the guarded body. */
  private condScope(c: A.Cond, cx: Ctx): { scope: Ctx; cond: Ty } {
    if (c.pat) {
      const t = this.infer(c.expr, cx);
      const inner: Ctx = { ...cx, scope: new Scope(cx.scope) };
      // `if let x = optional` unwraps the optional
      const pt = prune(t);
      const subjectTy = pt.k === "opt" && c.pat.k !== "lit" ? pt.inner : t;
      (c as any).unwrap = pt.k === "opt" && c.pat.k !== "lit";
      this.checkPattern(c.pat, subjectTy, inner, false);
      return { scope: inner, cond: t };
    }
    const t = this.infer(c.expr, cx, T.Bool);
    if (!this.assignable(t, T.Bool)) this.mismatch(c.expr, t, T.Bool, "condition");
    else this.coerceForeign(c.expr, T.Bool);
    const n = this.narrowings(c.expr, true, cx);
    return { scope: n.size ? { ...cx, scope: this.applyNarrow(cx.scope, n) } : cx, cond: t };
  }

  // ---------- narrowing ----------
  narrowings(e: A.Expr, truthy: boolean, cx: Ctx): Map<string, Ty> {
    const out = new Map<string, Ty>();
    const local = (x: A.Expr) => (x.k === "id" ? cx.scope.lookup(x.name) : undefined);
    const merge = (m: Map<string, Ty>) => m.forEach((v, k) => out.set(k, v));
    if (e.k === "binary" && (e.op === "!=" || e.op === "==")) {
      const nilSide = e.right.k === "nil" ? e.left : e.left.k === "nil" ? e.right : undefined;
      const l = nilSide && local(nilSide);
      if (l) {
        const t = prune(l.ty);
        const nonNilWhen = e.op === "!=" ? truthy : !truthy;
        if (t.k === "opt" && nonNilWhen) out.set(l.name, t.inner);
      }
    } else if (e.k === "unary" && e.op === "!") merge(this.narrowings(e.operand, !truthy, cx));
    else if (e.k === "binary" && e.op === "&&" && truthy) { merge(this.narrowings(e.left, true, cx)); merge(this.narrowings(e.right, true, cx)); }
    else if (e.k === "binary" && e.op === "||" && !truthy) { merge(this.narrowings(e.left, false, cx)); merge(this.narrowings(e.right, false, cx)); }
    else if (e.k === "is" && truthy) {
      const l = local(e.operand);
      if (l) { const t = this.resolveType(e.type, cx); if (prune(t).k !== "err") out.set(l.name, t); }
    }
    return out;
  }
  applyNarrow(scope: Scope, n: Map<string, Ty>): Scope {
    const s = new Scope(scope);
    for (const [name, ty] of n) {
      const orig = scope.lookup(name)!;
      s.vars.set(name, { ...orig, ty, narrowedFrom: orig.narrowedFrom ?? orig.ty, used: true });
      // reads through the narrowed entry must mark the original used
      (s.vars.get(name) as any).origin = orig;
    }
    return s;
  }

  // ======================================================================
  // Expressions
  // ======================================================================
  mismatch(e: A.Expr, found: Ty, expected: Ty, what = "value") {
    const f = prune(found), x = prune(expected);
    if (f.k === "err" || x.k === "err") return;
    let suggestion: string | undefined, why: string | undefined;
    const fs = show(f), xs = show(x);
    if (isPrim(f, "Int") && isPrim(x, "Float")) suggestion = "convert with `.toFloat()`";
    else if (isPrim(f, "Float") && isPrim(x, "Int")) { suggestion = "convert with `.toInt()` (truncates) or `.round()` / `.floor()` / `.ceil()`"; }
    else if (isPrim(x, "String") && !isPrim(f, "String")) suggestion = `convert to text with f"{value}" or str(value)`;
    else if (f.k === "opt" && this.canAssign(f.inner, x)) { why = "the value might be nil"; suggestion = "unwrap it: `value!` (panics on nil), `value ?? fallback`, or `if let v = value { ... }`"; }
    else if (f.k === "app" && f.decl.name === "Task" && this.canAssign(f.args[0], x)) { why = "calling an async function gives a Task"; suggestion = "add `await` before the call"; }
    else if (x.k === "app" && x.decl.name === "Result" && x.decl.builtin && !(f.k === "app" && f.decl === x.decl)) suggestion = "wrap it: `Ok(value)` or `Err(error)`";
    else if (x.k === "app" && x.decl.name === "Json" && x.decl.module.name === "std.json" && f.k !== "app") {
      // literals become Json by themselves; a variable says which JSON kind it is
      const v = isPrim(f, "String") || isPrim(f, "Char") ? "Str" : isPrim(f, "Int") ? "Num" : isPrim(f, "Float") ? "Num" : isPrim(f, "Bool") ? "Bool" : undefined;
      const src = e.span.src.text.slice(e.span.start, e.span.end);
      why = "literals like \"a\", 1, true, nil, [..] and {..} become Json by themselves; a variable needs its JSON kind";
      suggestion = v ? `write \`.${v}(${isPrim(f, "Int") ? `${src}.toFloat()` : src})\`` : f.k === "nil" ? "write `.Null`" : "build it with json.parse(...) or the Json variants (.Obj, .Arr, .Str, .Num, .Bool, .Null)";
    }
    else if (isPrim(f, "Void")) { why = "this expression produces no value"; }
    else if (f.k === "app" && x.k === "app" && f.decl === x.decl) why = "type arguments must match exactly: collections are invariant";
    this.err(e.span, "E0300", `type mismatch: expected ${xs}, found ${fs}`, { why: why ?? `the ${what} has type ${fs}, but ${xs} is required here`, suggestion });
  }

  /** `3` where a Float is expected becomes `3.0` (literals only), and annotate foreign value coercions. */
  coerceLit(e: A.Expr, expected: Ty) {
    this.coerceForeign(e, expected);
    const x = prune(expected);
    const target = x.k === "opt" ? prune(x.inner) : x;
    if (!(isPrim(target, "Float"))) return;
    if (e.k === "int") { const n = Number(e.value); (e as any).k = "float"; (e as any).value = n; (e as any).ty = T.Float; }
    else if (e.k === "unary" && e.op === "-" && e.operand.k === "int") { this.coerceLit(e.operand, expected); (e as any).ty = T.Float; }
    else if (e.k === "array") e.elems.forEach((x2) => { const el = prune(expected); if (el.k === "app") this.coerceLit(x2, el.args[0]); });
    else if (e.k === "ternary") { this.coerceLit(e.then, expected); this.coerceLit(e.else, expected); }
  }

  private isForeignVal(t: Ty | undefined): boolean {
    if (!t) return false;
    const p = prune(t);
    return p.k === "app" && p.decl.name === "Value" && p.decl.module.name === "std.foreign";
  }

  private foreignTargetTag(expected: Ty): string | undefined {
    const x = prune(expected);
    if (x.k === "opt") { const inner = this.foreignTargetTag(x.inner); return inner ? `${inner}?` : undefined; }
    if (isPrim(x, "Int") || isPrim(x, "Float") || isPrim(x, "String") || isPrim(x, "Bool")) return (x as Extract<Ty, { k: "prim" }>).name;
    if (x.k === "app" && x.decl.builtin && (x.decl.name === "Array" || x.decl.name === "Map")) return x.decl.name;
    return undefined;
  }

  private coerceForeign(e: A.Expr, expected: Ty) {
    if (!this.isForeignVal((e as any).ty)) return;
    const tag = this.foreignTargetTag(expected);
    if (tag) (e as any).fcoerce = tag;
  }

  infer(e: A.Expr, cx: Ctx, exp?: Ty): Ty {
    const t = this.infer0(e, cx, exp);
    (e as any).ty = t;
    return t;
  }

  /** Infer and require assignability to `expected`. */
  checkExpr(e: A.Expr, cx: Ctx, expected: Ty, what = "value"): Ty {
    const t = this.infer(e, cx, expected);
    if (!this.assignable(t, expected)) { this.mismatch(e, t, expected, what); return expected; }
    this.coerceLit(e, expected);
    return t;
  }

  private infer0(e: A.Expr, cx: Ctx, exp?: Ty): Ty {
    const x = exp ? prune(exp) : undefined;
    if (x) this.liftJsonLiteral(e, x);
    switch (e.k) {
      case "int": {
        if (e.value > 9223372036854775807n) { return this.err(e.span, "E0310", `integer literal ${e.value} is too large for Int`, { why: "Int is a signed 64-bit integer (max 9223372036854775807)", suggestion: "use a Float literal like 1.0e30, or split the number" }); }
        if (x && (isPrim(x, "Float") || (x.k === "opt" && isPrim(x.inner, "Float")))) { (e as any).k = "float"; (e as any).value = Number(e.value); return T.Float; }
        return T.Int;
      }
      case "float": return T.Float;
      case "char": return T.Char;
      case "bool": return T.Bool;
      case "nil": return x && x.k === "opt" ? x : T.nil;
      case "fmtx": {
        const t = prune(this.infer(e.e, cx));
        if (isPrim(t, "Void")) this.err(e.e.span, "E0311", "cannot put a Void value in a string", { why: "this expression produces no value" });
        return T.String;
      }
      case "str": {
        for (const p of e.parts) if (typeof p !== "string") {
          const t = this.infer(p, cx);
          const pt = prune(t);
          if (isPrim(pt, "Void")) this.err(p.span, "E0311", "cannot put a Void value in a string", { why: "this expression produces no value", suggestion: "call it before the string and interpolate a variable" });
          else if (pt.k === "fn") this.err(p.span, "E0311", "a function cannot be interpolated into a string", { suggestion: "call it: `f()`" });
        }
        return T.String;
      }
      case "id": return this.inferId(e, cx, exp);
      case "self": {
        const s = cx.scope.lookup("self");
        if (!s) return this.err(e.span, "E0312", "`self` is only available inside methods and extensions", { suggestion: "pass the value as a parameter instead" });
        if (cx.inStatic) return this.err(e.span, "E0312", "`self` is not available in a static member", { suggestion: "remove `static` or pass the instance as a parameter" });
        return s.ty;
      }
      case "super": return this.err(e.span, "E0313", "`super` must be followed by a member: `super.method(...)` or `super.init(...)`");
      case "array": {
        let elem: Ty = x && x.k === "app" && x.decl.name === "Array" && x.decl.builtin ? x.args[0] : freshVar();
        if (x && x.k === "app" && x.decl.name === "Array") elem = x.args[0];
        else if (x && isPrim(x, "Any")) elem = T.Any;
        let first = true;
        for (const el of e.elems) {
          const t = this.infer(el, cx, elem);
          if (first && prune(elem).k === "var") { this.assignable(t, elem); if (prune(t).k === "nil") this.err(el.span, "E0231", "cannot infer the element type from `nil`", { suggestion: "annotate: `let xs: [Int?] = [nil]`" }); }
          else if (!this.assignable(t, elem)) this.mismatch(el, t, elem, "array element");
          else this.coerceLit(el, elem);
          first = false;
        }
        const ty = this.arrayOf(elem);
        if (!e.elems.length) this.noteUnresolved(ty, e.span, "this empty array");
        return ty;
      }
      case "set": {
        let elem: Ty = x && x.k === "app" && x.decl.name === "Set" ? x.args[0] : freshVar();
        for (const el of e.elems) { const t = this.infer(el, cx, elem); if (!this.assignable(t, elem)) this.mismatch(el, t, elem, "set element"); }
        this.checkKey(elem, e.span);
        const ty = this.setOf(elem);
        if (!e.elems.length) this.noteUnresolved(ty, e.span, "this empty set");
        return ty;
      }
      case "map": {
        let k: Ty = freshVar(), v: Ty = freshVar();
        if (x && x.k === "app" && x.decl.name === "Map") { k = x.args[0]; v = x.args[1]; }
        // where Any is expected (e.g. web.json({...})), values may mix types, like a JSON object
        else if (x && isPrim(x, "Any")) v = T.Any;
        for (const en of e.entries) {
          const kt = this.infer(en.key, cx, k), vt = this.infer(en.value, cx, v);
          if (!this.assignable(kt, k)) this.mismatch(en.key, kt, k, "map key"); else this.coerceLit(en.key, k);
          if (!this.assignable(vt, v)) this.mismatch(en.value, vt, v, "map value"); else this.coerceLit(en.value, v);
        }
        this.checkKey(k, e.span);
        const ty = this.mapOf(k, v);
        if (!e.entries.length) this.noteUnresolved(ty, e.span, "this empty map");
        return ty;
      }
      case "tuple": {
        if (!e.elems.length) return T.Void;
        const xs = x && x.k === "tuple" && x.elems.length === e.elems.length ? x.elems : undefined;
        const tys = e.elems.map((el, i) => this.infer(el, cx, xs?.[i]));
        if (xs) e.elems.forEach((el, i) => this.coerceLit(el, xs[i]));
        return { k: "tuple", elems: tys.map((t, i) => (xs && this.canAssign(t, xs[i]) && !containsVar(xs[i]) ? xs[i] : t)) };
      }
      case "unary": return this.inferUnary(e, cx, exp);
      case "binary": return this.inferBinary(e, cx, exp);
      case "assign": return this.inferAssign(e, cx);
      case "call": return this.inferCall(e, cx, exp);
      case "index": return this.inferIndex(e, cx);
      case "member": return this.inferMember(e, cx);
      case "implicit": return this.inferImplicit(e, cx, exp);
      case "force": {
        const t = prune(this.infer(e.operand, cx));
        if (t.k === "opt") return t.inner;
        if (t.k === "err") return t;
        // after narrowing (`if x != nil`) a leftover `!` is harmless, so it is a warning rather than an error
        this.warn(e.span, "W0103", `unnecessary \`!\`: ${show(t)} is not optional here`, { why: "`!` only applies to optional (T?) values", suggestion: "remove the `!`" });
        return t;
      }
      case "propagate": return this.inferPropagate(e, cx);
      case "cast": {
        const from = this.infer(e.operand, cx);
        const to = this.resolveType(e.type, cx);
        (e as any).castTy = to;
        const ok = this.canAssign(from, to) || this.canAssign(to, from) || isPrim(from, "Any") || (prune(from).k === "opt" && this.canAssign(to, (prune(from) as any).inner));
        if (!ok && prune(from).k !== "err" && prune(to).k !== "err") {
          const num = isNum(from) && isNum(to);
          this.err(e.span, "E0321", `cannot cast ${show(from)} to ${show(to)}`, { why: num ? "numeric conversions are explicit method calls" : "these types are unrelated", suggestion: num ? (isPrim(to, "Float") ? "use `.toFloat()`" : "use `.toInt()`, `.round()`, `.floor()` or `.ceil()`") : "casts only move along a class hierarchy or from Any/an interface" });
        }
        return e.safe ? opt(to) : to;
      }
      case "is": {
        this.infer(e.operand, cx);
        (e as any).castTy = this.resolveType(e.type, cx);
        return T.Bool;
      }
      case "range": {
        for (const b of [e.lo, e.hi]) if (b) { const t = this.infer(b, cx, T.Int); if (!this.assignable(t, T.Int)) this.mismatch(b, t, T.Int, "range bound"); }
        return this.preludeType("Range");
      }
      case "lambda": return this.inferLambda(e, cx, exp);
      case "comp": return this.inferComp(e, cx, x);
      case "ternary": {
        const c = this.infer(e.cond, cx, T.Bool);
        if (!this.assignable(c, T.Bool)) this.mismatch(e.cond, c, T.Bool, "condition");
        const n = this.narrowings(e.cond, true, cx);
        const a = this.infer(e.then, n.size ? { ...cx, scope: this.applyNarrow(cx.scope, n) } : cx, exp);
        const n2 = this.narrowings(e.cond, false, cx);
        const b = this.infer(e.else, n2.size ? { ...cx, scope: this.applyNarrow(cx.scope, n2) } : cx, exp ?? (prune(a).k === "nil" ? undefined : a));
        return this.join(a, b, e.else);
      }
      case "match": return this.checkMatch(e.subject, e.arms, cx, exp, e.span, false);
      case "await": return this.inferAwait(e, cx);
      case "spawn": {
        const t = this.infer(e.operand, cx);
        const pt = prune(t);
        if (pt.k === "app" && pt.decl.name === "Task" && pt.decl.builtin) return t;
        return this.taskOf(t);
      }
      case "yield": {
        const f = cx.fn;
        if (!f || !f.gen) return this.err(e.span, "E0330", "`yield` is only allowed inside a `gen fn`", { suggestion: "declare the function `gen fn name() -> Gen<Int>`" });
        if (e.delegate) {
          const t = prune(this.infer(e.operand!, cx));
          const el = this.iterElem(t, e.operand!);
          if (!this.assignable(el, f.yieldTy!)) this.mismatch(e.operand!, el, f.yieldTy!, "delegated value");
          return T.Void;
        }
        if (!e.operand) { this.err(e.span, "E0331", "`yield` needs a value"); return T.Void; }
        const t = this.infer(e.operand, cx, f.yieldTy);
        if (!this.assignable(t, f.yieldTy!)) this.mismatch(e.operand, t, f.yieldTy!, "yielded value"); else this.coerceLit(e.operand, f.yieldTy!);
        return T.Void;
      }
      case "try": {
        const t = this.infer(e.operand, cx);
        return this.resultOf(t, this.preludeType("Error"));
      }
      case "pipe": {
        // x |> f      ==> f(x)           x |> g(a)   ==> g(x, a)
        const r = e.right;
        const left = e.left;
        const call: A.Expr = r.k === "call"
          ? { ...r, args: [{ value: left, span: left.span }, ...r.args] } as A.Expr
          : { k: "call", callee: r, args: [{ value: left, span: left.span }], span: e.span } as A.Expr;
        (e as any).rewritten = call;
        return this.infer(call, cx, exp);
      }
    }
    return T.err;
  }

  /** Common type of two branches. */
  join(a: Ty, b: Ty, at: A.Expr): Ty {
    const pa = prune(a), pb = prune(b);
    if (isPrim(pa, "Never")) return b;
    if (isPrim(pb, "Never")) return a;
    if (this.assignable(b, a)) return pa.k === "nil" ? opt(b) : a;
    if (this.assignable(a, b)) return b;
    if (pa.k === "nil") return opt(b);
    if (pb.k === "nil") return opt(a);
    this.err(at.span, "E0301", `the two branches have different types: ${show(a)} and ${show(b)}`, { why: "both branches of a conditional must produce the same type", suggestion: `make both ${show(a)}, or convert one` });
    return a;
  }

  private inferAwait(e: Extract<A.Expr, { k: "await" }>, cx: Ctx): Ty {
    if (!cx.fn?.async) this.err(e.span, "E0332", "`await` is only allowed inside an `async fn`", { why: "awaiting suspends the function, which needs async", suggestion: cx.fn?.info ? `declare it \`async fn ${cx.fn.info.name}(...)\`` : "make the enclosing function `async`" });
    const t = this.infer(e.operand, cx);
    const pt = prune(t);
    if (pt.k === "app" && pt.decl.name === "Task" && pt.decl.builtin) return pt.args[0];
    if (pt.k === "err") return pt;
    this.err(e.operand.span, "E0333", `cannot await ${show(pt)}; only a Task can be awaited`, { why: "the call is not an async function", suggestion: "remove `await`, or declare the function `async`" });
    return pt;
  }

  private inferPropagate(e: Extract<A.Expr, { k: "propagate" }>, cx: Ctx): Ty {
    const t = prune(this.infer(e.operand, cx));
    const f = cx.fn;
    if (!f || f.isInit) return this.err(e.span, "E0340", "`?` can only be used inside a function that returns a Result or an optional");
    f.usesPropagate = true;
    const rt = prune(f.ret);
    const isResult = (x: Ty) => x.k === "app" && x.decl.name === "Result" && !!x.decl.builtin;
    if (isResult(t)) {
      const tt = t as Extract<Ty, { k: "app" }>;
      const inner = f.async ? this.unTask(rt) : rt;
      if (inner.k === "var") { this.assignable(this.resultOf(freshVar(), tt.args[1]), inner); }
      else if (isResult(inner)) {
        const ia = inner as Extract<Ty, { k: "app" }>;
        if (!this.assignable(tt.args[1], ia.args[1])) this.err(e.span, "E0341", `cannot propagate the error ${show(tt.args[1])} from a function whose error type is ${show(ia.args[1])}`, { why: "`?` returns the Err value as-is, so the error types must be compatible", suggestion: `convert first: \`result.mapErr((e) => ${show(ia.args[1])}(...))?\`` });
      } else if (inner.k !== "err") this.err(e.span, "E0340", `\`?\` on a Result needs the enclosing function to return a Result, but it returns ${show(rt)}`, { suggestion: `change the return type to Result<${show(rt)}, ${show(tt.args[1])}>` });
      return tt.args[0];
    }
    if (t.k === "opt") {
      const inner = f.async ? this.unTask(rt) : rt;
      if (inner.k === "var") this.assignable(opt(freshVar()), inner);
      else if (inner.k !== "opt" && inner.k !== "err") this.err(e.span, "E0340", `\`?\` on an optional needs the enclosing function to return an optional, but it returns ${show(rt)}`, { suggestion: `change the return type to ${show(rt)}?, or use \`value!\` / \`value ?? fallback\`` });
      return t.inner;
    }
    if (t.k === "err") return t;
    return this.err(e.span, "E0342", `\`?\` needs a Result or an optional, not ${show(t)}`, { suggestion: "remove the `?`" });
  }
  private unTask(t: Ty): Ty { const p = prune(t); return p.k === "app" && p.decl.name === "Task" ? p.args[0] : p; }

  private inferId(e: Extract<A.Expr, { k: "id" }>, cx: Ctx, exp?: Ty): Ty {
    const name = e.name;
    const l = cx.scope.lookup(name);
    if (l) {
      l.used = true; if ((l as any).origin) (l as any).origin.used = true;
      (e as any).sym = { k: "local", info: l };
      return l.ty;
    }
    const sym = this.lookupModuleSym(name, cx);
    if (sym) {
      if (sym.k === "fn") {
        (e as any).sym = sym;
        if (sym.fns.length > 1) return this.err(e.span, "E0350", `\`${name}\` is overloaded; call it directly (name(...)) instead of passing it as a value`, { suggestion: `wrap it: (x) => ${name}(x)` });
        return this.fnValueType(sym.fns[0], new Map());
      }
      if (sym.k === "global") { (e as any).sym = sym; return this.globalType(sym.g); }
      if (sym.k === "type") return this.err(e.span, "E0351", `\`${name}\` is a type, not a value`, { suggestion: `call it to construct a value: ${name}(...), or use a member: ${name}.something` });
      if (sym.k === "module") return this.err(e.span, "E0351", `\`${name}\` is a module, not a value`, { suggestion: `use a member: ${name}.something` });
    }
    const bv = this.bareVariant(name);
    if (bv) { (e as any).sym = { k: "variant", ...bv }; return this.variantValue(bv.decl, bv.v, exp); }
    const cands = [...this.visibleNames(cx)];
    const near = closest(name, [...cands, "true", "false", "nil"]);
    const selfT = cx.selfTy && !cx.inStatic ? prune(cx.selfTy) : undefined;
    if (selfT && selfT.k === "app" && this.hasMember(selfT, name)) return this.err(e.span, "E0352", `cannot find \`${name}\` in this scope`, { why: `${selfT.decl.name} has a member named \`${name}\`, but members are always accessed through self`, suggestion: `write \`self.${name}\`` });
    if (Object.prototype.hasOwnProperty.call(VALUE_WORDS, name)) return this.err(e.span, "E0352", VALUE_WORDS[name], { why: `\`${name}\` is not defined in Mycel`, suggestion: "see `mycel help habits`" });
    if (this.innerImplicit.has(name)) return this.err(e.span, "E0352", `cannot find \`${name}\` here`, { why: `\`${name}\` was first set inside a \`{ ... }\` block, so it only exists inside that block`, suggestion: `set it before the block (e.g. \`${name} = 0\`), then change it inside` });
    if (name === "it") return this.err(e.span, "E0352", "`it` can only be used inside a `{ ... }` closure that takes one argument", { why: "`it` is the single argument of a closure written in braces, like `nums.map { it * 2 }`", suggestion: "put the code in braces where a function is expected, or name the argument: `{ x => x * 2 }`" });
    return this.err(e.span, "E0352", `cannot find \`${name}\` in this scope`, { why: "no variable, function, type or import has this name here", suggestion: near ? `did you mean \`${near}\`?` : `declare it with \`let ${name} = ...\`${cx.mod.imports.size ? "" : ", or import it"}` });
  }

  bareVariant(name: string): { decl: TypeDecl; v: VariantInfo } | undefined {
    const r = this.prelude?.types.get("Result");
    const v = r?.variants?.find((x) => x.name === name);
    return r && v && (name === "Ok" || name === "Err") ? { decl: r, v } : undefined;
  }

  visibleNames(cx: Ctx): Set<string> {
    const out = new Set<string>();
    for (let s: Scope | undefined = cx.scope; s; s = s.parent) for (const k of s.vars.keys()) out.add(k);
    for (const k of cx.mod.fns.keys()) out.add(k);
    for (const k of cx.mod.globals.keys()) out.add(k);
    for (const k of cx.mod.types.keys()) out.add(k);
    for (const k of cx.mod.imports.keys()) out.add(k);
    for (const k of this.prelude.fns.keys()) out.add(k);
    for (const k of this.prelude.types.keys()) out.add(k);
    out.add("Ok"); out.add("Err");
    return out;
  }

  lookupModuleSym(name: string, cx: Pick<Ctx, "mod">):
    | { k: "fn"; fns: FnInfo[] } | { k: "global"; g: GlobalInfo } | { k: "type"; decl: TypeDecl } | { k: "module"; mod: ModuleInfo } | undefined {
    const m = cx.mod;
    const f = m.fns.get(name); if (f) return { k: "fn", fns: f };
    const g = m.globals.get(name); if (g) return { k: "global", g };
    const t = m.types.get(name); if (t) return { k: "type", decl: t };
    const imp = m.imports.get(name);
    if (imp) {
      switch (imp.kind) {
        case "fn": return { k: "fn", fns: imp.fns };
        case "global": return { k: "global", g: imp.g };
        case "type": return { k: "type", decl: imp.decl };
        case "module": return { k: "module", mod: imp.mod };
      }
    }
    const pf = this.prelude?.fns.get(name); if (pf) return { k: "fn", fns: pf };
    const pt = this.prelude?.types.get(name); if (pt) return { k: "type", decl: pt };
    return undefined;
  }

  /** Type of a function used as a value (generic parameters become fresh variables). */
  fnValueType(f: FnInfo, owner: Map<Ty, Ty>): Ty {
    if (f.module.checked === false && (f as any).inferRet) this.checkFnBody(f);
    const m = new Map(owner);
    f.typeParams.forEach((p) => m.set(p, freshVar()));
    const ret = subst(f.ret, m);
    return fnTy(f.params.map((p) => subst(p.ty, m)), f.async ? this.taskOf(ret) : ret, { names: f.params.map((p) => p.name), defaults: f.params.map((p) => p.hasDefault) });
  }

  variantValue(decl: TypeDecl, v: VariantInfo, exp?: Ty): Ty {
    const m = new Map<Ty, Ty>();
    decl.params.forEach((p) => m.set(p, freshVar()));
    const selfTy = app(decl, decl.params.map((p) => m.get(p)!));
    if (exp) this.assignable(selfTy, exp);
    if (!v.fields.length) return selfTy;
    return fnTy(v.fields.map((f) => subst(f.ty, m)), selfTy, { names: v.fields.map((f) => f.name ?? "") });
  }

  // ---------- operators ----------
  private inferUnary(e: Extract<A.Expr, { k: "unary" }>, cx: Ctx, exp?: Ty): Ty {
    if (e.op === "-" && e.operand.k === "int" && e.operand.value === 9223372036854775808n) {
      if (exp && (isPrim(exp, "Float") || (exp.k === "opt" && isPrim(exp.inner, "Float")))) {
        (e.operand as any).k = "float"; (e.operand as any).value = Number(e.operand.value); (e.operand as any).ty = T.Float;
        return T.Float;
      }
      (e.operand as any).ty = T.Int;
      return T.Int;
    }
    const t = this.infer(e.operand, cx, e.op === "-" ? exp : e.op === "!" ? T.Bool : T.Int);
    let p = prune(t);
    if (p.k === "err") return p;
    if (p.k === "var") {
      if (e.op === "!") { this.assign(p, T.Bool); p = prune(p); }
      else if (e.op === "~") { this.assign(p, T.Int); p = prune(p); }
      else if (e.op === "-") {
        if (exp && isPrim(exp, "Float")) this.assign(p, T.Float);
        else this.assign(p, T.Int);
        p = prune(p);
      }
    }
    if (e.op === "!") { if (!isPrim(p, "Bool") && !this.isForeignVal(p)) return this.err(e.span, "E0360", `\`!\` needs a Bool, not ${show(p)}`, { suggestion: p.k === "opt" ? "compare with nil: `value != nil`" : "write a comparison, e.g. `x != 0`" }); return T.Bool; }
    if (e.op === "~") { if (!isPrim(p, "Int")) return this.err(e.span, "E0360", `\`~\` needs an Int, not ${show(p)}`); return T.Int; }
    if (isPrim(p, "Int") || isPrim(p, "Float") || this.isForeignVal(p)) return p;
    const base = this.declTypeOf(p);
    if (base) { const m = this.findMethods(base, "operator -").find((c) => c.fn.params.length === 0); if (m) { (e as any).opFn = m.fn; return subst(m.fn.ret, m.map); } }
    if (p.k === "param" && p.bounds.some((b) => b.k === "app" && b.decl.name === "Numeric")) return p;
    return this.err(e.span, "E0360", `cannot negate ${show(p)}`, { suggestion: "unary minus works on Int and Float" });
  }

  private tryLitFloat(lit: A.Expr, other: Ty): boolean {
    if ((lit.k === "int" || (lit.k === "unary" && lit.op === "-" && lit.operand.k === "int")) && isPrim(other, "Float")) { this.coerceLit(lit, T.Float); return true; }
    return false;
  }

  private inferBinary(e: Extract<A.Expr, { k: "binary" }>, cx: Ctx, exp?: Ty): Ty {
    const op = e.op;
    if (op === "&&" || op === "||") {
      const l = this.infer(e.left, cx, T.Bool);
      if (!this.assignable(l, T.Bool)) this.mismatch(e.left, l, T.Bool, "operand");
      const n = this.narrowings(e.left, op === "&&", cx);
      const r = this.infer(e.right, n.size ? { ...cx, scope: this.applyNarrow(cx.scope, n) } : cx, T.Bool);
      if (!this.assignable(r, T.Bool)) this.mismatch(e.right, r, T.Bool, "operand");
      return T.Bool;
    }
    if (op === "??") {
      const l = prune(this.infer(e.left, cx));
      let inner: Ty;
      if (l.k === "opt") inner = l.inner;
      else if (l.k === "nil") inner = freshVar();
      else { if (l.k !== "err") this.err(e.left.span, "E0361", `the left side of \`??\` must be optional, but it is ${show(l)}`, { why: "`a ?? b` means \"a, or b if a is nil\"", suggestion: "remove the `?? ...` — this value is never nil" }); inner = l; }
      const r = this.infer(e.right, cx, inner);
      const pr = prune(r);
      if (pr.k === "opt") { if (!this.assignable(pr.inner, inner)) this.mismatch(e.right, r, inner); return opt(inner); }
      if (!this.assignable(r, inner)) this.mismatch(e.right, r, inner, "fallback");
      else this.coerceLit(e.right, inner);
      return inner;
    }
    if (op === "==" || op === "!=") {
      const l = this.infer(e.left, cx);
      const r = this.infer(e.right, cx, l);
      this.tryLitFloat(e.right, l); this.tryLitFloat(e.left, r);
      let pl = prune(l), pr = prune(r);
      if (pl.k === "var" && pr.k !== "var") { this.assign(pl, pr); pl = prune(pl); }
      else if (pr.k === "var" && pl.k !== "var") { this.assign(pr, pl); pr = prune(pr); }
      else if (pl.k === "var" && pr.k === "var") { this.assign(pl, pr); }
      if (pl.k === "err" || pr.k === "err") return T.Bool;
      if (this.isForeignVal(pl) || this.isForeignVal(pr)) return T.Bool;
      const base = this.declTypeOf(pl);
      if (base) { const m = this.findMethods(base, "operator ==").find((c) => c.fn.params.length === 1); if (m) { (e as any).opFn = m.fn; return T.Bool; } }
      if (!this.assignable(r, l) && !this.assignable(l, r)) {
        const num = (isPrim(pl, "Int") && isPrim(pr, "Float")) || (isPrim(pl, "Float") && isPrim(pr, "Int"));
        if (!num) {
          this.err(e.span, "E0362", `cannot compare ${show(pl)} with ${show(pr)}`, { why: "== needs both sides to have the same type", suggestion: isNum(pl) && isNum(pr) ? "convert one side with `.toFloat()` or `.toInt()`" : pl.k === "opt" || pr.k === "opt" ? "unwrap the optional first, or compare against nil" : undefined });
        }
      }
      return T.Bool;
    }
    const l0 = this.infer(e.left, cx, ["+", "-", "*", "/", "//", "%", "**"].includes(op) ? exp : undefined);
    const nd = this.diags.length;
    const r0 = this.infer(e.right, cx, isNum(l0) ? l0 : undefined);
    if (op === "//" && e.right.k === "id") this.slashSlashComment(e, nd);
    this.tryLitFloat(e.right, l0); this.tryLitFloat(e.left, r0);
    const l = prune(e.left && (e.left as any).ty), r = prune((e.right as any).ty);
    return this.binOp(op, l, r, e);
  }

  /** `let a = 5 // count`: the lexer reads `// count` as floor division by `count`; when `count` does not exist, the writer meant a comment. */
  private slashSlashComment(e: Extract<A.Expr, { k: "binary" }>, from: number) {
    const d = this.diags[from];
    if (!d || d.severity !== "error" || !/^cannot find `/.test(d.message) || !e.right.span?.src) return;
    const src = e.right.span.src, t = src.text;
    const at = t.lastIndexOf("//", e.right.span.start);
    if (at < 0 || at < e.left.span.end) return;
    const ls = t.lastIndexOf("\n", at - 1) + 1, nl = t.indexOf("\n", at), le = nl < 0 ? t.length : nl;
    const span = { src, start: at, end: le };
    this.diags.splice(from, this.diags.length - from, { severity: "error", code: "E0001", message: "comments start with # in Mycel", span, why: "`//` is whole-number division in Mycel (`7 // 2` is 3), and `" + (e.right as any).name + "` is not a name in scope, so this looks like an old comment", suggestion: `write \`${(t.slice(ls, at) + "#" + t.slice(at + 2, le)).trimEnd()}\` (or run \`mycel fmt --fix\` to rewrite old files)` });
  }

  private binOp(op: string, l0: Ty, r0: Ty, e: A.Expr): Ty {
    let l = prune(l0), r = prune(r0);
    const cmp = ["<", "<=", ">", ">="].includes(op);
    if (l.k === "err" || r.k === "err") return cmp ? T.Bool : l.k === "err" ? r : l;
    if (l.k === "var" || r.k === "var") {
      if (l.k === "var" && r.k !== "var") {
        if (isPrim(r, "Int")) { this.assign(l, T.Int); l = prune(l); }
        else if (isPrim(r, "Float")) { this.assign(l, T.Float); l = prune(l); }
        else if (isPrim(r, "String") && (op === "+" || cmp)) { this.assign(l, T.String); l = prune(l); }
        else if (isPrim(r, "Bool") && (op === "==" || op === "!=")) { this.assign(l, T.Bool); l = prune(l); }
      } else if (r.k === "var" && l.k !== "var") {
        if (isPrim(l, "Int")) { this.assign(r, T.Int); r = prune(r); }
        else if (isPrim(l, "Float")) { this.assign(r, T.Float); r = prune(r); }
        else if (isPrim(l, "String") && (op === "+" || cmp)) { this.assign(r, T.String); r = prune(r); }
        else if (isPrim(l, "Bool") && (op === "==" || op === "!=")) { this.assign(r, T.Bool); r = prune(r); }
      } else if (l.k === "var" && r.k === "var") {
        this.assign(l, r);
        l = prune(l); r = prune(r);
        if (op === "/") return T.Float;
        if (["+", "-", "*", "//", "%", "**"].includes(op)) return cmp ? T.Bool : l;
        if (cmp) return T.Bool;
      }
    }
    const bothI = isPrim(l, "Int") && isPrim(r, "Int"), bothF = isPrim(l, "Float") && isPrim(r, "Float");
    const bits = ["&", "|", "^", "<<", ">>"];
    if (bothI) {
      if (cmp) return T.Bool;
      if (op === "/") return T.Float;
      return T.Int;
    }
    if (bothF) {
      if (bits.includes(op)) return this.err(e.span, "E0363", `\`${op}\` works on Int, not Float`);
      return cmp ? T.Bool : T.Float;
    }
    const mixedNum = (isPrim(l, "Int") && isPrim(r, "Float")) || (isPrim(l, "Float") && isPrim(r, "Int"));
    if (mixedNum) {
      if (bits.includes(op)) return this.err(e.span, "E0363", `\`${op}\` works on Int, not Float`, { why: "bitwise operations require whole integers", suggestion: "convert the Float with `.toInt()`" });
      if (cmp) return T.Bool;
      return T.Float;
    }
    if (op === "+" && isPrim(l, "String") && isPrim(r, "String")) return T.String;
    if (this.isForeignVal(l) || this.isForeignVal(r)) {
      if (cmp) return T.Bool;
      if (!bits.includes(op)) {
        if (op === "/") return T.Float;
        if (isPrim(l, "Float") || isPrim(r, "Float")) return T.Float;
        if (op === "+" && (isPrim(l, "String") || isPrim(r, "String"))) return T.String;
        return this.isForeignVal(l) ? l : r;
      }
    }
    if (this.isForeignVal(l) || this.isForeignVal(r)) {
      if (cmp) return T.Bool;
      if (!bits.includes(op)) {
        if (op === "/") return T.Float;
        if (isPrim(l, "Float") || isPrim(r, "Float")) return T.Float;
        if (op === "+" && (isPrim(l, "String") || isPrim(r, "String"))) return T.String;
        return this.isForeignVal(l) ? l : r;
      }
    }
    if (cmp && ((isPrim(l, "String") && isPrim(r, "String")) || (isPrim(l, "Char") && isPrim(r, "Char")))) return T.Bool;
    if (op === "+" && l.k === "app" && l.decl.name === "Array" && l.decl.builtin && this.assignable(r, l)) return l;
    if (l.k === "param" && r === l) {
      if (!cmp && !bits.includes(op) && l.bounds.some((b) => b.k === "app" && b.decl.name === "Numeric")) return l;
      if (cmp && l.bounds.some((b) => b.k === "app" && ["Comparable", "Numeric"].includes(b.decl.name))) return T.Bool;
    }
    // operator overloading: user classes, structs, enums and extensions
    const base = this.declTypeOf(l);
    const cands: { fn: FnInfo; map: Map<Ty, Ty> }[] = [];
    const lookup = (o: string) => { const c: { fn: FnInfo; map: Map<Ty, Ty> }[] = []; if (base) c.push(...this.findMethods(base, "operator " + o)); c.push(...this.findExt(l, "operator " + o)); return c; };
    cands.push(...lookup(op));
    let useOp = op;
    if (!cands.length && cmp) { cands.push(...lookup("<")); useOp = "<"; }
    const hit = cands.find((c) => c.fn.params.length === 1 && this.canAssign(r, subst(c.fn.params[0].ty, c.map)));
    if (hit) {
      this.assignable(r, subst(hit.fn.params[0].ty, hit.map));
      (e as any).opFn = hit.fn; (e as any).opUse = useOp;
      return cmp ? T.Bool : subst(hit.fn.ret, hit.map);
    }
    const ls = show(l), rs = show(r);
    let sug: string | undefined, why: string | undefined;
    if ((isPrim(l, "Int") && isPrim(r, "Float")) || (isPrim(l, "Float") && isPrim(r, "Int"))) { why = "Int and Float are different types; mixing them silently loses precision"; sug = `convert explicitly: ${isPrim(l, "Int") ? "left.toFloat()" : "right.toFloat()"}, or .toInt() on the Float`; }
    else if (op === "+" && (isPrim(l, "String") || isPrim(r, "String"))) { why = "`+` joins two Strings only"; sug = 'use interpolation: f"{a}{b}" or str(value)'; }
    else if (l.k === "opt" || r.k === "opt") { why = "an operand might be nil"; sug = "unwrap it first: `x!`, `x ?? default`, or `if let`"; }
    else if (cands.length && cands.length > 0) why = `${ls} defines operator ${op}, but not for a ${rs} operand`;
    else if (base || l.k === "app") why = `${ls} does not define \`operator ${op}\``, sug = `add \`operator ${op}(other: ${ls}) -> ...\` to ${ls}`;
    return this.err(e.span, "E0363", `cannot apply \`${op}\` to ${ls} and ${rs}`, { why, suggestion: sug });
  }

  // ---------- assignment ----------
  private inferAssign(e: Extract<A.Expr, { k: "assign" }>, cx: Ctx): Ty {
    const tgt = e.target;
    const compound = e.op !== "=" ? e.op.slice(0, -1) : undefined;
    if (tgt.k === "tuple") {
      if (compound) return this.err(e.span, "E0370", "compound assignment cannot target a tuple");
      const vt = prune(this.infer(e.value, cx));
      if (vt.k !== "tuple" || vt.elems.length !== tgt.elems.length) return this.err(e.span, "E0370", `cannot destructure ${show(vt)} into ${tgt.elems.length} targets`, { suggestion: "the right side must be a tuple with the same number of elements" });
      tgt.elems.forEach((el, i) => { const tt = this.assignTargetType(el, cx); if (!this.assignable(vt.elems[i], tt)) this.mismatch(el, vt.elems[i], tt, "assigned value"); });
      (tgt as any).ty = vt;
      return T.Void;
    }
    const tt = this.assignTargetType(tgt, cx);
    (tgt as any).ty = tt;
    if (compound) {
      const vt = this.infer(e.value, cx, isNum(tt) ? tt : undefined);
      this.tryLitFloat(e.value, tt);
      if (compound === "??") {
        const pt = prune(tt);
        if (pt.k !== "opt") return this.err(e.span, "E0361", "`??=` needs an optional target");
        if (!this.assignable(vt, pt.inner)) this.mismatch(e.value, vt, pt.inner);
        return T.Void;
      }
      const res = this.binOp(compound, prune(tt), prune((e.value as any).ty), e);
      if (prune(res).k !== "err" && !this.assignable(res, tt)) this.mismatch(e.value, res, tt, "result");
      return T.Void;
    }
    const vt = this.infer(e.value, cx, tt);
    if (!this.assignable(vt, tt)) this.mismatch(e.value, vt, tt, "assigned value"); else this.coerceLit(e.value, tt);
    return T.Void;
  }

  private assignTargetType(t: A.Expr, cx: Ctx): Ty {
    switch (t.k) {
      case "id": {
        const l = cx.scope.lookup(t.name);
        if (l) {
          l.used = true;
          if (!l.mutable) {
            const why = l.kind === "param" ? "function parameters are immutable" : `\`${t.name}\` was declared with \`let\``;
            this.err(t.span, "E0371", `cannot assign to \`${t.name}\``, { why, suggestion: l.kind === "param" ? `copy it first: \`var ${t.name}2 = ${t.name}\`` : `declare it with \`var ${t.name} = ...\` instead of \`let\`` });
          }
          (t as any).sym = { k: "local", info: l };
          const origin = (l as any).origin as LocalInfo | undefined;
          const declared = l.narrowedFrom ?? l.ty;
          if (l.narrowedFrom) { l.ty = l.narrowedFrom; if (origin) origin.ty = origin.narrowedFrom ?? origin.ty; }
          return declared;
        }
        const sym = this.lookupModuleSym(t.name, cx);
        if (sym?.k === "global") {
          (t as any).sym = sym;
          if (!sym.g.mutable) this.err(t.span, "E0371", `cannot assign to \`${t.name}\` because it is declared with \`let\``, { suggestion: `declare it with \`var\`` });
          if (sym.g.module !== cx.mod && !cx.mod.name.startsWith("repl_")) this.err(t.span, "E0372", `cannot assign to \`${t.name}\` from another module`, { suggestion: "expose a function that updates it" });
          return this.globalType(sym.g);
        }
        return this.inferId(t, cx);
      }
      case "member": {
        const ref = this.resolveRef(t.obj, cx);
        if (ref?.k === "type") {
          const base = app(ref.decl, ref.decl.params.map(() => freshVar()));
          const f = this.findField(base as any, t.name, true);
          if (f) { (t as any).mres = { kind: "static-field", f: f.f, decl: ref.decl }; if (!f.f.mutable) this.err(t.span, "E0371", `cannot assign to constant \`${t.name}\``, { suggestion: "declare it `static var`" }); return f.f.ty; }
        }
        const objTy = prune(this.infer(t.obj, cx));
        const base = objTy.k === "app" ? objTy : undefined;
        if (!base) { return this.inferMember(t, cx); }
        const ff = this.findField(base, t.name);
        if (ff) {
          (t as any).mres = { kind: "field", f: ff.f }; (t as any).ty = subst(ff.f.ty, ff.map);
          this.checkAccess(ff.f.vis, ff.f.owner, cx, t.span, t.name);
          const inInit = cx.fn?.isInit && t.obj.k === "self" && cx.cls === ff.f.owner;
          if (inInit) cx.fn!.selfAssigned?.add(t.name);
          if (base.decl.kind === "struct") this.err(t.span, "E0373", `cannot modify field \`${t.name}\` of struct ${base.decl.name}`, { why: "structs are immutable values", suggestion: `build a modified copy: \`value.with(${t.name}: ...)\`, or make ${base.decl.name} a class` });
          else if (!ff.f.mutable && !inInit) this.err(t.span, "E0371", `cannot assign to \`${t.name}\` because the field is declared with \`let\``, { suggestion: `declare the field \`var ${t.name}\`${ff.f.owner.kind === "class" ? "" : ""}` });
          return subst(ff.f.ty, ff.map);
        }
        const gs = this.findGetter(base, t.name);
        if (gs?.setter) { (t as any).mres = { kind: "setter", fn: gs.setter }; return subst(gs.ty, gs.map); }
        if (gs) { this.err(t.span, "E0371", `property \`${t.name}\` has no setter`, { suggestion: `add \`set ${t.name}(value) { ... }\`` }); return subst(gs.ty, gs.map); }
        if (this.isForeignVal(objTy)) { (t as any).mres = { kind: "foreign-set-attr", name: t.name }; return objTy; }
        return this.inferMember(t, cx);
      }
      case "index": {
        const ot = prune(this.infer(t.obj, cx));
        const it = this.infer(t.index, cx);
        if (ot.k === "app" && ot.decl.name === "Array" && ot.decl.builtin) { if (!this.assignable(it, T.Int)) this.mismatch(t.index, it, T.Int, "index"); (t as any).idx = "array"; return ot.args[0]; }
        if (ot.k === "app" && ot.decl.name === "Map" && ot.decl.builtin) { if (!this.assignable(it, ot.args[0])) this.mismatch(t.index, it, ot.args[0], "key"); (t as any).idx = "map"; return ot.args[1]; }
        if (this.isForeignVal(ot)) { if (isPrim(prune(it), "Void")) this.mismatch(t.index, it, T.Any, "key"); (t as any).idx = "foreign"; return ot; }
        if (ot.k === "err") return ot;
        return this.err(t.span, "E0374", `cannot assign through an index on ${show(ot)}`, { why: isPrim(ot, "String") ? "Strings are immutable" : undefined, suggestion: "indexed assignment works on arrays and maps" });
      }
      default: return this.err(t.span, "E0370", "this expression cannot be assigned to");
    }
  }

  checkAccess(vis: A.Visibility, owner: TypeDecl, cx: Ctx, span: Span, name: string) {
    if (vis === "public") return;
    const inside = cx.cls && (cx.cls === owner || (vis === "protected" && supertypes(app(cx.cls, cx.cls.params) as any).some((s) => s.decl === owner)));
    if (!inside) this.err(span, "E0380", `\`${name}\` is ${vis} in ${owner.name}`, { why: vis === "private" ? `private members are only visible inside ${owner.name}` : `protected members are visible in ${owner.name} and its subclasses`, suggestion: `make it \`public\` (remove \`${vis}\`) or add a public method that exposes it` });
  }

  // ---------- indexing ----------
  private inferIndex(e: Extract<A.Expr, { k: "index" }>, cx: Ctx): Ty {
    let ot = this.chainBase(e.obj, cx);
    const chained = !!(e.optional || (e.obj as any).chain);
    if (e.optional) {
      if (ot.k === "opt") ot = prune(ot.inner);
      else if (ot.k !== "err") this.err(e.span, "E0381", `\`?[\` used on ${show(ot)}, which is not optional`, { suggestion: "use plain `[...]`" });
    } else if (ot.k === "opt") {
      this.err(e.obj.span, "E0382", `cannot index ${show(ot)} because it might be nil`, { why: "optional values must be unwrapped before use", suggestion: "use `value?[i]`, `value![i]`, or `if let v = value { v[i] }`" });
      ot = prune(ot.inner);
    }
    const it = this.infer(e.index, cx, ot.k === "app" && ot.decl.name === "Map" ? ot.args[0] : T.Int);
    const pit = prune(it);
    let res: Ty;
    const isRange = pit.k === "app" && pit.decl.name === "Range" && pit.decl.builtin;
    if (ot.k === "app" && ot.decl.name === "Array" && ot.decl.builtin) {
      if (isRange) { (e as any).idx = "slice"; res = ot; }
      else { if (!this.assignable(it, T.Int)) this.mismatch(e.index, it, T.Int, "index"); (e as any).idx = "array"; res = ot.args[0]; }
    } else if (ot.k === "app" && ot.decl.name === "Map" && ot.decl.builtin) {
      if (!this.assignable(it, ot.args[0])) this.mismatch(e.index, it, ot.args[0], "key"); else this.coerceLit(e.index, ot.args[0]);
      (e as any).idx = "map"; res = opt(ot.args[1]);
    } else if (isPrim(ot, "String")) {
      if (isRange) { (e as any).idx = "slice"; res = T.String; }
      else { if (!this.assignable(it, T.Int)) this.mismatch(e.index, it, T.Int, "index"); (e as any).idx = "string"; res = T.Char; }
    } else if (this.isForeignVal(ot)) {
      if (isPrim(pit, "Void")) this.mismatch(e.index, it, T.Any, "index");
      (e as any).idx = "foreign"; res = ot;
    } else if (ot.k === "err") res = ot;
    else {
      const base = this.declTypeOf(ot);
      const m = base && this.findMethods(base, "operator []").find((c) => c.fn.params.length === 1 && this.canAssign(pit, subst(c.fn.params[0].ty, c.map)));
      if (m) { (e as any).idx = "op"; (e as any).opFn = m.fn; res = subst(m.fn.ret, m.map); }
      else res = this.err(e.span, "E0383", `${show(ot)} cannot be indexed`, { suggestion: "only arrays, maps and Strings support `[...]`; define `operator [](i: Int) -> T` for your own types" });
    }
    if (chained) { (e as any).chain = true; (e as any).chainInner = res; return prune(res).k === "opt" ? res : opt(res); }
    return res;
  }

  // ---------- references to types / modules ----------
  resolveRef(e: A.Expr, cx: Ctx): { k: "type"; decl: TypeDecl } | { k: "module"; mod: ModuleInfo } | undefined {
    if (e.k === "id") {
      if (cx.scope.lookup(e.name)) return undefined;
      const s = this.lookupModuleSym(e.name, cx);
      if (s?.k === "type") { (e as any).sym = s; return s; }
      if (s?.k === "module") { (e as any).sym = s; return s; }
      return undefined;
    }
    if (e.k === "member" && !e.optional) {
      const inner = this.resolveRef(e.obj, cx);
      if (inner?.k === "module") {
        const t = inner.mod.types.get(e.name);
        if (t) {
          if (!t.pub && inner.mod !== cx.mod) this.err(e.span, "E0203", `type \`${e.name}\` is private to module ${inner.mod.name}`, { suggestion: "mark it `pub`" });
          const r = { k: "type" as const, decl: t };
          (e as any).sym = r; return r;
        }
      }
    }
    return undefined;
  }

  private inferMember(e: Extract<A.Expr, { k: "member" }>, cx: Ctx): Ty {
    if (e.obj.k === "super") return this.err(e.span, "E0313", "`super` members must be called: `super.method(...)`");
    const ref = this.resolveRef(e.obj, cx);
    if (ref?.k === "module") return this.moduleMember(ref.mod, e, cx);
    if (ref?.k === "type") return this.staticMember(ref.decl, e, cx);
    let ot = this.chainBase(e.obj, cx);
    const chained = !!(e.optional || (e.obj as any).chain);
    if (e.optional) {
      if (ot.k === "opt") ot = prune(ot.inner);
      else if (ot.k !== "err") this.err(e.span, "E0381", `\`?.\` used on ${show(ot)}, which is not optional`, { why: "`?.` is for optional values", suggestion: "use plain `.`" });
    } else if (ot.k === "opt") {
      this.err(e.obj.span, "E0382", `cannot use \`.${e.name}\` on ${show(ot)} because it might be nil`, { why: "optional values must be unwrapped before use", suggestion: `use \`?.${e.name}\` (result becomes optional), \`value!.${e.name}\` (panics on nil), or \`if let v = value { v.${e.name} }\`` });
      ot = prune(ot.inner);
    }
    const res = this.valueMember(ot, e, cx);
    if (chained) { (e as any).chain = true; (e as any).chainInner = res; const p = prune(res); return p.k === "opt" || p.k === "err" ? p : opt(p); }
    return res;
  }

  /** Type of a receiver; inside an `a?.b.c` chain the receiver is the un-wrapped type of the previous link. */
  private chainBase(obj: A.Expr, cx: Ctx): Ty {
    const t = prune(this.infer(obj, cx));
    const inner = (obj as any).chain ? (obj as any).chainInner as Ty | undefined : undefined;
    return inner ? prune(inner) : t;
  }

  private moduleMember(mod: ModuleInfo, e: Extract<A.Expr, { k: "member" }>, cx: Ctx): Ty {
    const n = e.name;
    const fns = mod.fns.get(n), g = mod.globals.get(n);
    const pub = (p: boolean) => { if (!p && mod !== cx.mod) this.err(e.span, "E0203", `\`${n}\` is private to module ${mod.name}`, { why: "only `pub` declarations can be used from other modules", suggestion: `add \`pub\` to ${n} in ${mod.file}` }); };
    if (fns) {
      pub(fns.some((f) => f.pub));
      (e as any).sym = { k: "fn", fns };
      if (fns.length > 1) return this.err(e.span, "E0350", `\`${n}\` is overloaded; call it directly instead of passing it as a value`);
      return this.fnValueType(fns[0], new Map());
    }
    if (g) { pub(g.pub); (e as any).sym = { k: "global", g }; return this.globalType(g); }
    if (mod.types.has(n)) return this.err(e.span, "E0351", `\`${mod.name}.${n}\` is a type, not a value`, { suggestion: `construct it: ${mod.name}.${n}(...)` });
    const all = [...mod.fns.keys(), ...mod.globals.keys(), ...mod.types.keys()].filter((k) => this.isPub(mod, k));
    const near = closest(n, all);
    return this.err(e.span, "E0202", `module ${mod.name} has no member \`${n}\``, { suggestion: near ? `did you mean \`${near}\`?` : `available: ${all.join(", ") || "(nothing exported)"}` });
  }

  private staticMember(decl: TypeDecl, e: Extract<A.Expr, { k: "member" }>, cx: Ctx): Ty {
    const n = e.name;
    const selfApp = app(decl, decl.params.map(() => freshVar())) as Extract<Ty, { k: "app" }>;
    (e as any).mres = { kind: "static", decl };
    const v = decl.variants?.find((x) => x.name === n);
    if (v) { (e as any).mres = { kind: "variant", decl, v }; return this.variantValue(decl, v); }
    const ms = this.findMethods(selfApp, n, true);
    if (ms.length) {
      (e as any).mres = { kind: "static-method", decl, cands: ms };
      if (ms.length > 1) return this.err(e.span, "E0350", `\`${n}\` is overloaded; call it directly`);
      this.checkAccess(ms[0].fn.vis, decl, cx, e.span, n);
      return this.fnValueType(ms[0].fn, ms[0].map);
    }
    const f = this.findField(selfApp, n, true);
    if (f) { this.checkAccess(f.f.vis, f.f.owner, cx, e.span, n); (e as any).mres = { kind: "static-field", f: f.f, decl }; return subst(f.f.ty, f.map); }
    const g = [...selfApp.decl.getters.entries()].find(([k, fn]) => k === n && fn.static);
    if (g) { (e as any).mres = { kind: "static-getter", fn: g[1], decl }; return g[1].ret; }
    const cands = [...(decl.variants ?? []).map((x) => x.name), ...decl.statics.keys(), ...[...decl.fields.values()].filter((x) => x.static).map((x) => x.name)];
    const near = closest(n, cands);
    const inst = decl.methods.has(n) || decl.fields.has(n);
    return this.err(e.span, "E0390", `${decl.name} has no static member \`${n}\``, {
      why: inst ? `\`${n}\` is an instance member; it needs a ${decl.name} value` : undefined,
      suggestion: near ? `did you mean \`${decl.name}.${near}\`?` : cands.length ? `static members: ${cands.join(", ")}` : undefined,
    });
  }

  private valueMember(ot: Ty, e: Extract<A.Expr, { k: "member" }>, cx: Ctx): Ty {
    const n = e.name;
    if (ot.k === "err") return ot;
    if (ot.k === "var") return this.err(e.span, "E0391", `the type of this value is not known yet, so \`.${n}\` cannot be resolved`, { suggestion: "add a type annotation where the value is declared" });
    if (ot.k === "tuple") {
      const i = Number(n);
      if (Number.isInteger(i) && String(i) === n && i < ot.elems.length) { (e as any).mres = { kind: "tuple", i }; return ot.elems[i]; }
      return this.err(e.span, "E0392", `tuple ${show(ot)} has no element \`${n}\``, { suggestion: `elements are .0 to .${ot.elems.length - 1}` });
    }
    if (ot.k === "fn") return this.err(e.span, "E0393", "a function has no members", { suggestion: "call it first: `f(...)`" });
    if (ot.k === "nil") return this.err(e.span, "E0393", "nil has no members");
    let base: Extract<Ty, { k: "app" }> | undefined;
    if (ot.k === "param") {
      for (const b of ot.bounds) { const bb = prune(b); if (bb.k === "app") { base = bb; if (this.hasMember(bb, n)) break; } }
      if (!base) return this.err(e.span, "E0393", `\`${n}\` is not available on ${ot.name}`, { why: `${ot.name} has no bounds, so nothing is known about it`, suggestion: `constrain it: <${ot.name}: SomeInterface>` });
      (e as any).dyn = true;
    } else if (ot.k === "prim" && ot.name === "Any") {
      return this.err(e.span, "E0393", `Any has no members`, { why: "Any hides the real type", suggestion: "narrow it first: `if x is String { ... }` or `x as? String`" });
    } else base = this.declTypeOf(ot);
    if (!base) return this.err(e.span, "E0393", `${show(ot)} has no member \`${n}\``);
    const ff = this.findField(base, n);
    if (ff) { this.checkAccess(ff.f.vis, ff.f.owner, cx, e.span, n); (e as any).mres = { kind: "field", f: ff.f }; return subst(ff.f.ty, ff.map); }
    const gs = this.findGetter(base, n);
    if (gs) {
      if (gs.fn) this.checkAccess(gs.fn.vis, gs.fn.owner!, cx, e.span, n);
      if (gs.fn && (gs.fn as any).inferRet && !this.bodyDone.has(gs.fn)) this.checkFnBody(gs.fn);
      (e as any).mres = { kind: "getter", fn: gs.fn, iface: gs.iface };
      return subst(gs.fn ? gs.fn.ret : gs.ty, gs.map);
    }
    const ms = this.findMethods(base, n);
    const ext = this.findExt(ot, n);
    const all = [...ms, ...ext];
    if (all.length) {
      (e as any).mres = { kind: "methods", cands: all, recvTy: ot };
      if (all.length > 1) return this.err(e.span, "E0350", `\`${n}\` is overloaded; call it directly instead of passing it as a value`);
      const only = all[0];
      if (only.fn.owner) this.checkAccess(only.fn.vis, only.fn.owner, cx, e.span, n);
      return this.fnValueType(only.fn, only.map);
    }
    if (this.isForeignVal(ot)) { (e as any).mres = { kind: "foreign-attr", name: n }; return ot; }
    return this.err(e.span, "E0390", `${show(ot)} has no member \`${n}\``, this.memberSuggestion(base, n, ot));
  }

  private hasMember(b: Extract<Ty, { k: "app" }>, n: string) { return !!(this.findField(b, n) || this.findGetter(b, n) || this.findMethods(b, n).length); }

  private memberSuggestion(base: Extract<Ty, { k: "app" }>, n: string, ot: Ty) {
    if (isPrim(ot, "String") && ["has", "contains_all", "contains_any", "containsAll", "containsAny", "hasAll", "hasAny"].includes(n)) return { why: "Mycel has one way to ask whether text holds something: `in`", suggestion: "write `\"@\" in w`; \"all of\" is `a in w and b in w`, \"any of\" is `a in w or b in w`" };
    if (isPrim(ot, "String") && n === "join") return { why: "`join` in Mycel is called on the list (e.g. `items.join(\", \")`), not on the separator", suggestion: "write `list.join(separator)`" };
    const names = new Set<string>();
    for (const s of supertypes(base)) { for (const k of s.decl.fields.keys()) names.add(k); for (const k of s.decl.methods.keys()) if (!k.startsWith("operator")) names.add(k); for (const k of s.decl.getters.keys()) names.add(k); }
    for (const m of this.order) for (const e of m.exts) for (const k of e.methods.keys()) if (this.canAssign(ot, e.target)) names.add(k);
    const near = closest(n, names);
    const hints: Record<string, string> = { size: "length", count: "length", len: "length", append: "push", add: "push", toUpperCase: "upper", toLowerCase: "lower", contains: "contains", keys: "keys", substr: "substring", includes: "contains", forEach: "forEach", strip: "trim", lstrip: "trimStart", rstrip: "trimEnd", startswith: "startsWith", endswith: "endsWith", items: "entries", sort: "sorted", extend: "append", find: "indexOf", splitlines: "lines", slice: "substring", padStart: "padLeft", padEnd: "padRight" };
    const alias = hints[n] && names.has(hints[n]) ? hints[n] : undefined;
    return { why: `${show(ot)} does not have a field, property or method named \`${n}\``, suggestion: near || alias ? `did you mean \`${near ?? alias}\`?` : names.size ? `available: ${[...names].slice(0, 14).join(", ")}${names.size > 14 ? ", ..." : ""}` : undefined };
  }

  private inferImplicit(e: Extract<A.Expr, { k: "implicit" }>, cx: Ctx, exp?: Ty): Ty {
    let x = exp ? prune(exp) : undefined;
    if (x?.k === "opt") x = prune(x.inner);
    if (!x || x.k !== "app") return this.err(e.span, "E0395", `cannot tell which type \`.${e.name}\` belongs to`, { why: "a leading-dot name takes its type from the context, and there is none here", suggestion: `write the type: \`TypeName.${e.name}\`` });
    const decl = x.decl;
    const v = decl.variants?.find((vv) => vv.name === e.name);
    if (v) {
      (e as any).variant = { decl, v };
      const vt = this.variantValue(decl, v, x);
      if (e.args) {
        if (vt.k !== "fn") return this.err(e.span, "E0396", `variant ${e.name} has no payload`, { suggestion: `write .${e.name} without parentheses` });
        return this.callSignature(e, e.args, v.fields.map((f, i) => ({ name: f.name ?? `#${i}`, ty: (vt as any).params[i], hasDefault: false })), (vt as any).ret, cx, `${decl.name}.${e.name}`, true);
      }
      if (vt.k === "fn") return this.err(e.span, "E0396", `variant ${e.name} needs ${v.fields.length} value${v.fields.length > 1 ? "s" : ""}`, { suggestion: `write .${e.name}(${v.fields.map((f) => f.name ?? "...").join(", ")})` });
      return vt;
    }
    const ms = this.findMethods(x, e.name, true);
    if (ms.length && e.args) {
      return this.resolveCall(e as any, e.args, cx, ms.map((m) => ({ fn: m.fn, map: m.map })), undefined, x, `${decl.name}.${e.name}`, "static-method", { decl });
    }
    const f = this.findField(x, e.name, true);
    if (f && !e.args) { (e as any).staticField = { f: f.f, decl }; return subst(f.f.ty, f.map); }
    return this.err(e.span, "E0390", `${decl.name} has no variant or static member \`${e.name}\``, { suggestion: closest(e.name, (decl.variants ?? []).map((v2) => v2.name)) ? `did you mean \`.${closest(e.name, (decl.variants ?? []).map((v2) => v2.name))}\`?` : undefined });
  }

  // ---------- calls ----------
  /** `re.findAll("\\d+", text)`: the common patterns have a one-word spelling that needs no regex. */
  private regexHint(e: Extract<A.Expr, { k: "call" }>, c: Extract<A.Expr, { k: "member" }>) {
    const lit = e.args[0].value as Extract<A.Expr, { k: "str" }>;
    if (lit.parts.some((p: any) => typeof p !== "string")) return;
    const pat = lit.parts.join("");
    const NUMBERS = ["-?\\d+(\\.\\d+)?", "\\d+(\\.\\d+)?", "-?\\d+(?:\\.\\d+)?", "\\d+(?:\\.\\d+)?", "-?[0-9]+(\\.[0-9]+)?", "\\d+\\.?\\d*", "-?\\d*\\.?\\d+", "\\d*\\.?\\d+"];
    const INT = /^(\\b)?(\\d\+|\[0-9\]\+)(\\b)?$/, WORD = /^(\\b)?(\\w\+|\[A-Za-z\]\+|\[a-zA-Z\]\+)(\\b)?$/;
    const kind = INT.test(pat) ? "Int" : NUMBERS.includes(pat) ? "Number" : WORD.test(pat) ? "Word" : undefined;
    if (!kind) return;
    this.warn(e.span, "W0302", `\`re.${c.name}("${pat}", ...)\` needs a regex for something with a one-word spelling`, { why: "Mycel pulls numbers and words out of text without a pattern", suggestion: `write \`text.extract(${kind})\` (it gives typed values, e.g. [${kind === "Number" ? "Float" : kind === "Word" ? "String" : "Int"}])` });
  }

  /** `Integer`, `int`, `Words`...: a near miss of a kind name. */
  private looksLikeKind(name: string): boolean { return !!closest(name, [...EXTRACT_KINDS_ALL]) || /^(int|float|number|word|words|operator|bool|boolean|digit|digits|letter|str|string|integer)$/i.test(name); }

  /** `text.extract(Int)`, `text.extract(Number, Operator)`, `text.extract(Word) { "@" in it }`: a closed set of kinds, typed results. */
  private inferExtract(e: Extract<A.Expr, { k: "call" }>, c: Extract<A.Expr, { k: "member" }>, cx: Ctx): Ty {
    const recv = prune(this.infer(c.obj, cx));
    if (recv.k !== "err" && !isPrim(recv, "String")) return this.err(c.span, "E0390", `\`extract\` pulls pieces out of text (a String), not ${show(recv)}`, { suggestion: "call it on a String: `\"12 + 3\".extract(Int)`" });
    const kinds: string[] = [];
    let filter: A.Expr | undefined;
    for (const a of e.args) {
      if (a.name === "where" || (a.value.k === "lambda" && !a.name)) {
        if (filter) return this.err(a.span, "E0431", "`extract` takes one filter");
        filter = a.value; continue;
      }
      if (a.name || a.value.k !== "id" || !EXTRACT_KINDS_ALL.has(a.value.name)) {
        const given = a.value.k === "id" ? a.value.name : "this";
        const near = a.value.k === "id" ? closest(a.value.name, [...EXTRACT_KINDS_ALL]) : undefined;
        return this.err(a.span, "E0431", `${a.value.k === "id" ? `\`${given}\` is not something \`extract\` can pull out of text` : "`extract` takes kinds like `Int` or `Word`"}${near ? ` — did you mean \`${near}\`?` : ""}`, { why: "the kinds are a closed set: Int, Float, Number, Word, Operator, Bool", suggestion: near ? `write \`.extract(${near})\`` : "write one of `.extract(Int)`, `.extract(Float)`, `.extract(Number)`, `.extract(Word)`, `.extract(Operator)`, `.extract(Bool)`; for anything else use `.split(...)` and a condition" });
      }
      if (kinds.includes(a.value.name)) return this.err(a.span, "E0431", `\`${a.value.name}\` is asked for twice`);
      kinds.push(a.value.name);
    }
    if (!kinds.length) return this.err(e.span, "E0431", "`extract` needs a kind", { suggestion: "write `.extract(Int)`, `.extract(Word)`, ..." });
    const one: Record<string, Ty> = { Int: T.Int, Float: T.Float, Number: T.Float, Word: T.String, Operator: T.String, Bool: T.Bool };
    const elem = kinds.length === 1 ? one[kinds[0]] : this.preludeType("Piece");
    if (filter) {
      if (kinds.length !== 1) return this.err(filter.span, "E0431", "a filter works with one kind", { suggestion: "extract one kind, or filter the result with `.filter { ... }`" });
      this.inferLambda(filter as any, cx, fnTy([elem], T.Bool));
      (filter as any).ty = fnTy([elem], T.Bool);
    }
    (e as any).extract = { kinds, filter };
    return this.arrayOf(elem);
  }

  private inferCall(e: Extract<A.Expr, { k: "call" }>, cx: Ctx, exp?: Ty): Ty {
    const c = e.callee;
    const typeArgs = e.typeArgs?.map((t) => this.resolveType(t, cx));
    if (c.k === "member" && c.obj.k === "super") return this.inferSuperCall(e, c, cx, exp);
    if (c.k === "id" && !cx.scope.lookup(c.name)) {
      const sym = this.lookupModuleSym(c.name, cx);
      if (sym?.k === "fn") { (c as any).sym = sym; return this.resolveCall(e, e.args, cx, sym.fns.map((fn) => ({ fn, map: new Map() })), typeArgs, exp, c.name, "fn", {}); }
      if (sym?.k === "type") { (c as any).sym = sym; return this.inferCtor(e, sym.decl, typeArgs, cx, exp); }
      if (sym?.k === "module") {
        const cfns = sym.mod.fns.get("call");
        if (cfns?.some((f) => f.pub)) { (c as any).sym = { k: "fn", fns: cfns }; return this.resolveCall(e, e.args, cx, cfns.map((fn) => ({ fn, map: new Map() })), typeArgs, exp, `${c.name}.call`, "fn", {}); }
      }
      if (sym?.k === "global") { /* a global holding a function */ }
      else if (!sym) {
        const bv = this.bareVariant(c.name);
        if (bv) { (c as any).sym = { k: "variant", ...bv }; return this.inferVariantCall(e, bv.decl, bv.v, cx, exp); }
      }
    }
    if (c.k === "member" && c.obj.k === "id" && ["findAll", "find", "isMatch", "split"].includes(c.name) && e.args.length && e.args[0].value.k === "str" && !cx.scope.lookup(c.obj.name) && this.lookupModuleSym(c.obj.name, cx)?.k === "module") this.regexHint(e, c);
    if (c.k === "member" && c.name === "extract" && e.args.length) {
      const a0 = e.args[0].value; // a type name where a value would be: `.extract(Int)` is never an ordinary call
      if (a0.k === "id" && !cx.scope.lookup(a0.name) && (EXTRACT_KINDS_ALL.has(a0.name) || (!this.lookupModuleSym(a0.name, cx) && this.looksLikeKind(a0.name)))) return this.inferExtract(e, c, cx);
    }
    if (c.k === "member") {
      const ref = this.resolveRef(c.obj, cx);
      if (ref?.k === "module") {
        const mod = ref.mod;
        const fns = mod.fns.get(c.name);
        if (fns) {
          if (!fns.some((f) => f.pub) && mod !== cx.mod) this.err(c.span, "E0203", `\`${c.name}\` is private to module ${mod.name}`, { suggestion: `add \`pub\` to ${c.name} in ${mod.file}` });
          (c as any).sym = { k: "fn", fns };
          return this.resolveCall(e, e.args, cx, fns.map((fn) => ({ fn, map: new Map() })), typeArgs, exp, `${mod.name}.${c.name}`, "fn", {});
        }
        const t = mod.types.get(c.name);
        if (t) {
          if (!t.pub && mod !== cx.mod) this.err(c.span, "E0203", `type \`${c.name}\` is private to module ${mod.name}`, { suggestion: "mark it `pub`" });
          (c as any).sym = { k: "type", decl: t };
          return this.inferCtor(e, t, typeArgs, cx, exp);
        }
      }
      const tref = ref ?? undefined;
      if (tref?.k === "type") {
        const decl = tref.decl;
        const v = decl.variants?.find((x) => x.name === c.name);
        if (v) { (c as any).mres = { kind: "variant", decl, v }; return this.inferVariantCall(e, decl, v, cx, exp); }
        const selfApp = app(decl, decl.params.map(() => freshVar())) as Extract<Ty, { k: "app" }>;
        const ms = this.findMethods(selfApp, c.name, true);
        if (ms.length) {
          (c as any).mres = { kind: "static-method", decl };
          for (const m of ms) this.checkAccess(m.fn.vis, decl, cx, c.span, c.name);
          return this.resolveCall(e, e.args, cx, ms, typeArgs, exp, `${decl.name}.${c.name}`, "static-method", { decl, recvApp: selfApp });
        }
        // a static field holding a function falls through to the value path
      }
      if (!ref) {
        // method call on a value
        let ot = this.chainBase(c.obj, cx);
        const chained = !!(c.optional || (c.obj as any).chain);
        if (c.optional) {
          if (ot.k === "opt") ot = prune(ot.inner);
          else if (ot.k !== "err") this.err(c.span, "E0381", `\`?.\` used on ${show(ot)}, which is not optional`, { suggestion: "use plain `.`" });
        } else if (ot.k === "opt") {
          this.err(c.obj.span, "E0382", `cannot call \`.${c.name}()\` on ${show(ot)} because it might be nil`, { why: "optional values must be unwrapped before use", suggestion: `use \`?.${c.name}(...)\`, \`value!.${c.name}(...)\`, or \`if let v = value { v.${c.name}(...) }\`` });
          ot = prune(ot.inner);
        }
        (c as any).ty = ot;
        const base = ot.k === "param" ? ot.bounds.map(prune).find((b) => b.k === "app" && this.hasMember(b, c.name)) as any : this.declTypeOf(ot);
        let cands: { fn: FnInfo; map: Map<Ty, Ty> }[] = [];
        if (base) cands = this.findMethods(base, c.name);
        if (ot.k !== "param") cands.push(...this.findExt(ot, c.name));
        if (cands.length) {
          (c as any).mres = { kind: "methods", cands, recvTy: ot };
          if (ot.k === "param" || (ot.k === "app" && ot.decl.kind === "interface")) (c as any).dyn = true;
          for (const m of cands) if (m.fn.owner) this.checkAccess(m.fn.vis, m.fn.owner, cx, c.span, c.name);
          const r = this.resolveCall(e, e.args, cx, cands, typeArgs, exp, c.name, "method", { recvTy: ot, recv: c.obj });
          if (chained) { (e as any).chain = true; (e as any).chainInner = r; (c as any).chain = true; const p = prune(r); return p.k === "opt" || p.k === "err" ? p : opt(p); }
          return r;
        }
        if (this.isForeignVal(ot)) {
          e.args.forEach((a) => { const at = this.infer(a.value, cx); if (isPrim(prune(at), "Void")) this.err(a.value.span, "E0300", "cannot pass a Void expression as an argument"); });
          (e as any).call = { kind: "foreign-method", name: c.name };
          if (chained) { (e as any).chain = true; (e as any).chainInner = ot; (c as any).chain = true; return opt(ot); }
          return ot;
        }
        // a field holding a function: fall through to value call (errors for unknown members come from inferMember)
        const mt = this.valueMember(ot, c, cx);
        (c as any).ty = mt;
        const r = this.callValue(e, mt, cx, c.name);
        if (chained) { (e as any).chain = true; (e as any).chainInner = r; (c as any).chain = true; const p = prune(r); return p.k === "opt" || p.k === "err" ? p : opt(p); }
        return r;
      }
    }
    // generic value call
    const ct = this.infer(c, cx);
    const r = this.callValue(e, ct, cx, c.k === "id" ? c.name : "value");
    if ((c as any).chain) { (e as any).chain = true; const p = prune(r); return p.k === "opt" || p.k === "err" ? p : opt(p); }
    return r;
  }

  private callValue(e: Extract<A.Expr, { k: "call" }>, ct: Ty, cx: Ctx, name: string): Ty {
    const p = prune(ct);
    if (p.k === "err") { e.args.forEach((a) => this.infer(a.value, cx)); return p; }
    if (this.isForeignVal(p)) {
      e.args.forEach((a) => { const at = this.infer(a.value, cx); if (isPrim(prune(at), "Void")) this.err(a.value.span, "E0300", "cannot pass a Void expression as an argument"); });
      (e as any).call = { kind: "foreign-invoke" };
      return p;
    }
    if (p.k !== "fn") {
      e.args.forEach((a) => this.infer(a.value, cx));
      const isProperty = e.args.length === 0 && (e.callee.k === "member" || (e.callee.k === "id" && !!cx.selfTy));
      const sug = isProperty ? `write it without parentheses: \`${name}\`` : p.k === "opt" ? "unwrap it first" : undefined;
      return this.err(e.callee.span, "E0400", `\`${name}\` is ${show(p)}, not a function, so it cannot be called`, { suggestion: sug });
    }
    const params = p.params.map((t, i) => ({ name: p.names?.[i] ?? `#${i}`, ty: t, hasDefault: !!p.defaults?.[i] }));
    (e as any).call = { kind: "value" };
    return this.callSignature(e, e.args, params, p.ret, cx, name, false);
  }

  /** Shared arg matching for a plain signature (function values, variants). */
  private callSignature(e: A.Expr, args: A.Arg[], params: FnInfo["params"], ret: Ty, cx: Ctx, name: string, isVariant: boolean): Ty {
    const ordered = this.matchArgs(params, args, e.span, name);
    if (!ordered) { args.forEach((a) => this.infer(a.value, cx)); return ret; }
    ordered.list.forEach((a, i) => { if (!a) return; const t = this.infer(a.value, cx, params[i].ty); if (!this.assignable(t, params[i].ty)) this.mismatch(a.value, t, params[i].ty, `argument \`${params[i].name}\``); else this.coerceLit(a.value, params[i].ty); });
    ordered.rest.forEach((a) => { const el = prune(params[params.length - 1].ty); const et = el.k === "app" ? el.args[0] : el; const t = this.infer(a.value, cx, et); if (!this.assignable(t, et)) this.mismatch(a.value, t, et, "argument"); });
    const info = (e as any).call ?? ((e as any).call = {});
    info.kind = info.kind ?? (isVariant ? "variant" : "value");
    info.ordered = ordered.list; info.rest = ordered.rest;
    return ret;
  }

  /** Map call arguments onto parameters; reports arity / name errors. */
  matchArgs(params: FnInfo["params"], args: A.Arg[], span: Span, name: string, isForeignKw = false): { list: (A.Arg | undefined)[]; rest: A.Arg[]; extraKw?: A.Arg[] } | undefined {
    const list: (A.Arg | undefined)[] = new Array(params.length).fill(undefined);
    const rest: A.Arg[] = [];
    const extraKw: A.Arg[] = [];
    const variadic = params.length > 0 && params[params.length - 1].variadic;
    let pos = 0, bad = false;
    const sigText = () => `${name}(${params.map((p) => `${p.name}: ${show(p.ty)}${p.hasDefault ? " = ..." : ""}`).join(", ")})`;
    for (const a of args) {
      if (a.name === undefined) {
        if (isForeignKw) while (pos < params.length && params[pos].name === "named") pos++;
        if (pos < params.length && !(variadic && pos === params.length - 1)) list[pos++] = a;
        else if (variadic) rest.push(a);
        else { this.err(a.span, "E0401", `too many arguments in call to \`${name}\``, { why: `it takes ${params.length} argument${params.length === 1 ? "" : "s"}, but ${args.length} were given`, suggestion: `signature: ${sigText()}` }); bad = true; break; }
      } else {
        const i = params.findIndex((p) => p.name === a.name);
        if (i < 0) {
          if (isForeignKw) { extraKw.push(a); continue; }
          this.err(a.span, "E0402", `\`${name}\` has no parameter named \`${a.name}\``, { suggestion: closest(a.name, params.map((p) => p.name)) ? `did you mean \`${closest(a.name, params.map((p) => p.name))}\`?` : `parameters: ${params.map((p) => p.name).join(", ")}` }); bad = true; continue;
        }
        if (list[i]) { this.err(a.span, "E0403", `argument \`${a.name}\` is given twice`); bad = true; continue; }
        list[i] = a;
      }
    }
    if (bad) return undefined;
    const missing = params.filter((p, i) => !list[i] && !p.hasDefault && !p.variadic);
    if (missing.length) {
      this.err(span, "E0404", `missing argument${missing.length > 1 ? "s" : ""} ${missing.map((m) => "`" + m.name + "`").join(", ")} in call to \`${name}\``, { why: `${name} requires ${params.filter((p) => !p.hasDefault && !p.variadic).length} argument(s)`, suggestion: `signature: ${sigText()}` });
      return undefined;
    }
    return { list, rest, extraKw };
  }

  private argFits(fn: FnInfo, args: A.Arg[]): boolean {
    const params = fn.params;
    const isForeignKw = !!fn.module?.name.includes(":") && params.some((p) => p.name === "named");
    if (isForeignKw) {
      const variadic = params.length > 0 && params[params.length - 1].variadic;
      const regular = params.filter((p) => p.name !== "named");
      const pos = args.filter((a) => a.name === undefined).length;
      if (!variadic && pos > regular.length) return false;
      const covered = new Set<number>();
      let pi = 0;
      for (let k = 0; k < pos; k++) {
        while (pi < params.length && params[pi].name === "named") pi++;
        if (pi < params.length && !params[pi].variadic) covered.add(pi++);
      }
      for (const a of args) if (a.name !== undefined) { const j = params.findIndex((p) => p.name === a.name); if (j >= 0) covered.add(j); }
      return params.every((p, i) => p.name === "named" || covered.has(i) || p.hasDefault || p.variadic);
    }
    const variadic = params.length > 0 && params[params.length - 1].variadic;
    const pos = args.filter((a) => a.name === undefined).length;
    if (!variadic && args.length > params.length) return false;
    if (!variadic && pos > params.length) return false;
    const named = args.filter((a) => a.name !== undefined);
    if (named.some((a) => !params.some((p) => p.name === a.name))) return false;
    const covered = new Set<number>(); for (let i = 0; i < Math.min(pos, params.length); i++) covered.add(i);
    for (const a of named) covered.add(params.findIndex((p) => p.name === a.name));
    return params.every((p, i) => covered.has(i) || p.hasDefault || p.variadic);
  }

  /** Resolve one call against overload candidates; infers generics, checks arguments, annotates `e.call`. */
  resolveCall(
    e: A.Expr, args: A.Arg[], cx: Ctx, cands0: { fn: FnInfo; map: Map<Ty, Ty> }[], typeArgs: Ty[] | undefined, exp: Ty | undefined,
    name: string, kind: string, extra: Record<string, any>,
  ): Ty {
    let cands = cands0.filter((c) => this.argFits(c.fn, args));
    if (!cands.length) {
      const c0 = cands0[0];
      args.forEach((a) => this.infer(a.value, cx));
      if (cands0.length === 1) { const isFK = !!c0.fn.module?.name.includes(":") && c0.fn.params.some((p) => p.name === "named"); this.matchArgs(c0.fn.params, args, e.span, name, isFK); }
      else this.err(e.span, "E0405", `no overload of \`${name}\` takes ${args.length} argument${args.length === 1 ? "" : "s"}`, { suggestion: `overloads:\n${cands0.map((c) => "  " + this.fnSig(c.fn)).join("\n")}` });
      return subst(c0.fn.ret, c0.map);
    }
    let chosen = cands[0];
    if (cands.length > 1) {
      const argTys = args.map((a) => (a.value.k === "lambda" ? undefined : this.infer(a.value, cx)));
      const fit = cands.filter((c) => {
        const inst = new Map(c.map); c.fn.typeParams.forEach((p) => inst.set(p, freshVar()));
        const ord = this.matchArgsQuiet(c.fn.params, args);
        if (!ord) return false;
        return ord.every((ai, i) => { if (ai < 0) return true; const t = argTys[ai]; if (!t) return prune(subst(c.fn.params[i].ty, inst)).k === "fn"; return this.canAssign(t, subst(c.fn.params[i].ty, inst)); });
      });
      if (!fit.length) {
        this.err(e.span, "E0405", `no overload of \`${name}\` accepts (${argTys.map((t) => (t ? show(t) : "(closure)")).join(", ")})`, { suggestion: `overloads:\n${cands.map((c) => "  " + this.fnSig(c.fn)).join("\n")}` });
        return subst(cands[0].fn.ret, cands[0].map);
      }
      chosen = fit[0];
    }
    const fn = chosen.fn;
    const isFK = !!fn.module?.name.includes(":") && fn.params.some((p) => p.name === "named");
    if ((fn as any).inferRet && !this.bodyDone.has(fn) && !(fn as any).hasUntypedParams) this.checkFnBody(fn);
    const inst = new Map(chosen.map);
    fn.typeParams.forEach((p, i) => inst.set(p, typeArgs?.[i] ?? freshVar()));
    if (typeArgs && typeArgs.length !== fn.typeParams.length) this.err(e.span, "E0406", `\`${name}\` takes ${fn.typeParams.length} type argument(s), but ${typeArgs.length} given`);
    const ret0 = subst(fn.ret, inst);
    let ret = fn.async ? this.taskOf(ret0) : ret0;
    // expected-type hint: lets `let x: [Int] = make()` infer T from the context
    if (exp && containsVar(ret) && prune(ret).k !== "var" && !isPrim(exp, "Void") && !isPrim(exp, "Any")) { const ex = prune(exp); if (this.canAssign(ret, ex)) this.assignable(ret, ex); }
    const params = fn.params.map((p) => ({ ...p, ty: subst(p.ty, inst) }));
    const ordered = this.matchArgs(params, args, e.span, name, isFK);
    const info = { kind, fn, ordered: ordered?.list ?? [], rest: ordered?.rest ?? [], extraKw: ordered?.extraKw ?? [], inst, ...extra };
    (e as any).call = info;
    if (!ordered) { args.forEach((a) => this.infer(a.value, cx)); return ret; }
    const doArg = (a: A.Arg, pt: Ty, label: string) => {
      const t = this.infer(a.value, cx, pt);
      if (!this.assignable(t, pt)) {
        if ((fn as any).hasUntypedParams && (fn as any).callSites?.length) {
          const firstSite = (fn as any).callSites[0];
          const firstPos = firstSite.span ? firstSite.span.src.pos(firstSite.span.start) : undefined;
          const locStr = firstPos ? `${firstSite.span.src.name}:${firstPos.line}:${firstPos.col}` : "an earlier call";
          this.err(a.value.span, "E0221", `call site passes ${show(t)} for parameter \`${label}\`, but \`${fn.name}\` was inferred as \`${show(pt)}\` from call site at ${locStr}`, {
            why: `parameter \`${label}\` inferred conflicting types across call sites`,
            suggestion: `write \`fn ${fn.name}(${fn.params.map((p) => `${p.name}: ${p.name === label ? show(t) : show(p.ty)}`).join(", ")})\``,
          });
        } else {
          this.mismatch(a.value, t, pt, `argument \`${label}\``);
        }
      } else {
        this.coerceLit(a.value, pt);
      }
    };
    // non-closure arguments first so closures see the type parameters they bind
    ordered.list.forEach((a, i) => { if (a && a.value.k !== "lambda") doArg(a, params[i].ty, params[i].name); });
    ordered.rest.forEach((a) => { if (a.value.k !== "lambda") { const el = prune(params[params.length - 1].ty); doArg(a, el.k === "app" ? el.args[0] : el, params[params.length - 1].name); } });
    ordered.extraKw?.forEach((a) => { const t = this.infer(a.value, cx); if (isPrim(prune(t), "Void")) this.err(a.value.span, "E0300", "cannot pass a Void expression as a named argument"); });
    ordered.list.forEach((a, i) => { if (a && a.value.k === "lambda") doArg(a, params[i].ty, params[i].name); });
    ordered.rest.forEach((a) => { if (a.value.k === "lambda") { const el = prune(params[params.length - 1].ty); doArg(a, el.k === "app" ? el.args[0] : el, params[params.length - 1].name); } });
    ((fn as any).callSites ??= []).push({ span: e.span, args });
    if ((fn as any).hasUntypedParams && !this.bodyDone.has(fn)) {
      this.checkFnBody(fn);
    }
    if ((fn as any).inferRet) ret = subst(fn.ret, inst), ret = fn.async ? this.taskOf(ret) : ret;
    fn.typeParams.forEach((p) => {
      const v = inst.get(p)!;
      if (prune(v).k === "var") this.unresolvedVars.push({ v, span: e.span, what: `type parameter ${p.name} of \`${name}\`` });
      else p.bounds.forEach((b) => { if (!this.conforms(v, subst(b, inst))) this.err(e.span, "E0215", `${show(v)} does not satisfy the bound ${p.name}: ${show(subst(b, inst))} required by \`${name}\``, { suggestion: `make ${show(v)} conform to ${show(subst(b, inst))}` }); });
    });
    return ret;
  }

  /** Which argument index feeds each parameter (-1 = default). Used only to rank overloads. */
  private matchArgsQuiet(params: FnInfo["params"], args: A.Arg[]): number[] | undefined {
    const out = new Array(params.length).fill(-1);
    let pos = 0;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.name === undefined) { if (pos >= params.length) return undefined; out[pos++] = i; }
      else { const j = params.findIndex((p) => p.name === a.name); if (j < 0) return undefined; out[j] = i; }
    }
    return out;
  }

  fnSig(f: FnInfo): string { return `${f.owner && !f.static ? "" : ""}fn ${f.name}(${f.params.map((p) => `${p.name}: ${show(p.ty)}`).join(", ")}) -> ${show(f.ret)}`; }

  private inferCtor(e: Extract<A.Expr, { k: "call" }>, decl: TypeDecl, typeArgs: Ty[] | undefined, cx: Ctx, exp?: Ty): Ty {
    this.ensureHeader(decl);
    if (decl.kind === "interface") { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.callee.span, "E0410", `interface ${decl.name} cannot be instantiated`, { suggestion: "construct a class that conforms to it" }); }
    if (decl.kind === "enum") { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.callee.span, "E0410", `enum ${decl.name} cannot be constructed directly`, { suggestion: `pick a variant: ${(decl.variants ?? []).slice(0, 4).map((v) => decl.name + "." + v.name).join(", ")}` }); }
    if (decl.alias) { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.callee.span, "E0410", `${decl.name} is a type alias; construct the underlying type`); }
    const vars = decl.params.map((_, i) => typeArgs?.[i] ?? freshVar());
    if (typeArgs && typeArgs.length !== decl.params.length) this.err(e.span, "E0406", `${decl.name} takes ${decl.params.length} type argument(s), but ${typeArgs.length} given`);
    const selfTy = app(decl, vars);
    if (exp) { const ex = prune(exp); const target = ex.k === "opt" ? prune(ex.inner) : ex; if (target.k === "app" && this.canAssign(selfTy, target)) this.assignable(selfTy, target); }
    const m = new Map<Ty, Ty>(); decl.params.forEach((p, i) => m.set(p, vars[i]));
    const ctors = decl.ctors;
    if (!ctors.length) { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.callee.span, "E0411", `${decl.name} has no initializer`, { suggestion: `declare \`init(...)\` in ${decl.name}` }); }
    ctors.forEach((c) => { if (c.vis === "private" && cx.cls !== decl) this.err(e.callee.span, "E0380", `the initializer of ${decl.name} is private`, { suggestion: "use a static factory method instead" }); });
    this.resolveCall(e, e.args, cx, ctors.map((fn) => ({ fn, map: m })), undefined, undefined, decl.name, "ctor", { decl });
    decl.params.forEach((p, i) => { const v = vars[i]; if (prune(v).k === "var") this.unresolvedVars.push({ v, span: e.span, what: `type parameter ${p.name} of ${decl.name}` }); else p.bounds.forEach((b) => { if (!this.conforms(v, subst(b, m))) this.err(e.span, "E0215", `${show(v)} does not satisfy ${p.name}: ${show(b)} required by ${decl.name}`); }); });
    return selfTy;
  }

  private inferVariantCall(e: Extract<A.Expr, { k: "call" }>, decl: TypeDecl, v: VariantInfo, cx: Ctx, exp?: Ty): Ty {
    const vt = this.variantValue(decl, v, exp);
    (e as any).call = { kind: "variant", decl, v };
    if (vt.k !== "fn") { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.span, "E0396", `variant ${v.name} has no payload`, { suggestion: `write ${decl.name}.${v.name} without parentheses` }); }
    const r = this.callSignature(e, e.args, v.fields.map((f, i) => ({ name: f.name ?? `#${i}`, ty: vt.params[i], hasDefault: false })), vt.ret, cx, `${decl.name}.${v.name}`, true);
    this.noteUnresolvedLater(r, e.span, `${decl.name}.${v.name}`);
    return r;
  }
  private noteUnresolvedLater(t: Ty, span: Span, what: string) {
    const p = prune(t);
    if (p.k === "app") p.args.forEach((a, i) => { if (prune(a).k === "var") this.unresolvedVars.push({ v: a, span, what: `type parameter ${p.decl.params[i]?.name} of ${what}` }); });
  }

  private inferSuperCall(e: Extract<A.Expr, { k: "call" }>, c: Extract<A.Expr, { k: "member" }>, cx: Ctx, exp?: Ty): Ty {
    const cls = cx.cls;
    const base = cls?.base;
    if (!cls || !base || cx.inStatic) { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.span, "E0420", "`super` is only available in a class that has a base class"); }
    if (c.name === "init") {
      if (!cx.fn?.isInit) this.err(e.span, "E0421", "`super.init(...)` can only be called from an `init`");
      const m = this.ownerMap(base, base.decl);
      const ctors = base.decl.ctors;
      if (!ctors.length) { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(e.span, "E0411", `${base.decl.name} has no initializer`); }
      return this.resolveCall(e, e.args, cx, ctors.map((fn) => ({ fn, map: m })), undefined, exp, `${base.decl.name}.init`, "super-init", { decl: base.decl });
    }
    const cands = this.findMethods(base, c.name);
    if (!cands.length) { e.args.forEach((a) => this.infer(a.value, cx)); return this.err(c.span, "E0390", `${base.decl.name} has no method \`${c.name}\``, { suggestion: closest(c.name, [...base.decl.methods.keys()]) ? `did you mean \`${closest(c.name, [...base.decl.methods.keys()])}\`?` : undefined }); }
    return this.resolveCall(e, e.args, cx, cands, undefined, exp, c.name, "super-method", { decl: base.decl });
  }

  // ---------- lambdas ----------
  inferLambda(e: Extract<A.Expr, { k: "lambda" }>, cx: Ctx, exp?: Ty, info?: FnInfo): Ty {
    let x = exp ? prune(exp) : undefined;
    if (x?.k === "opt") x = prune(x.inner);
    const expFn = x && x.k === "fn" ? x : undefined;
    // `{ it * 2 }`: with no named parameter, `it` is the single argument where a one-argument function is expected
    if (e.implicitIt && !e.params.length && expFn && expFn.params.length === 1) e.params = [{ name: "it", span: e.span } as A.Param];
    if (expFn && expFn.params.length !== e.params.length && !info) {
      this.err(e.span, "E0430", `this closure takes ${e.params.length} parameter${e.params.length === 1 ? "" : "s"}, but ${expFn.params.length} ${expFn.params.length === 1 ? "is" : "are"} expected here`, { suggestion: `write it as (${expFn.params.map((_, i) => "p" + (i + 1)).join(", ")}) => ...` });
    }
    const scope = new Scope(cx.scope);
    const inner: Ctx = { ...cx, scope, loopDepth: 0, labels: [] };
    const ptys: Ty[] = e.params.map((p, i) => {
      let t: Ty;
      if (p.type) t = this.resolveType(p.type, cx);
      else if (info) t = info.params[i].ty;
      else if (expFn && expFn.params[i]) t = expFn.params[i];
      else t = freshVar();
      if (p.type && expFn?.params[i]) this.assignable(expFn.params[i], t);
      const pjs = p.js ?? jsId(p.name) + (cx.scope.lookup(p.name) ? `$${++this.localCounter}` : "");
      (p as any).js = pjs;
      scope.vars.set(p.name, { name: p.name, ty: t, mutable: false, js: pjs, span: p.span, kind: "param", used: true });
      return t;
    });
    e.params.forEach((p, i) => { if (p.pat) this.checkParamPattern(p, ptys[i], inner); });
    let ret: Ty;
    const declared = e.ret ? this.resolveType(e.ret, cx) : undefined;
    if (info) ret = info.ret;
    else if (declared) ret = declared;
    else ret = expFn && prune(expFn.ret).k !== "var" && !isPrim(expFn.ret, "Void") ? expFn.ret : freshVar();
    const asyncL = !!e.async;
    const fnCx: FnCtx = { ret: asyncL && !info && expFn ? this.unTask(ret) : ret, retDeclared: !!declared || (!!info && !(info as any).inferRet), async: asyncL, gen: !!(e as any).gen, usesPropagate: false, isLambda: true, returns: [] };
    inner.fn = fnCx;
    e.params.forEach((p) => { if (p.default) this.infer(p.default, inner); });
    if (e.body.k === "block") {
      this.checkBlock(e.body, inner);
      const r = prune(fnCx.ret);
      if (r.k === "var" && !declared) {
        if (!fnCx.returns.length) this.bind(r, T.Void);
      }
    } else {
      const want = prune(fnCx.ret).k === "var" ? undefined : fnCx.ret;
      const t = this.infer(e.body, inner, want);
      if (isPrim(fnCx.ret, "Void") && expFn && !declared) { /* expected Void: value discarded */ }
      else if (!this.assignable(t, fnCx.ret)) this.mismatch(e.body, t, fnCx.ret, "closure result");
      else this.coerceLit(e.body, fnCx.ret);
    }
    (e as any).usesPropagate = fnCx.usesPropagate;
    this.reportUnused(scope);
    const finalRet = fnCx.ret;
    return fnTy(ptys, asyncL ? this.taskOf(finalRet) : finalRet, { names: e.params.map((p) => p.name), defaults: e.params.map((p) => !!p.default) });
  }

  /** `fn f((a, b): (Int, Int))`: bind the pattern against the parameter's type; like `let`, it must always match. */
  checkParamPattern(p: A.Param, ty: Ty, cx: Ctx) {
    // `((a, b)) => a + b` with nothing to infer from: the tuple pattern itself gives the shape
    const shape = (q: A.Pattern): Ty => (q.k === "tuple" ? { k: "tuple", elems: q.elems.map(shape) } : freshVar());
    if (prune(ty).k === "var" && p.pat!.k === "tuple") this.assignable(shape(p.pat!), ty);
    this.checkPattern(p.pat!, ty, cx, false, true);
    if (prune(ty).k !== "err" && !this.irrefutable(p.pat!, ty)) this.err(p.pat!.span, "E0268", "this pattern can fail to match, so it cannot destructure a parameter", { why: "every call must be able to bind the parameter", suggestion: "take the value as a named parameter and use `match` or `if let` inside the function" });
  }

  /** The labels visible in a loop body; a label already in use by an enclosing loop is an error (which one would `break` mean?). */
  pushLabel(s: { label?: string; span: Span }, cx: Ctx): string[] {
    const ls = cx.labels ?? [];
    if (!s.label) return ls;
    if (ls.includes(s.label)) this.err((s as any).labelSpan ?? s.span, "E0271", `the label \`${s.label}\` is already used by an enclosing loop`, { suggestion: "give each nested loop its own label" });
    return [...ls, s.label];
  }

  /** JSON-native literals (JavaScript): where a `json.Json` is expected, a literal is that JSON value — `{"a": [1, true,
   *  nil]}` becomes `.Obj({"a": .Arr([.Num(1.0), .Bool(true), .Null])})`. Only literals are lifted (like an Int literal
   *  where a Float is expected); a variable still needs its variant (`.Str(name)`), so nothing converts silently. */
  private liftJsonLiteral(e: A.Expr, x: Ty) {
    const t = x.k === "opt" ? prune(x.inner) : x;
    if (!(t.k === "app" && t.decl.name === "Json" && t.decl.kind === "enum" && t.decl.module.name === "std.json")) return;
    const neg = e.k === "unary" && e.op === "-" && (e.operand.k === "int" || e.operand.k === "float");
    const variant = e.k === "map" ? "Obj" : e.k === "array" ? "Arr" : e.k === "int" || e.k === "float" || neg ? "Num" : e.k === "str" ? "Str" : e.k === "bool" ? "Bool" : e.k === "nil" && x.k !== "opt" ? "Null" : undefined;
    if (!variant) return;
    if (variant === "Null") { Object.assign(e, { k: "implicit", name: "Null", args: undefined }); return; }
    const inner = { ...e } as A.Expr;
    for (const key of Object.keys(e)) if (key !== "span") delete (e as any)[key];
    Object.assign(e, { k: "implicit", name: variant, args: [{ value: inner, span: inner.span }] });
  }

  // ---------- comprehensions ----------
  inferComp(e: Extract<A.Expr, { k: "comp" }>, cx: Ctx, x?: Ty): Ty {
    let inner = cx;
    const scopes: Scope[] = [];
    for (const c of e.clauses) {
      if (c.k === "if") {
        const t = this.infer(c.cond, inner, T.Bool);
        if (!this.assignable(t, T.Bool)) this.mismatch(c.cond, t, T.Bool, "comprehension condition");
        continue;
      }
      let it = this.infer(c.iter, inner);
      if (c.bare && prune(it).k === "app" && (prune(it) as any).decl.name === "Array") { // `[.. for i, x in list]` = position + value, like `for`
        c.iter = { k: "call", callee: { k: "member", obj: c.iter, name: "enumerate", span: c.iter.span }, args: [], span: c.iter.span } as A.Expr;
        it = this.infer(c.iter, inner);
      }
      const elem = this.iterElem(it, c.iter);
      inner = { ...inner, scope: new Scope(inner.scope) };
      scopes.push(inner.scope);
      this.checkPattern(c.pat, elem, inner, false);
    }
    let ty: Ty;
    if (e.kind === "list") {
      const want = x && x.k === "app" && x.decl.name === "Array" && x.decl.builtin ? x.args[0] : undefined;
      const t = this.infer(e.elem, inner, want);
      if (want && !this.assignable(t, want)) this.mismatch(e.elem, t, want, "list element");
      else if (want) this.coerceLit(e.elem, want);
      if (prune(t).k === "nil") this.err(e.elem.span, "E0231", "cannot infer the element type from `nil`", { suggestion: "annotate the result: `let xs: [Int?] = [nil for _ in items]`" });
      ty = this.arrayOf(want ?? t);
    } else {
      const xm = x && x.k === "app" && x.decl.name === "Map" ? x : undefined;
      const kt = this.infer(e.key!, inner, xm?.args[0]), vt = this.infer(e.elem, inner, xm?.args[1]);
      const k = xm ? xm.args[0] : kt, v = xm ? xm.args[1] : vt;
      if (xm && !this.assignable(kt, k)) this.mismatch(e.key!, kt, k, "map key"); else if (xm) this.coerceLit(e.key!, k);
      if (xm && !this.assignable(vt, v)) this.mismatch(e.elem, vt, v, "map value"); else if (xm) this.coerceLit(e.elem, v);
      this.checkKey(k, e.key!.span);
      ty = this.mapOf(k, v);
    }
    for (const sc of scopes.reverse()) this.reportUnused(sc);
    return ty;
  }

  // ---------- iteration ----------
  iterElem(t0: Ty, at: A.Expr): Ty {
    const t = prune(t0);
    if (t.k === "err") return t;
    if (t.k === "app") {
      const d = t.decl;
      if (d.builtin && d.name === "Array") return t.args[0];
      if (d.builtin && d.name === "Set") return t.args[0];
      if (d.builtin && d.name === "Map") return { k: "tuple", elems: [t.args[0], t.args[1]] };
      if (d.builtin && d.name === "Range") return T.Int;
      for (const s of supertypes(t)) if (s.decl.builtin && (s.decl.name === "Iterable" || s.decl.name === "Iterator")) return s.args[0];
    }
    if (isPrim(t, "String")) return T.Char;
    if (this.isForeignVal(t)) return t;
    if (t.k === "opt") { this.err(at.span, "E0440", `cannot loop over ${show(t)} because it might be nil`, { suggestion: "unwrap it first: `if let items = value { for x in items { ... } }` or `value ?? []`" }); return this.iterElem(t.inner, at); }
    this.err(at.span, "E0441", `${show(t)} is not iterable`, { why: "`for` works on arrays, sets, maps, ranges, strings, generators and types implementing Iterable<T>", suggestion: isPrim(t, "Int") ? "loop over a range: `for i in 0..n`" : `implement Iterable<T> by adding \`fn iter() -> Iterator<T>\` to ${show(t)}` });
    return T.err;
  }

  // ---------- patterns ----------
  private bindPat(cx: Ctx, name: string, ty: Ty, mutable: boolean, span: Span, simple: boolean): LocalInfo {
    const l = this.declareLocal(cx, name, ty, mutable, span);
    if (!simple) l.used = true;
    return l;
  }

  checkPattern(p: A.Pattern, ty0: Ty, cx: Ctx, mutable: boolean, isLet = false): void {
    const ty = prune(ty0);
    (p as any).ty = ty;
    switch (p.k) {
      case "wild": return;
      case "bind": {
        const l = this.bindPat(cx, p.name, p.sub ? ty : ty, mutable, p.span, isLet && !p.sub);
        (p as any).js = l.js; (p as any).info = l;
        if (p.sub) this.checkPattern(p.sub, ty, cx, mutable, isLet);
        return;
      }
      case "lit": {
        const lt = this.infer(p.value, cx, ty.k === "opt" ? ty.inner : ty);
        const target = ty.k === "opt" ? (lt.k === "nil" ? ty : ty.inner) : ty;
        if (!this.assignable(lt, target) && ty.k !== "err") this.err(p.span, "E0450", `cannot match a ${show(lt)} literal against ${show(ty)}`, { suggestion: ty.k === "opt" ? "match against `nil` or the unwrapped value" : undefined });
        return;
      }
      case "range": {
        const inner = ty.k === "opt" ? prune(ty.inner) : ty;
        for (const b of [p.lo, p.hi]) if (b) { const bt = this.infer(b, cx, inner); if (!this.assignable(bt, inner) && inner.k !== "err") this.err(b.span, "E0450", `range bound ${show(bt)} does not match ${show(inner)}`); }
        if (!(isPrim(inner, "Int") || isPrim(inner, "Char") || isPrim(inner, "Float") || inner.k === "err")) this.err(p.span, "E0450", `range patterns work on Int, Float and Char, not ${show(inner)}`);
        return;
      }
      case "tuple": {
        if (ty.k !== "tuple" || ty.elems.length !== p.elems.length) { if (ty.k !== "err") this.err(p.span, "E0451", `this ${p.elems.length}-element tuple pattern cannot match ${show(ty)}`); p.elems.forEach((q) => this.checkPattern(q, T.err, cx, mutable, isLet)); return; }
        p.elems.forEach((q, i) => this.checkPattern(q, ty.elems[i], cx, mutable, isLet));
        return;
      }
      case "array": {
        if (!(ty.k === "app" && ty.decl.name === "Array" && ty.decl.builtin)) { if (ty.k !== "err") this.err(p.span, "E0451", `a list pattern cannot match ${show(ty)}`, { suggestion: "list patterns work on arrays" }); p.elems.forEach((q) => this.checkPattern(q, T.err, cx, mutable, isLet)); return; }
        p.elems.forEach((q) => this.checkPattern(q, ty.args[0], cx, mutable, isLet));
        if (p.rest?.name) { const l = this.bindPat(cx, p.rest.name, ty, mutable, p.span, false); (p as any).restInfo = l; }
        return;
      }
      case "is": {
        const t = this.resolveType(p.type, cx);
        (p as any).isTy = t;
        const sub = ty.k === "opt" ? ty.inner : ty;
        if (!this.canAssign(t, sub) && !this.canAssign(sub, t) && !isPrim(sub, "Any") && prune(t).k !== "err" && ty.k !== "err") this.err(p.span, "E0452", `${show(sub)} can never be a ${show(t)}`, { suggestion: "`is` checks along a class hierarchy or from Any/an interface" });
        return;
      }
      case "or": {
        const probe = new Set<string>();
        for (const a of p.alts) {
          const before = new Map(cx.scope.vars);
          this.checkPattern(a, ty, cx, mutable, isLet);
          for (const k of cx.scope.vars.keys()) if (!before.has(k)) probe.add(k);
        }
        if (probe.size) this.err(p.span, "E0453", "alternatives of an `a | b` pattern cannot bind variables", { suggestion: "bind in separate arms, or use a guard: `x if x == 1 || x == 2 => ...`" });
        return;
      }
      case "variant": return this.checkVariantPattern(p, ty, cx, mutable, isLet);
      case "object": {
        const decl = this.resolvePatternType(p.type!, cx, p.span);
        let sub: Ty = ty.k === "opt" ? ty.inner : ty;
        sub = prune(sub);
        if (!decl) { p.fields.forEach((f) => this.checkPattern(f.pat, T.err, cx, mutable, isLet)); return; }
        const selfApp = sub.k === "app" && sub.decl === decl ? sub : app(decl, decl.params.map(() => freshVar())) as Extract<Ty, { k: "app" }>;
        if (!this.canAssign(selfApp, sub) && !this.canAssign(sub, selfApp) && sub.k !== "err") this.err(p.span, "E0451", `pattern ${decl.name}{...} cannot match ${show(sub)}`);
        this.assignable(selfApp, sub);
        (p as any).decl = decl;
        for (const f of p.fields) {
          const ff = this.findField(selfApp, f.name);
          if (!ff) { this.err(p.span, "E0390", `${decl.name} has no field \`${f.name}\``, { suggestion: closest(f.name, [...decl.fields.keys()]) ? `did you mean \`${closest(f.name, [...decl.fields.keys()])}\`?` : undefined }); this.checkPattern(f.pat, T.err, cx, mutable, isLet); continue; }
          this.checkAccess(ff.f.vis, ff.f.owner, cx, p.span, f.name);
          this.checkPattern(f.pat, subst(ff.f.ty, ff.map), cx, mutable, isLet);
        }
        return;
      }
    }
  }

  private resolvePatternType(path: string[], cx: Ctx, span: Span): TypeDecl | undefined {
    let decl: TypeDecl | undefined;
    if (path.length === 1) decl = this.lookupTypeDecl(path[0], cx);
    else {
      const imp = cx.mod.imports.get(path[0]);
      if (imp?.kind === "module") decl = imp.mod.types.get(path[path.length - 1]);
    }
    if (!decl) this.err(span, "E0211", `unknown type \`${path.join(".")}\` in pattern`);
    return decl;
  }

  private checkVariantPattern(p: Extract<A.Pattern, { k: "variant" }>, ty: Ty, cx: Ctx, mutable: boolean, isLet: boolean) {
    const subject = ty.k === "opt" ? prune(ty.inner) : ty;
    let decl: TypeDecl | undefined, v: VariantInfo | undefined;
    const last = p.path[p.path.length - 1];
    if (p.path.length === 1) {
      if (subject.k === "app" && subject.decl.variants) { decl = subject.decl; v = decl.variants!.find((x) => x.name === last); }
      if (!v) { const bv = this.bareVariant(last); if (bv) { decl = bv.decl; v = bv.v; } }
      if (!v) {
        // maybe a uppercase constant / global
        const sym = this.lookupModuleSym(last, cx);
        if (sym?.k === "global" && !p.args.length) { (p as any).constant = sym.g; if (!this.assignable(this.globalType(sym.g), subject)) this.err(p.span, "E0450", `constant ${last} has type ${show(sym.g.ty)}, not ${show(subject)}`); return; }
        const near = subject.k === "app" ? closest(last, (subject.decl.variants ?? []).map((x) => x.name)) : undefined;
        this.err(p.span, "E0454", `\`${last}\` is not a variant of ${show(subject)}`, { why: subject.k === "app" && subject.decl.variants ? undefined : `the matched value has type ${show(subject)}, which is not an enum`, suggestion: near ? `did you mean \`${near}\`?` : subject.k === "app" && subject.decl.variants ? `variants: ${subject.decl.variants.map((x) => x.name).join(", ")}` : "uppercase names in patterns must be enum variants; use a lowercase name to bind a variable" });
        p.args.forEach((q) => this.checkPattern(q, T.err, cx, mutable, isLet));
        return;
      }
    } else {
      decl = this.resolvePatternType(p.path.slice(0, -1), cx, p.span);
      v = decl?.variants?.find((x) => x.name === last);
      if (decl && !v) { this.err(p.span, "E0454", `${decl.name} has no variant \`${last}\``, { suggestion: closest(last, (decl.variants ?? []).map((x) => x.name)) ? `did you mean \`${closest(last, (decl.variants ?? []).map((x) => x.name))}\`?` : undefined }); }
    }
    if (!decl || !v) { p.args.forEach((q) => this.checkPattern(q, T.err, cx, mutable, isLet)); return; }
    const selfApp = subject.k === "app" && subject.decl === decl ? subject : app(decl, decl.params.map(() => freshVar())) as Extract<Ty, { k: "app" }>;
    if (!this.assignable(selfApp, subject) && subject.k !== "err") this.err(p.span, "E0451", `variant ${decl.name}.${v.name} cannot match a value of type ${show(subject)}`);
    (p as any).decl = decl; (p as any).v = v;
    const m = new Map<Ty, Ty>(); decl.params.forEach((q, i) => m.set(q, selfApp.args[i] ?? T.err));
    if (p.args.length !== v.fields.length && !(p.args.length === 0 && false)) {
      this.err(p.span, "E0455", `variant ${v.name} has ${v.fields.length} field${v.fields.length === 1 ? "" : "s"}, but the pattern has ${p.args.length}`, { suggestion: v.fields.length ? `write ${v.name}(${v.fields.map((f, i) => f.name ?? "_" + i).join(", ")})  — use \`_\` for fields you ignore` : `write ${v.name} without parentheses` });
      p.args.forEach((q) => this.checkPattern(q, T.err, cx, mutable, isLet));
      return;
    }
    // named sub-patterns reorder to the declared fields
    const order = p.args.map((_, i) => i);
    if (p.names?.some((n) => n)) {
      const used = new Set<number>();
      const sorted: number[] = new Array(v.fields.length).fill(-1);
      p.args.forEach((_, i) => {
        const n = p.names![i];
        const fi = n ? v!.fields.findIndex((f) => f.name === n) : -1;
        if (n && fi < 0) this.err(p.args[i].span, "E0402", `variant ${v!.name} has no field named \`${n}\``);
        if (n && fi >= 0) { sorted[fi] = i; used.add(i); }
      });
      let next = 0;
      p.args.forEach((_, i) => { if (!used.has(i)) { while (sorted[next] >= 0) next++; sorted[next] = i; } });
      (p as any).order = sorted;
    } else (p as any).order = order;
    ((p as any).order as number[]).forEach((argIdx, fi) => { if (argIdx >= 0) this.checkPattern(p.args[argIdx], subst(v!.fields[fi].ty, m), cx, mutable, isLet); });
  }

  // ---------- exhaustiveness ----------
  irrefutable(p: A.Pattern, ty: Ty): boolean { return this.coversRows([ty], [[p]]); }

  private expandOr(rows: A.Pattern[][]): A.Pattern[][] {
    const out: A.Pattern[][] = [];
    for (const r of rows) {
      const h = r[0];
      if (h && h.k === "or") for (const a of h.alts) out.push(...this.expandOr([[a, ...r.slice(1)]]));
      else if (h && h.k === "bind" && h.sub) out.push(...this.expandOr([[h.sub, ...r.slice(1)]]));
      else out.push(r);
    }
    return out;
  }
  private isWild(p: A.Pattern): boolean { return p.k === "wild" || (p.k === "bind" && !p.sub) || (p.k === "object" && p.fields.every((f) => this.isWild(f.pat))) || (p.k === "tuple" && p.elems.every((q) => this.isWild(q))); }

  coversRows(types: Ty[], rows0: A.Pattern[][]): boolean {
    const rows = this.expandOr(rows0);
    if (types.length === 0) return rows.length > 0;
    if (!rows.length) return false;
    const t = prune(types[0]);
    const rest = types.slice(1);
    const wildRows = () => rows.filter((r) => this.isWild(r[0])).map((r) => r.slice(1));
    // no constructor pattern in this column: splitting on constructors would recurse forever on recursive types
    if (rows.every((r) => this.isWild(r[0]))) return this.coversRows(rest, wildRows());
    if (t.k === "opt") {
      const nilRows = rows.filter((r) => this.isWild(r[0]) || (r[0].k === "lit" && r[0].value.k === "nil")).map((r) => r.slice(1));
      const someRows = rows.filter((r) => !(r[0].k === "lit" && r[0].value.k === "nil")).map((r) => [r[0], ...r.slice(1)]);
      return this.coversRows(rest, nilRows) && this.coversRows([t.inner, ...rest], someRows);
    }
    if (isPrim(t, "Bool")) {
      for (const val of [true, false]) {
        const rs = rows.filter((r) => this.isWild(r[0]) || (r[0].k === "lit" && r[0].value.k === "bool" && r[0].value.value === val)).map((r) => r.slice(1));
        if (!this.coversRows(rest, rs)) return false;
      }
      return true;
    }
    if (t.k === "tuple") {
      const spec = rows.map((r) => (r[0].k === "tuple" ? [...r[0].elems, ...r.slice(1)] : this.isWild(r[0]) ? [...t.elems.map(() => ({ k: "wild", span: r[0].span } as A.Pattern)), ...r.slice(1)] : undefined)).filter((x): x is A.Pattern[] => !!x);
      return this.coversRows([...t.elems, ...rest], spec);
    }
    if (t.k === "app" && t.decl.variants) {
      const m = new Map<Ty, Ty>(); t.decl.params.forEach((q, i) => m.set(q, t.args[i] ?? T.err));
      for (const v of t.decl.variants) {
        const spec: A.Pattern[][] = [];
        for (const r of rows) {
          const h = r[0];
          if (this.isWild(h)) spec.push([...v.fields.map(() => ({ k: "wild", span: h.span } as A.Pattern)), ...r.slice(1)]);
          else if (h.k === "variant" && (h as any).v === v) {
            const order = ((h as any).order as number[]) ?? h.args.map((_, i) => i);
            const args = v.fields.map((_, fi) => (order[fi] >= 0 && h.args[order[fi]]) || ({ k: "wild", span: h.span } as A.Pattern));
            spec.push([...args, ...r.slice(1)]);
          }
        }
        if (!this.coversRows([...v.fields.map((f) => subst(f.ty, m)), ...rest], spec)) return false;
      }
      return true;
    }
    if (t.k === "err" || t.k === "var") return true;
    if (t.k === "app" && t.decl.builtin && t.decl.name === "Array" && rest.length === 0) {
      // list patterns: [a, b] covers length 2, [a, ..r] covers every length >= 1 (when the element patterns accept anything)
      const fixed = new Set<number>();
      let minRest = Infinity;
      for (const r of rows) {
        const h = r[0];
        if (h.k !== "array" || !h.elems.every((x) => this.isWild(x))) continue;
        if (h.rest) minRest = Math.min(minRest, h.elems.length); else fixed.add(h.elems.length);
      }
      if (rows.some((r) => this.isWild(r[0]))) return true;
      if (minRest === Infinity) return false;
      for (let n = 0; n < minRest; n++) if (!fixed.has(n)) return false;
      return true;
    }
    return this.coversRows(rest, wildRows());
  }

  private missingVariants(subject: Ty, rows: A.Pattern[][]): string[] {
    let t = prune(subject);
    const out: string[] = [];
    if (t.k === "opt") { if (!this.coversRows([T.Any], [])) { const hasNil = rows.some((r) => this.isWild(r[0]) || (r[0].k === "lit" && r[0].value.k === "nil")); if (!hasNil) out.push("nil"); t = prune(t.inner); } }
    if (isPrim(t, "Bool")) { for (const val of [true, false]) if (!this.coversRows([T.Bool], rows.filter((r) => this.isWild(r[0]) || (r[0].k === "lit" && r[0].value.k === "bool" && r[0].value.value === val)))) out.push(String(val)); }
    if (t.k === "app" && t.decl.variants) {
      for (const v of t.decl.variants) {
        const m = new Map<Ty, Ty>(); t.decl.params.forEach((q, i) => m.set(q, t.args[i] ?? T.err));
        const spec: A.Pattern[][] = [];
        for (const r of this.expandOr(rows)) {
          const h = r[0];
          if (this.isWild(h)) spec.push(v.fields.map(() => ({ k: "wild", span: h.span } as A.Pattern)));
          else if (h.k === "variant" && (h as any).v === v) { const order = ((h as any).order as number[]) ?? h.args.map((_, i) => i); spec.push(v.fields.map((_, fi) => (order[fi] >= 0 && h.args[order[fi]]) || ({ k: "wild", span: h.span } as A.Pattern))); }
        }
        if (!this.coversRows(v.fields.map((f) => subst(f.ty, m)), spec)) out.push(v.fields.length ? `${t.decl.name}.${v.name}(${v.fields.map(() => "_").join(", ")})` : `${t.decl.name}.${v.name}`);
      }
    }
    return out;
  }

  // ---------- match ----------
  checkMatch(subject: A.Expr, arms: A.MatchArm[], cx: Ctx, exp: Ty | undefined, span: Span, isStmt: boolean): Ty {
    const st = this.infer(subject, cx);
    let result: Ty | undefined;
    const rows: A.Pattern[][] = [];
    for (const arm of arms) {
      const inner: Ctx = { ...cx, scope: new Scope(cx.scope) };
      this.checkPattern(arm.pat, st, inner, false);
      let bodyCx = inner;
      if (arm.pat.k === "is" && subject.k === "id") {
        const it = (arm.pat as any).isTy as Ty | undefined;
        if (it && prune(it).k !== "err") bodyCx = { ...inner, scope: this.applyNarrow(inner.scope, new Map([[subject.name, it]])) };
      }
      if (arm.guard) {
        const gt = this.infer(arm.guard, inner, T.Bool);
        if (!this.assignable(gt, T.Bool)) this.mismatch(arm.guard, gt, T.Bool, "guard");
        const n = this.narrowings(arm.guard, true, inner);
        if (n.size) bodyCx = { ...bodyCx, scope: this.applyNarrow(bodyCx.scope, n) };
      } else rows.push([arm.pat]);
      let bt: Ty;
      if (arm.body.k === "block") {
        this.checkBlock(arm.body, bodyCx);
        bt = exits(arm.body, this) ? T.Never : T.Void;
      } else bt = this.infer(arm.body, bodyCx, isStmt ? undefined : exp ?? (result && prune(result).k !== "nil" ? result : undefined));
      this.reportUnused(inner.scope);
      if (!isStmt) {
        if (isPrim(bt, "Never")) continue;
        if (result === undefined) result = bt;
        else result = this.join(result, bt, arm.body.k === "block" ? (arm.body.stmts[0] as any)?.expr ?? subject : arm.body);
        if (exp && !isPrim(exp, "Void") && this.canAssign(bt, exp)) this.coerceLit(arm.body as A.Expr, exp);
      }
    }
    if (!this.coversRows([st], rows)) {
      const missing = this.missingVariants(st, rows);
      this.err(span, "E0460", `this match does not cover every case`, {
        why: missing.length ? `not handled: ${missing.join(", ")}` : `values of type ${show(st)} can reach the end without matching any arm`,
        suggestion: missing.length ? `add arms for ${missing.join(", ")}, or a catch-all \`_ => ...\`` : "add a catch-all arm: `_ => ...`",
      });
    }
    (subject as any).matchTy = st;
    if (isStmt) return T.Void;
    return result ?? T.Never;
  }
}

// ---------- control-flow helpers ----------
type HasStmts = { stmts: A.Stmt[] };
export function exits(b: HasStmts, ck: Checker): boolean { return b.stmts.some((s) => stmtExits(s, ck)); }

/** Can a `break` leave the loop whose body is `stmts`? Inside a nested loop (`inner` = labels of the loops in between)
 *  only a labeled break naming none of them does: `break outer` from an inner loop also leaves `outer: while true`. */
function hasBreak(stmts: A.Stmt[], inner?: (string | undefined)[]): boolean {
  for (const s of stmts) {
    if (s.k === "break" && (!inner || (s.label !== undefined && !inner.includes(s.label)))) return true;
    if ((s.k === "for" || s.k === "while") && hasBreak(s.body.stmts, [...(inner ?? []), s.label])) return true;
    if (s.k === "if" && (hasBreak(s.then.stmts, inner) || (s.else && (s.else.k === "block" ? hasBreak(s.else.stmts, inner) : hasBreak([s.else as A.Stmt], inner))))) return true;
    if (s.k === "block" && hasBreak(s.stmts, inner)) return true;
    if (s.k === "try" && (hasBreak(s.body.stmts, inner) || s.catches.some((c) => hasBreak(c.body.stmts, inner)))) return true;
    if (s.k === "match" && s.arms.some((a) => a.body.k === "block" && hasBreak(a.body.stmts, inner))) return true;
  }
  return false;
}

export function stmtExits(s: A.Stmt, ck: Checker): boolean {
  switch (s.k) {
    case "return": case "throw": case "break": case "continue": return true;
    case "block": return exits(s, ck);
    case "if": {
      if (!s.else) return false;
      const e = s.else.k === "block" ? exits(s.else, ck) : stmtExits(s.else as A.Stmt, ck);
      return exits(s.then, ck) && e;
    }
    case "match": return s.arms.every((a) => (a.body.k === "block" ? exits(a.body, ck) : isPrim(((a.body as any).ty ?? T.Void) as Ty, "Never")));
    case "while": return s.cond.expr.k === "bool" && s.cond.expr.value === true && !s.cond.pat && !hasBreak(s.body.stmts);
    case "try": {
      if (s.finally && exits(s.finally, ck)) return true;
      return exits(s.body, ck) && s.catches.every((c) => exits(c.body, ck));
    }
    case "expr": return isPrim(((s.expr as any).ty ?? T.Void) as Ty, "Never");
    default: return false;
  }
}
