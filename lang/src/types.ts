import * as A from "./ast";

// ---------- semantic types ----------
export type Ty =
  | { k: "prim"; name: "Int" | "Float" | "Bool" | "String" | "Char" | "Void" | "Never" | "Any" }
  | { k: "nil" }
  | { k: "opt"; inner: Ty }
  | { k: "app"; decl: TypeDecl; args: Ty[] }
  | { k: "tuple"; elems: Ty[] }
  | { k: "fn"; params: Ty[]; ret: Ty; names?: string[]; defaults?: boolean[]; variadic?: boolean; async?: boolean }
  | { k: "var"; id: number; ref?: Ty; hint?: "int" | "float" }
  | { k: "param"; name: string; id: number; bounds: Ty[] }
  | { k: "err" };                                   // recovery type: unifies with everything, silences follow-ups

export interface FieldInfo { name: string; ty: Ty; mutable: boolean; vis: A.Visibility; static: boolean; owner: TypeDecl; hasInit: boolean; js: string; span: A.Expr["span"] }
export interface FnInfo {
  name: string; js: string; params: { name: string; ty: Ty; hasDefault: boolean; variadic?: boolean }[]; ret: Ty;
  typeParams: Extract<Ty, { k: "param" }>[]; async: boolean; gen: boolean; vis: A.Visibility; static: boolean;
  owner?: TypeDecl; module: ModuleInfo; decl?: A.FnDecl; native?: string; pub: boolean; isInit?: boolean; accessor?: "get" | "set";
  override?: boolean; operator?: string; abstract?: boolean; id: number;
}
export interface VariantInfo { name: string; fields: { name?: string; ty: Ty }[]; index: number; value?: A.Expr; js: string }
export interface TypeDecl {
  id: string; name: string; kind: "class" | "struct" | "interface" | "enum" | "extern";
  params: Extract<Ty, { k: "param" }>[]; base?: Extract<Ty, { k: "app" }>; ifaces: Extract<Ty, { k: "app" }>[];
  fields: Map<string, FieldInfo>; methods: Map<string, FnInfo[]>; statics: Map<string, FnInfo[]>; getters: Map<string, FnInfo>; setters: Map<string, FnInfo>;
  variants?: VariantInfo[]; module: ModuleInfo; pub: boolean; ast?: A.Decl; js: string; builtin?: boolean;
  ctors: FnInfo[]; resolved: boolean; abstractIface?: boolean; ifaceGetters?: Map<string, Ty>;
  /** For `type X = ...` aliases: */ alias?: { params: Extract<Ty, { k: "param" }>[]; target: A.TypeExpr; scope: any; resolving?: boolean };
}
export interface ModuleInfo {
  name: string; path: string; file: string; ast?: A.Module; imports: Map<string, ImportBinding>;
  types: Map<string, TypeDecl>; fns: Map<string, FnInfo[]>; globals: Map<string, GlobalInfo>;
  exts: ExtInfo[]; deps: string[]; js: string; isStd: boolean; checked: boolean;
}
export interface GlobalInfo { name: string; ty: Ty; mutable: boolean; pub: boolean; js: string; module: ModuleInfo; decl: A.Decl }
export interface ExtInfo { target: Ty; methods: Map<string, FnInfo[]>; params: Extract<Ty, { k: "param" }>[]; module: ModuleInfo; ifaces: Ty[] }
export type ImportBinding =
  | { kind: "module"; mod: ModuleInfo }
  | { kind: "type"; decl: TypeDecl }
  | { kind: "fn"; fns: FnInfo[] }
  | { kind: "global"; g: GlobalInfo };

// ---------- constructors ----------
export const T = {
  Int: { k: "prim", name: "Int" } as Ty, Float: { k: "prim", name: "Float" } as Ty, Bool: { k: "prim", name: "Bool" } as Ty,
  String: { k: "prim", name: "String" } as Ty, Char: { k: "prim", name: "Char" } as Ty, Void: { k: "prim", name: "Void" } as Ty,
  Never: { k: "prim", name: "Never" } as Ty, Any: { k: "prim", name: "Any" } as Ty, nil: { k: "nil" } as Ty, err: { k: "err" } as Ty,
};
let varId = 0;
export const freshVar = (hint?: "int" | "float"): Ty => ({ k: "var", id: ++varId, hint });
let paramId = 0;
export const mkParam = (name: string, bounds: Ty[] = []): Extract<Ty, { k: "param" }> => ({ k: "param", name, id: ++paramId, bounds });
export const opt = (inner: Ty): Ty => (inner.k === "opt" || inner.k === "nil" ? inner : { k: "opt", inner });
export const app = (decl: TypeDecl, args: Ty[] = []): Ty => ({ k: "app", decl, args });
export const fnTy = (params: Ty[], ret: Ty, extra: Partial<Extract<Ty, { k: "fn" }>> = {}): Ty => ({ k: "fn", params, ret, ...extra });

/** Follow inference-variable links. */
export function prune(t: Ty): Ty {
  while (t.k === "var" && t.ref) t = t.ref;
  return t;
}

export function show(t0: Ty): string {
  const t = prune(t0);
  switch (t.k) {
    case "prim": return t.name;
    case "nil": return "nil";
    case "err": return "?";
    case "opt": { const i = prune(t.inner); return i.k === "fn" ? `(${show(i)})?` : `${show(i)}?`; }
    case "tuple": return `(${t.elems.map(show).join(", ")})`;
    case "fn": return `(${t.params.map(show).join(", ")}) -> ${show(t.ret)}`;
    case "var": return t.hint === "int" ? "Int" : t.hint === "float" ? "Float" : "_";
    case "param": return t.name;
    case "app": {
      if (t.decl.name === "Array" && t.decl.builtin) return `[${show(t.args[0])}]`;
      if (t.decl.name === "Map" && t.decl.builtin) return `{${show(t.args[0])}: ${show(t.args[1])}}`;
      return t.args.length ? `${t.decl.name}<${t.args.map(show).join(", ")}>` : t.decl.name;
    }
  }
}

export function subst(t0: Ty, m: Map<Ty, Ty>): Ty {
  const t = prune(t0);
  if (!m.size) return t;
  switch (t.k) {
    case "param": return m.get(t) ?? t;
    case "opt": return opt(subst(t.inner, m));
    case "tuple": return { k: "tuple", elems: t.elems.map((e) => subst(e, m)) };
    case "fn": return { ...t, params: t.params.map((e) => subst(e, m)), ret: subst(t.ret, m) };
    case "app": return t.args.length ? { k: "app", decl: t.decl, args: t.args.map((e) => subst(e, m)) } : t;
    default: return t;
  }
}

export function containsVar(t0: Ty): boolean {
  const t = prune(t0);
  switch (t.k) {
    case "var": return true;
    case "opt": return containsVar(t.inner);
    case "tuple": return t.elems.some(containsVar);
    case "fn": return t.params.some(containsVar) || containsVar(t.ret);
    case "app": return t.args.some(containsVar);
    default: return false;
  }
}

export function collectVars(t0: Ty, out: Extract<Ty, { k: "var" }>[] = []): Extract<Ty, { k: "var" }>[] {
  const t = prune(t0);
  switch (t.k) {
    case "var": if (!out.includes(t)) out.push(t); break;
    case "opt": collectVars(t.inner, out); break;
    case "tuple": t.elems.forEach((e) => collectVars(e, out)); break;
    case "fn": t.params.forEach((e) => collectVars(e, out)); collectVars(t.ret, out); break;
    case "app": t.args.forEach((e) => collectVars(e, out)); break;
  }
  return out;
}

export function occurs(v: Extract<Ty, { k: "var" }>, t0: Ty): boolean {
  const t = prune(t0);
  if (t === v) return true;
  switch (t.k) {
    case "opt": return occurs(v, t.inner);
    case "tuple": return t.elems.some((e) => occurs(v, e));
    case "fn": return t.params.some((e) => occurs(v, e)) || occurs(v, t.ret);
    case "app": return t.args.some((e) => occurs(v, e));
    default: return false;
  }
}

export const isNum = (t: Ty) => { t = prune(t); return t.k === "prim" && (t.name === "Int" || t.name === "Float") || t.k === "var" && !!t.hint; };
export const isPrim = (t: Ty, n: string) => { t = prune(t); return t.k === "prim" && t.name === n; };

/** Every supertype declaration reachable from a class/struct/enum/interface (self included). */
export function supertypes(t: Extract<Ty, { k: "app" }>): Extract<Ty, { k: "app" }>[] {
  const out: Extract<Ty, { k: "app" }>[] = [];
  const seen = new Set<TypeDecl>();
  const walk = (x: Extract<Ty, { k: "app" }>) => {
    if (seen.has(x.decl)) return;
    seen.add(x.decl); out.push(x);
    const m = new Map<Ty, Ty>(); x.decl.params.forEach((p, i) => m.set(p, x.args[i] ?? T.err));
    for (const s of [...(x.decl.base ? [x.decl.base] : []), ...x.decl.ifaces]) walk(subst(s, m) as Extract<Ty, { k: "app" }>);
  };
  walk(t);
  return out;
}

/** Structural equality of fully-resolved types (used for overload and override checks). */
export function same(a0: Ty, b0: Ty): boolean {
  const a = prune(a0), b = prune(b0);
  if (a === b) return true;
  if (a.k === "err" || b.k === "err") return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "prim": return a.name === (b as typeof a).name;
    case "nil": return true;
    case "opt": return same(a.inner, (b as typeof a).inner);
    case "tuple": { const bb = b as typeof a; return a.elems.length === bb.elems.length && a.elems.every((e, i) => same(e, bb.elems[i])); }
    case "fn": { const bb = b as typeof a; return a.params.length === bb.params.length && a.params.every((e, i) => same(e, bb.params[i])) && same(a.ret, bb.ret); }
    case "app": { const bb = b as typeof a; return a.decl === bb.decl && a.args.length === bb.args.length && a.args.every((e, i) => same(e, bb.args[i])); }
    case "param": return a === b;
    case "var": return false;
  }
  return false;
}
