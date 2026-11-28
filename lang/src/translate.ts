/**
 * `mycel translate file.py [-o file.myc]` (tasks 55 & W61): Python → Mycel using Python's own parser
 * (`tools/pyast.py`: stdlib `ast` + `tokenize` comments — never a regex over Python). Each construct maps to the
 * idiomatic Mycel spelling; where Python and Mycel differ in semantics (True/None/quotes, `//` and `%` floor
 * rounding, banker's round, clamped slices, list `+`/`*`), the output calls `pycompat`. Foreign packages emit
 * the final `--python` import syntax (`import x --python`, `from x import y --python`) and plain object syntax.
 * Untranslatable lines become `# TODO(translate) line N: ...` comments — never silently dropped.
 */
import * as fs from "fs";
import { spawnSync } from "child_process";
import { KEYWORDS } from "./lexer";
import { VALUE_WORDS } from "./habits";
import { pythonFor, toolFile } from "./foreign";

type N = any;
interface Ty {
  k: "int" | "float" | "str" | "char" | "bool" | "none" | "list" | "dict" | "set" | "tuple" | "range" | "gen" | "obj" | "exc" | "fn" | "value" | "?";
  el?: Ty;
  key?: Ty;
  val?: Ty;
  items?: Ty[];
  cls?: string;
  opt?: boolean;
}
const T = (k: Ty["k"], extra: Partial<Ty> = {}): Ty => ({ k, ...extra });
const U: Ty = T("?");
const scalar = (t: Ty) => !t.opt && (t.k === "int" || t.k === "float" || t.k === "str" || t.k === "char");

export interface Todo { line: number; why: string; source: string }
export interface ExplainPair { pyLine: number; py: string; myc: string; note?: string }
export interface TranslateResult { code: string; todos: Todo[]; packages: string[]; explanations: ExplainPair[] }

interface PyComment { l: number; c: number; t: string; inline: boolean }

class Untranslatable extends Error {}
const no = (why: string): never => { throw new Untranslatable(why); };

const MYCEL_KW = KEYWORDS;
const ident = (n: string) => (MYCEL_KW.has(n) ? n + "_" : n);
const needsVarDecl = (n: string) => Object.prototype.hasOwnProperty.call(VALUE_WORDS, n);

function strLit(s: string): string {
  let o = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") o += "\\\\";
    else if (ch === '"') o += '\\"';
    else if (ch === "\n") o += "\\n";
    else if (ch === "\t") o += "\\t";
    else if (ch === "\r") o += "\\r";
    else if (c < 32 || c === 127) o += `\\u{${c.toString(16)}}`;
    else o += ch;
  }
  return `"${o}"`;
}

const PRIMS: Record<string, string> = { int: "Int", float: "Float", str: "String", bool: "Bool", None: "Void" };
const EXC: Record<string, string> = { Exception: "Error", BaseException: "Error", ValueError: "py.ValueError", OSError: "IoError", FileNotFoundError: "IoError", IOError: "IoError" };
const PANIC_EXC = new Set(["IndexError", "KeyError", "ZeroDivisionError", "TypeError", "AttributeError", "RecursionError", "OverflowError", "AssertionError"]);
const PY_BUILTIN_VALUES = new Set(["int", "float", "str", "bool", "list", "dict", "set", "tuple", "max", "min", "len", "abs", "sum"]);

interface ClassInfo {
  name: string;
  fields: Map<string, Ty>;
  base?: string;
  isExc: boolean;
  isDataclass?: boolean;
  frozen?: boolean;
  dcFields?: { name: string; ty: Ty; def?: N }[];
  enumKind?: "Enum" | "IntEnum" | "StrEnum";
  enumMembers?: { name: string; value: N }[];
  enumValTy?: Ty;
  initTypes: Map<string, Ty>;
  methods: Map<string, N>;
  paramTypes: Map<string, Ty[]>;
}
interface FnInfo { ret: Ty; params: string[]; callTypes?: Ty[]; isGen?: boolean }

class Scope {
  vars = new Map<string, Ty>();
  /** types guessed by a pre-pass over the whole body (flow-insensitive), used only when nothing better is known */
  hints = new Map<string, Ty>();
  /** local functions declared inside a function body */
  localFns = new Map<string, FnInfo>();
  /** special local bindings like defaultdict kind or open() file handle */
  ddKinds = new Map<string, "int" | "float" | "list" | "set">();
  fileVars = new Map<string, { mode: "read" | "write" | "append"; bufVar: string }>();
  hint(n: string): Ty | undefined { return this.hints.get(n) ?? this.parent?.hint(n); }
  constructor(readonly parent?: Scope, readonly fn = false) {}
  get(n: string): Ty | undefined { return this.vars.get(n) ?? this.parent?.get(n); }
  has(n: string): boolean { return this.vars.has(n) || !!this.parent?.has(n); }
  getFn(n: string): FnInfo | undefined { return this.localFns.get(n) ?? this.parent?.getFn(n); }
  getDd(n: string): "int" | "float" | "list" | "set" | undefined { return this.ddKinds.get(n) ?? this.parent?.getDd(n); }
  getFile(n: string): { mode: "read" | "write" | "append"; bufVar: string } | undefined { return this.fileVars.get(n) ?? this.parent?.getFile(n); }
}

export function translatePython(file: string): TranslateResult {
  const r = spawnSync(pythonFor(undefined), [toolFile("pyast.py"), file], { encoding: "utf8", maxBuffer: 256 << 20 });
  let j: any;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`could not read ${file} with Python's parser: ${(r.error?.message ?? r.stderr ?? "").trim().split("\n").pop()}`); }
  if (j.error) throw new Error(`${file}:${j.error.line}:${j.error.col}: Python syntax error: ${j.error.msg} (fix the Python first; mycel translate reads it with Python's own parser)`);
  return new Translator(fs.readFileSync(file, "utf8"), file, j.comments ?? []).module(j.ok);
}

class Translator {
  lines: string[];
  comments: PyComment[];
  emittedComments = new Set<number>();
  todos: Todo[] = [];
  explanations: ExplainPair[] = [];
  usesPy = false;
  usesMath = false;
  usesEnv = false;
  usesFiles = false;
  usesRe = false;
  usesBuiltins = false;
  usesOp = new Set<string>(); // itemgetter / attrgetter
  usesCollections = new Set<string>(); // defaultdict (only native if not Counter/deque)
  reMode: "none" | "helper" | "std" | "foreign" = "none";
  foreignLines: string[] = [];
  foreignPkgs = new Set<string>();
  foreignMods = new Map<string, string>(); // local alias or module -> python module name
  foreignValues = new Set<string>(); // imported symbols like Counter, Path, combinations
  classes = new Map<string, ClassInfo>();
  fns = new Map<string, FnInfo>();
  cls?: ClassInfo;
  scope = new Scope();
  renamedMain = false;
  lambdaParam: Ty = U;
  tmpCounter = 0;

  constructor(src: string, readonly file: string, comments: PyComment[] = []) {
    this.lines = src.split("\n");
    this.comments = comments;
  }

  private tmp(prefix: string): string { return `${prefix}${++this.tmpCounter}__`; }

  private formatComment(t: string): string {
    const body = t.startsWith("#") ? t.slice(1) : t;
    if (!body.trim()) return "#";
    return body.startsWith(" ") ? `#${body}` : `# ${body}`;
  }

  private standaloneCommentsBefore(line: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.comments.length; i++) {
      const c = this.comments[i];
      if (this.emittedComments.has(i) || c.inline) continue;
      if (c.l < line) {
        this.emittedComments.add(i);
        out.push(this.formatComment(c.t));
      }
    }
    return out;
  }

  private inlineCommentAt(line: number): string | undefined {
    for (let i = 0; i < this.comments.length; i++) {
      const c = this.comments[i];
      if (this.emittedComments.has(i) || !c.inline) continue;
      if (c.l === line) {
        this.emittedComments.add(i);
        return this.formatComment(c.t);
      }
    }
    return undefined;
  }

  private markCommentsInRange(from: number, to: number) {
    for (let i = 0; i < this.comments.length; i++) {
      const c = this.comments[i];
      if (c.l >= from && c.l <= to) this.emittedComments.add(i);
    }
  }

  hintLocals(body: N[], scope: Scope) {
    const saved = this.scope;
    this.scope = scope;
    for (let round = 0; round < 3; round++) {
      walk(body, (n) => {
        if (n._t === "Assign" && n.targets.length === 1 && n.targets[0]._t === "Name") {
          const id = n.targets[0].id;
          if (this.isDefaultdictCall(n.value)) {
            const dk = this.ddKindOf(n.value);
            if (dk) {
              scope.ddKinds.set(id, dk);
              const ft = this.ddFilledType(id, dk, body);
              if (ft) scope.hints.set(id, ft);
              return;
            }
          }
          const t = this.ty(n.value);
          if (t.k !== "?" && !isEmptyLit(n.value)) scope.hints.set(id, t);
        }
        if (n._t === "For" && n.target._t === "Name") {
          const t = this.elemOf(this.ty(n.iter));
          if (t.k !== "?") scope.hints.set(n.target.id, t);
        }
        if (n._t === "Assign" && isEmptyLit(n.value) && n.targets[0]._t === "Name") {
          const t = this.filled(n.targets[0].id, n.value, body);
          if (t) scope.hints.set(n.targets[0].id, t);
        }
      }, true);
    }
    this.scope = saved;
  }

  private isDefaultdictCall(n: N): boolean {
    return n?._t === "Call" && ((n.func._t === "Name" && n.func.id === "defaultdict") || (n.func._t === "Attribute" && n.func.attr === "defaultdict"));
  }
  private ddKindOf(n: N): "int" | "float" | "list" | "set" | undefined {
    const a0 = n.args?.[0];
    if (a0?._t === "Name" && (a0.id === "int" || a0.id === "float" || a0.id === "list" || a0.id === "set")) return a0.id;
    return undefined;
  }
  private ddFilledType(name: string, kind: "int" | "float" | "list" | "set", body: N[]): Ty | undefined {
    let key: Ty | undefined, el: Ty | undefined;
    walk(body, (n) => {
      if (n._t === "Subscript" && n.value._t === "Name" && n.value.id === name && n.slice._t !== "Slice") {
        const k = this.ty(n.slice);
        if (k.k !== "?" && !key) key = k;
      }
      if (n._t === "Call" && n.func._t === "Attribute" && (n.func.attr === "append" || n.func.attr === "add") && n.func.value._t === "Subscript" && n.func.value.value._t === "Name" && n.func.value.value.id === name && n.args[0]) {
        const t = this.ty(n.args[0]);
        if (t.k !== "?" && !el) el = t;
      }
    }, true);
    const kTy = key ?? T("str");
    if (kind === "int") return T("dict", { key: kTy, val: T("int") });
    if (kind === "float") return T("dict", { key: kTy, val: T("float") });
    if (kind === "list") return T("dict", { key: kTy, val: T("list", { el: el ?? T("obj", { cls: "Any" }) }) });
    if (kind === "set") return T("dict", { key: kTy, val: T("set", { el: el ?? T("obj", { cls: "Any" }) }) });
    return undefined;
  }

  /** the full type of an empty literal from how the body fills it: xs.append(v) / s.add(v) / d[k] = v */
  filled(name: string, lit: N, body: N[]): Ty | undefined {
    let el: Ty | undefined, key: Ty | undefined, val: Ty | undefined;
    const is = (x: N) => name.startsWith("self.") ? x._t === "Attribute" && x.value._t === "Name" && x.value.id === "self" && x.attr === name.slice(5) : x._t === "Name" && x.id === name;
    walk(body, (n) => {
      if (n._t === "Call" && n.func._t === "Attribute" && is(n.func.value) && n.args.length) {
        const m = n.func.attr, a = n.args[m === "insert" ? 1 : 0];
        if ((m === "append" || m === "add" || m === "insert") && a) { const t = this.ty(a); if (t.k !== "?" && !el) el = t; }
      }
      if (n._t === "Assign" && n.targets[0]?._t === "Subscript" && is(n.targets[0].value) && n.targets[0].slice._t !== "Slice") {
        const k = this.ty(n.targets[0].slice), v = this.ty(n.value);
        if (k.k !== "?" && !key) key = k; if (v.k !== "?" && !val) val = v;
      }
    }, true);
    const kind = lit._t === "List" ? "list" : lit._t === "Dict" ? "dict" : "set";
    if (kind === "dict") return key && val ? T("dict", { key, val }) : undefined;
    return el ? T(kind, { el }) : undefined;
  }

  // ------------------------------------------------------------------ module
  module(m: N): TranslateResult {
    const body: N[] = m.body;
    const isGuard = (s: N) => s._t === "If" && s.test._t === "Compare" && s.test.left._t === "Name" && s.test.left.id === "__name__";
    const flat: N[] = [];
    for (const s of body) { if (isGuard(s)) flat.push(...s.body); else flat.push(s); }
    const hasMain = flat.some((s) => s._t === "FunctionDef" && s.name === "main");
    const isMainCall = (s: N) => s._t === "Expr" && s.value._t === "Call" && s.value.func._t === "Name" && s.value.func.id === "main" && !s.value.args.length;
    let stmts = flat;
    const scriptish = flat.filter((s) => !["FunctionDef", "ClassDef", "Import", "ImportFrom"].includes(s._t) && !(s._t === "Expr" && s.value._t === "Constant"));
    if (hasMain && scriptish.length === 1 && isMainCall(scriptish[0])) stmts = flat.filter((s) => !isMainCall(s));
    else if (hasMain && scriptish.length) this.renamedMain = true;
    this.prepass(stmts);
    this.hintLocals(stmts, this.scope);
    this.methodTypes(stmts);
    const out: string[] = [];
    for (const s of stmts) out.push(...this.stmt(s));
    for (const c of this.standaloneCommentsBefore(Infinity)) out.push(c);

    const head = [`# Translated from ${this.file.split(/[\\/]/).pop()} by \`mycel translate\`. Read it through: Python and Mycel differ in places.`];
    const imports: string[] = [];
    if (this.usesPy) imports.push("import pycompat as py");
    if (this.usesMath) imports.push("import math");
    if (this.usesEnv) imports.push("import env");
    if (this.usesFiles) imports.push("import files");
    if (this.usesRe) imports.push("import re");
    if (this.usesBuiltins) {
      this.foreignPkgs.add("builtins");
      imports.push("import builtins as pyb__ --python");
    }
    imports.push(...this.foreignLines);
    if (this.foreignPkgs.size) {
      head.push(`# Python modules are called through the Python bridge: run with --allow-pkg=${[...this.foreignPkgs].join(",")} (or grant them in ply.json); third-party ones need \`ply install <name> --python\` first.`);
    }
    if (this.todos.length) head.push(`# ${this.todos.length} line(s) could not be translated: search for TODO(translate).`);
    const code = [...head, ...imports, ...(imports.length ? [""] : []), ...trimBlank(out)].join("\n") + "\n";
    return { code, todos: this.todos, packages: [...this.foreignPkgs], explanations: this.explanations };
  }

  /** Signatures and class fields first, so calls and attribute uses know their types. */
  prepass(stmts: N[]) {
    for (const s of stmts) {
      if (s._t === "ClassDef") {
        const base = s.bases[0]?._t === "Name" ? s.bases[0].id : undefined;
        const enumKind = base === "Enum" || base === "IntEnum" || base === "StrEnum" ? base : undefined;
        const dcDec = s.decorator_list?.find((d: N) => (d._t === "Name" && d.id === "dataclass") || (d._t === "Call" && d.func._t === "Name" && d.func.id === "dataclass") || (d._t === "Attribute" && d.attr === "dataclass"));
        const frozen = dcDec?._t === "Call" && !!kw(dcDec, "frozen") && kw(dcDec, "frozen").value === true;
        const isExc = !!base && (base in EXC || PANIC_EXC.has(base) || this.classes.get(base)?.isExc === true);
        const info: ClassInfo = {
          name: s.name,
          fields: new Map(),
          base,
          isExc,
          isDataclass: !!dcDec,
          frozen,
          initTypes: new Map(),
          methods: new Map(s.body.filter((b: N) => b._t === "FunctionDef").map((b: N) => [b.name, b])),
          paramTypes: new Map(),
        };
        if (enumKind) {
          info.enumKind = enumKind;
          info.enumMembers = [];
          for (const b of s.body) {
            if (b._t === "Assign" && b.targets.length === 1 && b.targets[0]._t === "Name") {
              info.enumMembers.push({ name: b.targets[0].id, value: b.value });
            }
          }
          const firstVal = info.enumMembers[0]?.value;
          info.enumValTy = enumKind === "IntEnum" ? T("int") : enumKind === "StrEnum" ? T("str") : firstVal ? this.ty(firstVal) : T("int");
          info.fields.set("name", T("str"));
          info.fields.set("value", info.enumValTy);
        }
        if (info.isDataclass) {
          info.dcFields = [];
          for (const b of s.body) {
            if (b._t === "AnnAssign" && b.target._t === "Name") {
              const ft = this.annot(b.annotation);
              const fty = ft.k !== "?" ? ft : b.value ? this.ty(b.value) : U;
              info.fields.set(b.target.id, fty);
              info.initTypes.set(b.target.id, fty);
              info.dcFields.push({ name: b.target.id, ty: fty, def: b.value });
            }
          }
        }
        this.classes.set(s.name, info);

        const init = s.body.find((b: N) => b._t === "FunctionDef" && b.name === "__init__");
        const ptypes = new Map<string, Ty>();
        if (init) {
          for (const a of init.args.args.slice(1)) ptypes.set(a.arg, this.annot(a.annotation));
          const ps = init.args.args.slice(1).map((a: N) => a.arg);
          walk(stmts, (n) => {
            if (n._t === "Call" && n.func._t === "Name" && n.func.id === s.name) {
              n.args.forEach((a: N, i: number) => { if (ps[i] && ptypes.get(ps[i])!.k === "?") ptypes.set(ps[i], this.ty(a)); });
            }
          });
          info.initTypes = ptypes;
        }
        for (const m of s.body) if (m._t === "FunctionDef") walk(m.body, (n) => {
          if ((n._t === "Assign" || n._t === "AnnAssign") && n) for (const t of n._t === "Assign" ? n.targets : [n.target]) {
            if (t._t === "Attribute" && t.value._t === "Name" && t.value.id === "self" && !info.fields.has(t.attr)) {
              const v = n.value;
              let ty = n._t === "AnnAssign" ? this.annot(n.annotation) : v?._t === "Name" && ptypes.has(v.id) ? ptypes.get(v.id)! : v ? this.ty(v) : U;
              if ((ty.k === "list" || ty.k === "dict" || ty.k === "set") && !ty.el && !ty.val) ty = U;
              info.fields.set(t.attr, ty);
            }
          }
        });
      }
      if (s._t === "FunctionDef") {
        this.fns.set(s.name, { ret: this.annot(s.returns), params: s.args.args.map((a: N) => a.arg), isGen: hasYield(s.body) });
      }
    }
    // Propagate constructor call types from subclasses without their own __init__ up to base.__init__
    for (const c of this.classes.values()) {
      if (c.methods.has("__init__") || !c.base) continue;
      let b = this.classes.get(c.base);
      while (b && !b.methods.has("__init__")) b = b.base ? this.classes.get(b.base) : undefined;
      if (!b) continue;
      const init = b.methods.get("__init__")!;
      const ps = init.args.args.slice(1).map((a: N) => a.arg);
      walk(stmts, (n) => {
        if (n._t === "Call" && n.func._t === "Name" && n.func.id === c.name) {
          n.args.forEach((a: N, i: number) => { if (ps[i] && (!b!.initTypes.get(ps[i]) || b!.initTypes.get(ps[i])!.k === "?")) b!.initTypes.set(ps[i], this.ty(a)); });
        }
      });
    }
  }

  /** untyped method parameters and empty-literal fields, from how the module uses them */
  methodTypes(stmts: N[]) {
    const seen = new Map<string, (Ty | null)[]>();
    walk(stmts, (n) => {
      if (n._t !== "Call" || n.func._t !== "Name" || !this.fns.has(n.func.id)) return;
      const have = seen.get(n.func.id) ?? [];
      n.args.forEach((a: N, i: number) => { const t = this.ty(a); if (have[i] === undefined) have[i] = t.k === "?" ? null : t; else if (have[i] && have[i]!.k !== t.k) have[i] = null; });
      seen.set(n.func.id, have);
    });
    for (const [f, ts] of seen) this.fns.get(f)!.callTypes = ts.map((t) => t ?? U);
    walk(stmts, (n) => {
      if (n._t !== "Call" || n.func._t !== "Attribute") return;
      const ot = this.ty(n.func.value);
      if (ot.k !== "obj" || !ot.cls) return;
      let c = this.classes.get(ot.cls);
      while (c && !c.methods.has(n.func.attr)) c = c.base ? this.classes.get(c.base) : undefined;
      if (!c) return;
      const have = c.paramTypes.get(n.func.attr) ?? [];
      n.args.forEach((a: N, i: number) => { if (!have[i] || have[i].k === "?") have[i] = this.ty(a); });
      c.paramTypes.set(n.func.attr, have);
    });
    for (const c of this.classes.values()) for (const [f, t] of c.fields) {
      if (t.k !== "?") continue;
      for (const [mn, m] of c.methods) {
        const scope = new Scope(this.scope);
        m.args.args.slice(1).forEach((a: N, i: number) => scope.vars.set(a.arg, this.annot(a.annotation).k !== "?" ? this.annot(a.annotation) : (mn === "__init__" ? c.initTypes.get(a.arg) : c.paramTypes.get(mn)?.[i]) ?? U));
        scope.vars.set(m.args.args[0]?.arg ?? "self", T("obj", { cls: c.name }));
        const saved = this.scope; this.scope = scope;
        this.hintLocals(m.body, scope);
        const init = walkFind(c.methods.get("__init__")?.body ?? [], (x) => x._t === "Assign" && x.targets[0]?._t === "Attribute" && x.targets[0].attr === f ? x.value : undefined);
        const got = init && isEmptyLit(init) ? this.filled("self." + f, init, m.body) : undefined;
        this.scope = saved;
        if (got) { c.fields.set(f, got); break; }
      }
    }
  }

  annot(a: N): Ty {
    if (!a) return U;
    if (a._t === "Name") return ({ int: T("int"), float: T("float"), str: T("str"), bool: T("bool") } as any)[a.id] ?? (this.classes.has(a.id) ? T("obj", { cls: a.id }) : U);
    if (a._t === "Constant" && a.value === null) return T("none");
    if (a._t === "Subscript" && a.value._t === "Name") {
      const args = a.slice._t === "Tuple" ? a.slice.elts : [a.slice];
      switch (a.value.id) {
        case "list": case "List": return T("list", { el: this.annot(args[0]) });
        case "set": case "Set": return T("set", { el: this.annot(args[0]) });
        case "dict": case "Dict": return T("dict", { key: this.annot(args[0]), val: this.annot(args[1]) });
        case "tuple": case "Tuple": return T("tuple", { items: args.map((x: N) => this.annot(x)) });
        case "Optional": { const inner = this.annot(args[0]); return inner.k !== "?" ? { ...inner, opt: true } : U; }
      }
    }
    if (a._t === "BinOp" && a.op._t === "BitOr") {
      const lt = this.annot(a.left), rt = this.annot(a.right);
      if (rt.k === "none" && lt.k !== "?") return { ...lt, opt: true };
      if (lt.k === "none" && rt.k !== "?") return { ...rt, opt: true };
    }
    return U;
  }

  /** a Mycel type name, or undefined when not expressible */
  tyName(t: Ty): string | undefined {
    let base: string | undefined;
    switch (t.k) {
      case "int": base = "Int"; break;
      case "float": base = "Float"; break;
      case "str": base = "String"; break;
      case "bool": base = "Bool"; break;
      case "char": base = "Char"; break;
      case "list": { const e = t.el && this.tyName(t.el); base = e ? `[${e}]` : undefined; break; }
      case "set": { const e = t.el && this.tyName(t.el); base = e ? `Set<${e}>` : undefined; break; }
      case "dict": { const k = t.key && this.tyName(t.key), v = t.val && this.tyName(t.val); base = k && v ? `{${k}: ${v}}` : undefined; break; }
      case "tuple": { const xs = (t.items ?? []).map((x) => this.tyName(x)); base = xs.length && xs.every(Boolean) ? `(${xs.join(", ")})` : undefined; break; }
      case "gen": { const e = t.el && this.tyName(t.el); base = e ? `Gen<${e}>` : "Gen<Any>"; break; }
      case "obj": base = t.cls?.startsWith("__") ? undefined : t.cls; break;
    }
    if (!base) return undefined;
    return t.opt ? `${base}?` : base;
  }

  // ------------------------------------------------------------------ statements
  todo(s: N, why: string): string[] {
    const from = s.decorator_list?.[0]?._l ?? s._l ?? 0, to = s._e ?? from;
    const src = this.lines.slice(from - 1, to).map((l) => l.trim()).join(" ⏎ ");
    this.markCommentsInRange(from, to);
    this.todos.push({ line: from, why, source: src });
    return [`# TODO(translate) line ${from}: ${why}: ${src}`];
  }

  /** register nested `def`s inside a block before translating its statements */
  private registerLocalFns(body: N[], scope: Scope) {
    for (const s of body) {
      if (s._t === "FunctionDef") {
        scope.localFns.set(s.name, { ret: this.annot(s.returns), params: s.args.args.map((a: N) => a.arg), isGen: hasYield(s.body) });
      }
    }
    const saved = this.scope;
    this.scope = scope;
    for (const [fnName, info] of scope.localFns) {
      const seen: (Ty | null)[] = [];
      walk(body, (n) => {
        if (n._t !== "Call" || n.func._t !== "Name" || n.func.id !== fnName) return;
        n.args.forEach((a: N, i: number) => {
          const t = this.ty(a);
          if (seen[i] === undefined) seen[i] = t.k === "?" ? null : t;
          else if (seen[i] && seen[i]!.k !== t.k) seen[i] = null;
        });
      }, true);
      info.callTypes = seen.map((t) => t ?? U);
    }
    this.scope = saved;
  }

  block(body: N[], scope?: Scope): string[] {
    const saved = this.scope;
    this.scope = scope ?? new Scope(this.scope);
    this.registerLocalFns(body, this.scope);
    const out: string[] = [];
    for (const s of body) out.push(...this.stmt(s));
    const maxLine = body.length ? Math.max(...body.map((b) => b._e ?? b._l ?? 0)) : 0;
    if (maxLine) {
      for (const c of this.standaloneCommentsBefore(maxLine + 1)) out.push(c);
    }
    this.scope = saved;
    return out.map((l) => (l ? "  " + l : l));
  }

  stmt(s: N): string[] {
    const pre = s._l ? this.standaloneCommentsBefore(s._l) : [];
    let res: string[];
    try {
      res = this.stmtInner(s);
    } catch (e) {
      if (e instanceof Untranslatable) {
        return [...pre, ...this.todo(s, e.message)];
      }
      throw e;
    }
    if (s._l && res.length) {
      const inl = this.inlineCommentAt(s._l);
      if (inl) res[0] = `${res[0]}  ${inl}`;
      const pySrc = this.lines[(s._l ?? 1) - 1]?.trim() ?? "";
      if (pySrc && res[0].trim()) {
        this.recordExplain(s._l, pySrc, res[0].trim(), s);
      }
    }
    return [...pre, ...res];
  }

  private optCheckName(test: N): string | undefined {
    if (test._t === "Name") {
      const t = this.scope.get(test.id);
      if (t && (t.opt || (t.k === "obj" && t.cls === "__re_Match__"))) return test.id;
    }
    if (test._t === "Compare" && test.ops.length === 1 && (test.ops[0]._t === "NotEq" || test.ops[0]._t === "IsNot") && test.comparators[0]?._t === "Constant" && test.comparators[0].value === null && test.left._t === "Name") {
      const t = this.scope.get(test.left.id);
      if (t && (t.opt || (t.k === "obj" && t.cls === "__re_Match__"))) return test.left.id;
    }
    return undefined;
  }

  private recordExplain(pyLine: number, py: string, myc: string, s: N) {
    if (this.explanations.length >= 200) return;
    let note: string | undefined;
    if (s._t === "FunctionDef") note = hasYield(s.body) ? "Python generator (`yield`) → `gen fn` producing `Gen<T>`" : "`def` → `fn` with `{ ... }` blocks and Mycel type annotations";
    else if (s._t === "ClassDef") note = s.decorator_list?.length ? "`@dataclass` → Mycel `class` with `init` and fields" : "Python `class` → Mycel `class` with typed fields and `init`";
    else if (s._t === "Import" || s._t === "ImportFrom") note = "imports use `import x --python` or `from x import y --python` (flag at the end)";
    else if (s._t === "With") note = "`with open(...)` → `files` or `try / finally` resource cleanup";
    else if (s._t === "For") note = "`range(n)` → `0..n`; `enumerate` → `for i, x in items`; `dict.items()` → `for k, v in d`";
    else if (s._t === "Try") note = "`except E:` → `catch e: Type`; `else:` runs only when `try` succeeded";
    else if (py !== myc) note = "adapted to Mycel syntax";
    this.explanations.push({ pyLine, py, myc, note });
  }

  stmtInner(s: N): string[] {
    switch (s._t) {
      case "Expr": {
        if (s.value._t === "Constant" && typeof s.value.value === "string") {
          return s.value.value.split("\n").map((l: string) => `# ${l}`.trimEnd());
        }
        if (s.value._t === "Yield") return [s.value.value ? `yield ${this.ex(s.value.value)}` : "yield nil"];
        if (s.value._t === "YieldFrom") return [`yield* ${this.ex(s.value.value)}`];
        return this.exprStmt(s.value);
      }
      case "Pass": return [];
      case "Break": return ["break"];
      case "Continue": return ["continue"];
      case "Return": return [s.value ? `return ${this.ex(s.value)}` : "return"];
      case "Assign": return this.assign(s);
      case "AnnAssign": {
        if (!s.value) return [];
        const t = this.annot(s.annotation), tn = this.tyName(t);
        if (s.target._t !== "Name") return this.assign({ ...s, targets: [s.target] });
        const name = ident(s.target.id);
        const fresh = !this.scope.has(s.target.id);
        this.scope.vars.set(s.target.id, t.k === "?" ? this.ty(s.value) : t);
        return [fresh ? `var ${name}${tn ? `: ${tn}` : ""} = ${this.ex(s.value, t)}` : `${name} = ${this.ex(s.value, t)}`];
      }
      case "AugAssign": return this.augAssign(s);
      case "If": {
        const optName = this.optCheckName(s.test);
        if (optName) {
          const ot = this.scope.get(optName);
          const sc = new Scope(this.scope);
          if (ot) sc.vars.set(optName, { ...ot, opt: false });
          const out = [`if let ${ident(optName)} = ${ident(optName)} {`, ...this.block(s.body, sc)];
          if (s.orelse.length) out.push("} else {", ...this.block(s.orelse));
          out.push("}");
          return out;
        }
        const out = [`if ${this.cond(s.test)} {`, ...this.block(s.body)];
        let orelse: N[] = s.orelse;
        while (orelse.length === 1 && orelse[0]._t === "If") { out.push(`} else if ${this.cond(orelse[0].test)} {`, ...this.block(orelse[0].body)); orelse = orelse[0].orelse; }
        if (orelse.length) out.push("} else {", ...this.block(orelse));
        out.push("}");
        return out;
      }
      case "While": {
        if (!s.orelse.length) return [`while ${this.cond(s.test)} {`, ...this.block(s.body), "}"];
        const broke = this.tmp("broke");
        const body = this.rewriteBreak(s.body, broke);
        return [`var ${broke} = false`, `while ${this.cond(s.test)} {`, ...body, "}", `if !${broke} {`, ...this.block(s.orelse), "}"];
      }
      case "For": return this.forStmt(s);
      case "FunctionDef": return this.fnDef(s);
      case "ClassDef": return this.classDef(s);
      case "Import": return s.names.flatMap((a: N) => this.importOne(a.name, a.asname, s));
      case "ImportFrom": return this.importFrom(s);
      case "Try": return this.tryStmt(s);
      case "Raise": {
        if (!s.exc) no("a bare `raise` (re-raise) has no Mycel form");
        return [`throw ${this.excExpr(s.exc)}`];
      }
      case "Assert": return [`assert(${this.cond(s.test)}${s.msg ? `, ${this.strOf(s.msg)}` : ""})`];
      case "Delete": return s.targets.map((t: N) => {
        if (t._t !== "Subscript" || t.slice._t === "Slice") no("only `del d[key]` and `del xs[i]` are translated");
        const ty = this.ty(t.value);
        return ty.k === "dict" ? `${this.ex(t.value)}.remove(${this.ex(t.slice)})` : `${this.ex(t.value)}.removeAt(${this.ex(t.slice)})`;
      });
      case "Global": case "Nonlocal": return [`# (Python: ${s._t.toLowerCase()} ${s.names.join(", ")} — Mycel functions assign module variables directly)`];
      case "With": return this.withStmt(s);
      case "Match": no("`match` statements are not translated yet (Mycel has `match`, with different patterns)");
    }
    return no(`${s._t} is not translated`);
  }

  private withStmt(s: N): string[] {
    if (s.items.length !== 1) no("`with` with multiple context managers is not translated");
    const item = s.items[0];
    const ctx = item.context_expr;
    const isOpen = ctx?._t === "Call" && ctx.func._t === "Name" && ctx.func.id === "open" && ctx.args.length >= 1;
    if (!isOpen) no("`with` blocks are not translated (files: use files; locks: not needed)");
    const varName = item.optional_vars?._t === "Name" ? item.optional_vars.id : undefined;
    if (!varName) no("`with open(...)` without `as f` is not translated");

    // Check if the file handle `f` is passed directly to a foreign module (like csv.reader(f), csv.writer(f))
    const usedInForeign = walkFind(s.body, (n) => {
      if (n._t === "Call" && n.args?.some((a: N) => a._t === "Name" && a.id === varName)) {
        if (n.func._t === "Attribute" && ((n.func.value._t === "Name" && this.foreignMods.has(n.func.value.id)) || this.ty(n.func.value).k === "value")) return n;
        if (n.func._t === "Name" && this.foreignValues.has(n.func.id)) return n;
      }
      return undefined;
    });

    if (usedInForeign) {
      this.usesBuiltins = true;
      const fresh = !this.scope.has(varName);
      this.scope.vars.set(varName, T("value"));
      const openCall = this.foreignCallExpr("pyb__.open", ctx.args, ctx.keywords);
      return [
        `${fresh ? "var " : ""}${ident(varName)} = ${openCall}`,
        "try {",
        ...this.block(s.body),
        "} finally {",
        `  ${ident(varName)}.close()`,
        "}",
      ];
    }

    // Native Mycel files path
    this.usesFiles = true;
    this.usesPy = true;
    const pathExpr = this.ex(ctx.args[0]);
    const modeNode = ctx.args[1] ?? kw(ctx, "mode");
    const modeStr = modeNode?._t === "Constant" && typeof modeNode.value === "string" ? modeNode.value : "r";
    const isAppend = modeStr.includes("a");
    const isWrite = modeStr.includes("w");
    const mode: "read" | "write" | "append" = isAppend ? "append" : isWrite ? "write" : "read";

    const scope = new Scope(this.scope);
    const bufVar = this.tmp(varName + "_io");
    scope.fileVars.set(varName, { mode, bufVar });
    if (mode === "read") {
      return [
        `let ${bufVar} = py.orThrow(files.read(${pathExpr}))`,
        ...this.block(s.body, scope),
      ];
    }
    const writeFn = mode === "append" ? "files.append" : "files.write";
    return [
      `var ${bufVar} = ""`,
      ...this.block(s.body, scope),
      `py.orThrow(${writeFn}(${pathExpr}, ${bufVar}))`,
    ];
  }

  private rewriteBreak(body: N[], brokeVar: string): string[] {
    const out: string[] = [];
    for (const s of body) {
      if (s._t === "Break") { out.push(`  ${brokeVar} = true`, "  break"); continue; }
      out.push(...this.stmt(s).map((l) => (l ? "  " + l : l)));
    }
    return out;
  }

  exprStmt(e: N): string[] {
    if (e._t === "Call" && e.func._t === "Attribute") {
      const recv = e.func.value, m = e.func.attr, rt = this.ty(recv);
      const R = () => this.ex(recv);
      if (recv._t === "Name") {
        const fv = this.scope.getFile(recv.id);
        if (fv && (fv.mode === "write" || fv.mode === "append") && m === "write" && e.args.length === 1) {
          return [`${fv.bufVar} += ${this.strOf(e.args[0])}`];
        }
        if (this.scope.getDd(recv.id) === undefined && recv.id === "d") {
          // fall through
        }
      }
      // defaultdict(list): d[k].append(v)
      if (recv._t === "Subscript" && recv.value._t === "Name" && this.scope.getDd(recv.value.id) === "list" && m === "append" && e.args.length === 1) {
        const d = ident(recv.value.id), k = this.ex(recv.slice), v = this.ex(e.args[0]);
        return [`if !(${k} in ${d}) { ${d}[${k}] = [] }`, `${d}[${k}]!.push(${v})`];
      }
      if (recv._t === "Subscript" && recv.value._t === "Name" && this.scope.getDd(recv.value.id) === "set" && m === "add" && e.args.length === 1) {
        const d = ident(recv.value.id), k = this.ex(recv.slice), v = this.ex(e.args[0]);
        return [`if !(${k} in ${d}) { ${d}[${k}] = Set() }`, `${d}[${k}]!.add(${v})`];
      }
      if (m === "extend" && (rt.k === "list" || rt.k === "?")) return [`for x__ in ${this.iter(e.args[0])} { ${R()}.push(x__) }`];
      if (m === "sort" && (rt.k === "list" || rt.k === "?")) {
        const key = kw(e, "key"), rev = kw(e, "reverse");
        let v = key ? `${R()}.sortedBy(${this.fnArg(key, this.elemOf(rt))})` : `${R()}.sorted()`;
        if (rev && !(rev._t === "Constant" && rev.value === false)) v += ".reversed()";
        return [`${R()} = ${v}`];
      }
      if (m === "reverse" && (rt.k === "list" || rt.k === "?")) return [`${R()} = ${R()}.reversed()`];
      if (m === "clear" && rt.k !== "value") return [rt.k === "dict" ? `${R()} = {}` : `${R()} = []`];
    }
    if (e._t === "Call" && e.func._t === "Name" && e.func.id === "print") return [this.print(e)];
    return [this.ex(e)];
  }

  print(e: N): string {
    if (e.args.some((a: N) => a._t === "Starred")) no("print(*items) is not translated");
    const parts = e.args.map((a: N) => this.strOf(a));
    const sep = kw(e, "sep"), end = kw(e, "end");
    if (kw(e, "file") || kw(e, "flush")) no("print(file=/flush=) is not translated");
    const sepS = sep ? this.ex(sep) : undefined, endS = end ? this.ex(end) : undefined;
    if (!sepS && !endS) return `print(${parts.join(", ")})`;
    const joined = parts.length === 0 ? `""` : parts.length === 1 ? parts[0] : `[${parts.join(", ")}].join(${sepS ?? `" "`})`;
    if (endS === undefined) return `print(${joined})`;
    return `write(${joined} + ${endS})`;
  }

  assign(s: N): string[] {
    if (s.targets.length > 1) return s.targets.flatMap((t: N) => this.assign({ ...s, targets: [t] }));
    const t = s.targets[0], v = s.value;
    if (t._t === "Name") {
      // defaultdict(int|float|list|set)
      if (this.isDefaultdictCall(v)) {
        const dk = this.ddKindOf(v);
        if (dk) {
          this.scope.ddKinds.set(t.id, dk);
          const h = this.scope.hint(t.id) ?? (dk === "int" ? T("dict", { key: T("str"), val: T("int") }) : dk === "float" ? T("dict", { key: T("str"), val: T("float") }) : undefined);
          const tn = h && this.tyName(h);
          if (h && tn) {
            this.scope.vars.set(t.id, h);
            return [`var ${ident(t.id)}: ${tn} = {}`];
          }
        }
      }
      const vt = this.ty(v);
      const fresh = !this.scope.has(t.id);
      if (fresh || this.scope.get(t.id)!.k === "?") this.scope.vars.set(t.id, vt);
      if (fresh && isEmptyLit(v)) {
        const h = this.scope.hint(t.id), tn = h && this.tyName(h);
        if (h && tn) { this.scope.vars.set(t.id, h); return [`var ${ident(t.id)}: ${tn} = ${v._t === "Call" ? "Set()" : this.ex(v)}`]; }
      }
      const prefix = fresh && needsVarDecl(t.id) ? "var " : "";
      return [`${prefix}${ident(t.id)} = ${this.ex(v)}`];
    }
    if (t._t === "Tuple" || t._t === "List") {
      const names = t.elts;
      if (names.some((n: N) => n._t === "Starred")) no("starred unpacking (a, *rest = ...) is not translated");
      const vt = this.ty(v);
      names.forEach((n: N, i: number) => { if (n._t === "Name" && !this.scope.has(n.id)) this.scope.vars.set(n.id, v._t === "Tuple" ? this.ty(v.elts[i]) : vt.items?.[i] ?? vt.el ?? U); });
      const lhs = names.map((n: N) => this.target(n)).join(", ");
      const rhs = v._t === "Tuple" || v._t === "List" ? v.elts.map((x: N) => this.ex(x)).join(", ") : this.ex(v);
      return [`${lhs} = ${rhs}`];
    }
    return [`${this.target(t)} = ${this.ex(v)}`];
  }

  target(t: N): string {
    if (t._t === "Name") return ident(t.id);
    if (t._t === "Attribute") return `${this.ex(t.value)}.${t.attr}`;
    if (t._t === "Subscript") { if (t.slice._t === "Slice") no("assigning to a slice is not translated"); return `${this.ex(t.value)}[${this.ex(t.slice)}]`; }
    return no(`assigning to ${t._t} is not translated`);
  }

  augAssign(s: N): string[] {
    // defaultdict(int/float): d[k] += v -> d[k] = d.get(k, 0) + v
    if (s.target._t === "Subscript" && s.target.value._t === "Name") {
      const dname = s.target.value.id;
      const dk = this.scope.getDd(dname);
      if (dk === "int" || dk === "float") {
        const def = dk === "int" ? "0" : "0.0";
        const k = this.ex(s.target.slice);
        const r = this.ex(s.value);
        const d = ident(dname);
        const opSym: Record<string, string> = { Add: "+", Sub: "-", Mult: "*", Div: "/" };
        if (opSym[s.op._t]) return [`${d}[${k}] = ${d}.get(${k}, ${def}) ${opSym[s.op._t]} ${r}`];
      }
      // Foreign Value dict/Counter: cnt[k] += 1 -> cnt[k] = (cnt[k].asInt ?? 0) + 1
      if (this.ty(s.target.value).k === "value" && s.op._t === "Add") {
        const lhs = this.target(s.target);
        const rt = this.ty(s.value);
        const r = this.ex(s.value);
        if (rt.k === "int") return [`${lhs} = (${lhs}.asInt ?? 0) + ${r}`];
        if (rt.k === "float") return [`${lhs} = (${lhs}.asFloat ?? 0.0) + ${r}`];
      }
    }
    const tgt = this.target(s.target), op = s.op._t, lt = this.ty(s.target), rt = this.ty(s.value);
    const r = this.ex(s.value);
    switch (op) {
      case "Add": if (lt.k === "list") { this.usesPy = true; return [`${tgt} = py.concat(${tgt}, ${r})`]; } return [`${tgt} += ${r}`];
      case "Sub": return [`${tgt} -= ${r}`];
      case "Mult": if (lt.k === "str") return [`${tgt} = ${tgt}.repeat(${r})`]; return [`${tgt} *= ${r}`];
      case "Div": return [`${tgt} = ${tgt} / ${r}`];
      case "FloorDiv": this.usesPy = true; return [`${tgt} = py.floordiv(${this.num(tgt, lt, rt)}, ${this.num(r, rt, lt)})`];
      case "Mod": this.usesPy = true; return [`${tgt} = py.mod(${this.num(tgt, lt, rt)}, ${this.num(r, rt, lt)})`];
      case "Pow": return [`${tgt} = ${tgt} ** ${r}`];
    }
    return no(`the operator ${op}= is not translated`);
  }

  forStmt(s: N): string[] {
    if (s.orelse.length) {
      const broke = this.tmp("broke");
      const scope = new Scope(this.scope);
      const head = this.forHead(s.target, s.iter, scope, false);
      const saved = this.scope; this.scope = scope;
      const body = this.rewriteBreak(s.body, broke);
      this.scope = saved;
      return [`var ${broke} = false`, `for ${head} {`, ...body, "}", `if !${broke} {`, ...this.block(s.orelse), "}"];
    }
    const scope = new Scope(this.scope);
    const head = this.forHead(s.target, s.iter, scope, false);
    return [`for ${head} {`, ...this.block(s.body, scope), "}"];
  }

  /** `x in xs`, `i, x in xs` (enumerate), `k, v in d` (items), `(a, b) in pairs` */
  forHead(target: N, it: N, scope: Scope, inComp: boolean): string {
    const call = it._t === "Call" && it.func._t === "Name" ? it.func.id : undefined;
    const tup = target._t === "Tuple" || target._t === "List";
    const bind = (n: N, t: Ty) => { if (n._t === "Name") scope.vars.set(n.id, t); };
    if (tup && target.elts.length === 2 && call === "enumerate" && it.args.length === 1 && !kw(it, "start")) {
      const xs = it.args[0], xt = this.ty(xs);
      bind(target.elts[0], T("int"));
      bind(target.elts[1], xs._t === "Name" && this.scope.getFile(xs.id) ? T("str") : this.elemOf(xt));
      const names = target.elts.map((n: N) => this.target(n));
      return inComp ? `(${names.join(", ")}) in ${this.iter(xs)}.enumerate()` : `${names.join(", ")} in ${this.iter(xs)}`;
    }
    if (tup && target.elts.length === 2 && it._t === "Call" && it.func._t === "Attribute" && it.func.attr === "items" && !it.args.length) {
      const dt = this.ty(it.func.value);
      bind(target.elts[0], dt.key ?? U); bind(target.elts[1], dt.val ?? U);
      const names = target.elts.map((n: N) => this.target(n));
      return inComp ? `(${names.join(", ")}) in ${this.ex(it.func.value)}.entries` : `${names.join(", ")} in ${this.ex(it.func.value)}`;
    }
    const itT = this.ty(it);
    const el = it._t === "Name" && this.scope.getFile(it.id) ? T("str") : this.elemOf(itT);
    if (tup) {
      if (target.elts.some((n: N) => n._t !== "Name")) no("nested unpacking in a for loop is not translated");
      target.elts.forEach((n: N, i: number) => bind(n, el.items?.[i] ?? (itT.k === "value" ? T("value") : U)));
      return `(${target.elts.map((n: N) => this.target(n)).join(", ")}) in ${this.iter(it)}`;
    }
    if (target._t !== "Name") no("this for-loop target is not translated");
    bind(target, el);
    return `${ident(target.id)} in ${this.iter(it)}`;
  }

  elemOf(t: Ty): Ty {
    if (t.k === "list" || t.k === "set" || t.k === "gen") return t.el ?? U;
    if (t.k === "range") return T("int");
    if (t.k === "str") return T("char");
    if (t.k === "dict") return t.key ?? U;
    if (t.k === "tuple") return t.items?.[0] ?? U;
    if (t.k === "value") return T("value");
    return U;
  }

  /** something to iterate: a dict iterates its keys, a tuple becomes an array, a file iterates lines */
  iter(e: N): string {
    if (e._t === "Name") {
      const fv = this.scope.getFile(e.id);
      if (fv && fv.mode === "read") { this.usesPy = true; return `py.splitLinesKeep(${fv.bufVar})`; }
      const ec = this.classes.get(e.id);
      if (ec?.enumKind) return `${e.id}.all()`;
    }
    if (e._t === "Tuple") return `[${e.elts.map((x: N) => this.ex(x)).join(", ")}]`;
    const t = this.ty(e);
    if (t.k === "dict") return `${this.ex(e)}.keys`;
    if (t.k === "tuple" && t.items?.length) {
      const v = this.paren(this.ex(e));
      return `[${t.items.map((_, i) => `${v}.${i}`).join(", ")}]`;
    }
    return this.ex(e);
  }

  fnDef(s: N): string[] {
    if (s.decorator_list.length && !(this.cls && s.decorator_list.every((d: N) => d._t === "Name" && d.id === "staticmethod"))) no("decorators are not translated");
    const a = s.args;
    if (a.kwarg) no("**kwargs is not translated");
    const isGen = hasYield(s.body);
    const scope = new Scope(this.scope, true);
    const params: string[] = [];
    const all = [...a.posonlyargs, ...a.args];
    const isMethod = !!this.cls && !s.decorator_list.length;
    const plist = isMethod ? all.slice(1) : all;
    const nd = a.defaults.length, first = all.length - nd;
    const initTypes = this.cls && s.name === "__init__" ? this.cls.initTypes : undefined;
    const localFnInfo = !this.cls ? this.scope.getFn(s.name) : undefined;
    plist.forEach((p: N) => {
      const i = all.indexOf(p);
      let t = this.annot(p.annotation);
      if (t.k === "?" && initTypes?.get(p.arg)) t = initTypes.get(p.arg)!;
      if (t.k === "?" && isMethod) { const pt = this.cls!.paramTypes.get(s.name)?.[plist.indexOf(p)]; if (pt && pt.k !== "?") t = pt; }
      const def = i >= first ? a.defaults[i - first] : undefined;
      if (t.k === "?" && !this.cls && !def) {
        const ct = localFnInfo?.callTypes?.[plist.indexOf(p)] ?? this.fns.get(s.name)?.callTypes?.[plist.indexOf(p)];
        if (ct && ct.k !== "?") t = ct;
      }
      if (t.k === "?" && def) t = this.ty(def);
      scope.vars.set(p.arg, t);
      const tn = this.tyName(t);
      params.push(`${ident(p.arg)}${tn ? `: ${tn}` : ""}${def ? ` = ${this.ex(def)}` : ""}`);
    });
    a.kwonlyargs.forEach((p: N, i: number) => {
      const t = this.annot(p.annotation), def = a.kw_defaults[i];
      scope.vars.set(p.arg, t);
      const tn = this.tyName(t.k === "?" && def ? this.ty(def) : t);
      params.push(`${ident(p.arg)}${tn ? `: ${tn}` : ""}${def ? ` = ${this.ex(def)}` : ""}`);
    });
    if (a.vararg) { const t = this.annot(a.vararg.annotation); scope.vars.set(a.vararg.arg, T("list", { el: t })); const tn = this.tyName(t); params.push(`...${ident(a.vararg.arg)}${tn ? `: ${tn}` : ""}`); }
    if (isMethod) scope.vars.set(all[0]?.arg ?? "self", T("obj", { cls: this.cls!.name }));
    this.hintLocals(s.body, scope);
    this.registerLocalFns(s.body, scope);

    const ret = this.annot(s.returns);
    let rn = s.returns && !(s.returns._t === "Constant" && s.returns.value === null) ? this.tyName(ret) : undefined;
    let genRetTy: Ty | undefined;
    if (isGen) {
      const saved = this.scope; this.scope = scope;
      const ys: Ty[] = [];
      walk(s.body, (n) => {
        if (n._t === "Yield" && n.value) ys.push(this.ty(n.value));
        if (n._t === "YieldFrom" && n.value) ys.push(this.elemOf(this.ty(n.value)));
      }, true);
      this.scope = saved;
      const valid = ys.filter((t) => t.k !== "?");
      const el = valid[0] ?? U;
      const elName = this.tyName(el) ?? "Any";
      rn = `Gen<${elName}>`;
      genRetTy = T("gen", { el });
    } else if (!rn) {
      const saved = this.scope; this.scope = scope;
      const rets: Ty[] = [];
      walk(s.body, (n) => { if (n._t === "Return") rets.push(n.value ? this.ty(n.value) : T("none")); }, true);
      this.scope = saved;
      const vals = rets.filter((t) => t.k !== "none"), kinds = new Set(vals.map((t) => t.k));
      if (rets.some((t) => t.k === "none") && vals.length && kinds.size === 1 && !kinds.has("?")) {
        const tn = this.tyName(vals[0]);
        if (tn) rn = `${tn}?`;
      }
    }

    const assigned = new Set<string>();
    walk(s.body, (n) => { if (n._t === "Name" && n.ctx?._t === "Store") assigned.add(n.id); if (n._t === "AugAssign" && n.target._t === "Name") assigned.add(n.target.id); }, true);
    const copies = plist.filter((p: N) => assigned.has(p.arg)).map((p: N) => `  var ${ident(p.arg)} = ${ident(p.arg)}`);
    let name = s.name;
    if (isMethod) {
      if (name === "__init__") return [`init(${params.join(", ")}) {`, ...copies, ...this.block(s.body, scope), "}"];
      if (name === "__str__" || name === "__repr__") { if (this.cls!.fields.has("__str_done")) return []; this.cls!.fields.set("__str_done", U); return [`fn toString() -> String {`, ...this.block(s.body, scope), "}"]; }
      if (name.startsWith("__") && name.endsWith("__")) no(`the special method ${name} is not translated`);
    } else if (name === "main" && this.renamedMain) name = "main_";
    const stat = this.cls && s.decorator_list.length ? "static " : "";
    const over = isMethod && this.baseHas(this.cls!, s.name) ? "override " : "";
    const bodyLines = this.block(s.body, scope);

    if (!this.cls) {
      const targetInfo = localFnInfo ?? this.fns.get(s.name);
      if (isGen && genRetTy && targetInfo) targetInfo.ret = genRetTy;
      else if (targetInfo && targetInfo.ret.k === "?") {
        const saved = this.scope; this.scope = scope;
        const rets: Ty[] = [];
        walk(s.body, (n) => { if (n._t === "Return") rets.push(n.value ? this.ty(n.value) : T("none")); }, true);
        this.scope = saved;
        const vals = rets.filter((t) => t.k !== "none" && t.k !== "?");
        if (vals.length) {
          const base = vals[0];
          targetInfo.ret = rets.some((t) => t.k === "none") ? { ...base, opt: true } : base;
        }
      }
    }
    const kwPrefix = isGen ? "gen fn" : "fn";
    return [`${stat}${over}${kwPrefix} ${ident(name)}(${params.join(", ")})${rn ? ` -> ${rn}` : ""} {`, ...copies, ...bodyLines, "}", ""];
  }

  classDef(s: N): string[] {
    const info = this.classes.get(s.name)!;
    if (s.bases.length > 1) no("multiple inheritance is not translated");
    if (info.enumKind) return this.enumClassDef(s, info);
    if (info.isDataclass) return this.dataclassDef(s, info);
    if (s.decorator_list.length) no("class decorators (e.g. @decorator) are not translated");
    const base = info.base ? (EXC[info.base] ?? (PANIC_EXC.has(info.base) ? "Error" : info.base)) : undefined;
    if (base?.startsWith("py.")) this.usesPy = true;
    const out = [`class ${s.name}${base ? `: ${base}` : ""} {`];
    const saved = this.cls; this.cls = info;
    const own = [...info.fields].filter(([f]) => !f.startsWith("__") && !this.inheritedField(info, f));
    for (const [f, t] of own) out.push(`  var ${f}: ${this.tyName(t) ?? "Any"}`);
    for (const b of s.body) {
      if (b._t === "FunctionDef") out.push(...this.stmt(b).map((l) => (l ? "  " + l : l)));
      else if (b._t === "Pass" || (b._t === "Expr" && b.value._t === "Constant")) continue;
      else out.push(...this.todo(b, "class-level statements (class attributes) are not translated").map((l) => "  " + l));
    }
    this.cls = saved;
    while (out[out.length - 1] === "") out.pop();
    out.push("}", "");
    return out.length === 3 ? [`class ${s.name}${base ? `: ${base}` : ""} {}`, ""] : out;
  }

  private dataclassDef(s: N, info: ClassInfo): string[] {
    const fields = info.dcFields ?? [];
    const declKw = info.frozen ? "let" : "var";
    const out = [`class ${s.name} {`];
    const saved = this.cls; this.cls = info;
    for (const f of fields) out.push(`  ${declKw} ${ident(f.name)}: ${this.tyName(f.ty) ?? "Any"}`);
    if (fields.length) {
      const initParams = fields.map((f) => `${ident(f.name)}: ${this.tyName(f.ty) ?? "Any"}${f.def ? ` = ${this.ex(f.def)}` : ""}`).join(", ");
      out.push(`  init(${initParams}) {`);
      for (const f of fields) out.push(`    self.${ident(f.name)} = ${ident(f.name)}`);
      out.push("  }");
      const eqExpr = fields.map((f) => `self.${ident(f.name)} == other.${ident(f.name)}`).join(" && ");
      out.push(`  operator ==(other: ${s.name}) -> Bool => ${eqExpr}`);
      const strParts = fields.map((f) => `${f.name}={self.${ident(f.name)}}`).join(", ");
      out.push(`  fn toString() -> String => f"${s.name}(${strParts})"`);
    }
    for (const b of s.body) {
      if (b._t === "AnnAssign" || b._t === "Pass" || (b._t === "Expr" && b.value._t === "Constant")) continue;
      if (b._t === "FunctionDef") out.push(...this.stmt(b).map((l) => (l ? "  " + l : l)));
      else out.push(...this.todo(b, "unsupported statement in dataclass").map((l) => "  " + l));
    }
    this.cls = saved;
    while (out[out.length - 1] === "") out.pop();
    out.push("}", "");
    return out;
  }

  private enumClassDef(s: N, info: ClassInfo): string[] {
    const members = info.enumMembers ?? [];
    const vtn = this.tyName(info.enumValTy ?? T("int")) ?? "Int";
    const out = [`class ${s.name} {`];
    out.push(`  let name: String`);
    out.push(`  let value: ${vtn}`);
    out.push(`  init(name: String, value: ${vtn}) {`);
    out.push(`    self.name = name`);
    out.push(`    self.value = value`);
    out.push(`  }`);
    for (const m of members) {
      out.push(`  static let ${m.name} = ${s.name}(name: ${strLit(m.name)}, value: ${this.ex(m.value)})`);
    }
    out.push(`  static fn all() -> [${s.name}] => [${members.map((m) => `${s.name}.${m.name}`).join(", ")}]`);
    out.push(`  operator ==(other: ${s.name}) -> Bool => self.name == other.name && self.value == other.value`);
    if (info.enumKind === "StrEnum") {
      out.push(`  fn toString() -> String => self.value`);
    } else {
      out.push(`  fn toString() -> String => f"${s.name}.{self.name}"`);
    }
    for (const b of s.body) {
      if (b._t === "Assign" || b._t === "Pass" || (b._t === "Expr" && b.value._t === "Constant")) continue;
      if (b._t === "FunctionDef") out.push(...this.stmt(b).map((l) => (l ? "  " + l : l)));
      else out.push(...this.todo(b, "unsupported statement in Enum").map((l) => "  " + l));
    }
    out.push("}", "");
    return out;
  }

  baseHas(c: ClassInfo, m: string): boolean { let b = c.base && this.classes.get(c.base); while (b) { if (b.methods.has(m)) return true; b = b.base ? this.classes.get(b.base) : undefined; } return false; }
  inheritedField(c: ClassInfo, f: string): boolean { let b = c.base && this.classes.get(c.base); while (b) { if (b.fields.has(f)) return true; b = b.base ? this.classes.get(b.base) : undefined; } return false; }

  private addForeignLine(pkg: string, line: string) {
    this.foreignPkgs.add(pkg);
    if (!this.foreignLines.includes(line)) this.foreignLines.push(line);
  }

  importOne(name: string, asname: string | undefined, s: N): string[] {
    if (name === "math" && !asname) { this.usesMath = true; return []; }
    if (name === "sys" && !asname) { this.usesEnv = true; return []; }
    if (name === "re" && !asname) { return []; } // resolved lazily to .extract / re / foreign --python
    if (["typing", "dataclasses", "__future__", "enum"].includes(name)) return [];
    const line = `import ${name}${asname ? ` as ${asname}` : ""} --python`;
    this.addForeignLine(name.split(".")[0], line);
    const localName = asname ?? name.split(".").pop()!;
    this.foreignMods.set(localName, name);
    this.scope.vars.set(localName, T("value"));
    return [];
  }

  importFrom(s: N): string[] {
    if (["typing", "__future__", "dataclasses", "enum"].includes(s.module)) return [];
    if (s.level) no("relative imports are not translated");
    if (s.module === "math") {
      this.usesMath = true;
      for (const a of s.names) this.scope.vars.set(a.asname ?? a.name, T("fn", { cls: "math." + a.name }));
      return [];
    }
    if (s.module === "operator") {
      const rem: N[] = [];
      for (const a of s.names) {
        if (a.name === "itemgetter" || a.name === "attrgetter") {
          this.usesOp.add(a.asname ?? a.name);
          this.scope.vars.set(a.asname ?? a.name, T("fn", { cls: "operator." + a.name }));
        } else rem.push(a);
      }
      if (!rem.length) return [];
      s = { ...s, names: rem };
    }
    if (s.module === "collections") {
      // keep defaultdict native when possible; Counter / deque go through Python bridge
      const needForeign = s.names.filter((a: N) => a.name !== "defaultdict");
      for (const a of s.names) {
        if (a.name === "defaultdict") this.usesCollections.add(a.asname ?? "defaultdict");
      }
      if (!needForeign.length) return [];
      s = { ...s, names: needForeign };
    }
    const names = s.names.map((a: N) => (a.name === "*" ? no("`from x import *` is not translated") : `${a.name}${a.asname ? ` as ${a.asname}` : ""}`));
    for (const a of s.names) {
      const local = a.asname ?? a.name;
      this.foreignValues.add(local);
      this.scope.vars.set(local, T("value"));
    }
    this.addForeignLine(s.module.split(".")[0], `from ${s.module} import ${names.join(", ")} --python`);
    return [];
  }

  tryStmt(s: N): string[] {
    const bodyLines = this.block(s.body);
    const notes: string[] = [];
    const hasElse = s.orelse.length > 0;
    const okVar = hasElse ? this.tmp("try_ok") : undefined;
    const inner: string[] = ["try {", ...bodyLines, ...(okVar ? [`  ${okVar} = true`] : []), "}"];
    let catchCount = 0;
    for (const h of s.handlers) {
      const types: N[] = !h.type ? [] : h.type._t === "Tuple" ? h.type.elts : [h.type];
      const scope = new Scope(this.scope);
      if (h.name) scope.vars.set(h.name, T("exc"));
      const v = h.name ? ident(h.name) : "e";
      const mapped = types.map((t: N) => {
        if (t._t !== "Name") no("this except clause is not translated");
        if (PANIC_EXC.has(t.id)) { notes.push(`# note: Python's ${t.id} is a panic in Mycel (it stops the program and cannot be caught)`); return undefined; }
        if (t.id in EXC) { const m = EXC[t.id]; if (m.startsWith("py.")) this.usesPy = true; return m === "Error" ? "" : m; }
        if (this.classes.has(t.id)) return t.id;
        return no(`except ${t.id} is not translated`);
      });
      const body = this.block(h.body, scope);
      const kinds = types.length ? mapped.filter((x) => x !== undefined) as string[] : [""];
      if (!kinds.length) continue;
      for (const k of [...new Set(kinds)]) {
        catchCount++;
        inner[inner.length - 1] = `} catch ${v}${k ? `: ${k}` : ""} {`;
        inner.push(...body, "}");
      }
    }
    if (catchCount === 0) {
      const plain = bodyLines.map((l) => l.replace(/^  /, ""));
      if (hasElse) plain.push(...this.block(s.orelse).map((l) => l.replace(/^  /, "")));
      if (!s.finalbody.length) return [...notes, ...plain];
      return [...notes, "try {", ...plain.map((l) => "  " + l), "} finally {", ...this.block(s.finalbody), "}"];
    }
    if (hasElse && okVar) {
      const pre = [`var ${okVar} = false`, ...inner, `if ${okVar} {`, ...this.block(s.orelse), "}"];
      if (!s.finalbody.length) return [...notes, ...pre];
      return [...notes, "try {", ...pre.map((l) => "  " + l), "} finally {", ...this.block(s.finalbody), "}"];
    }
    if (s.finalbody.length) { inner[inner.length - 1] = "} finally {"; inner.push(...this.block(s.finalbody), "}"); }
    return [...notes, ...inner];
  }

  excExpr(e: N): string {
    const name = e._t === "Call" && e.func._t === "Name" ? e.func.id : e._t === "Name" ? e.id : undefined;
    if (!name) return no("this raise is not translated");
    const arg = e._t === "Call" && e.args[0] ? this.strOf(e.args[0]) : `""`;
    if (this.classes.has(name)) return `${name}(${arg})`;
    if (name in EXC) { const m = EXC[name]; if (m.startsWith("py.")) this.usesPy = true; return `${m}(${arg})`; }
    if (PANIC_EXC.has(name)) return `Error(${arg})`;
    return no(`raise ${name} is not translated`);
  }

  // ------------------------------------------------------------------ expressions
  /** a value as a String, the way Python's str() shows it */
  strOf(e: N): string {
    const t = this.ty(e);
    if (scalar(t)) return this.ex(e);
    if (t.k === "exc") return `${this.ex(e)}.message`;
    if (t.k === "obj" && t.cls && this.classes.get(t.cls)?.enumKind === "StrEnum") return `${this.ex(e)}.value`;
    this.usesPy = true;
    return `py.str(${this.ex(e)})`;
  }

  /** a condition: Python's truthiness made explicit */
  cond(e: N): string {
    const t = this.ty(e);
    if (e._t === "UnaryOp" && e.op._t === "Not") return `!${this.paren(this.cond(e.operand))}`;
    if (e._t === "BoolOp") return e.values.map((v: N) => this.paren(this.cond(v))).join(e.op._t === "And" ? " && " : " || ");
    if (t.k === "obj" && t.cls === "__re_Match__") return `${this.paren(this.ex(e))} != nil`;
    switch (t.k) {
      case "bool": return this.ex(e);
      case "int": return `${this.paren(this.ex(e))} != 0`;
      case "float": return `${this.paren(this.ex(e))} != 0.0`;
      case "str": case "list": case "dict": case "set": return t.opt ? `${this.paren(this.ex(e))} != nil` : `!${this.paren(this.ex(e))}.isEmpty`;
      case "none": return "false";
      case "obj": return "true";
    }
    this.usesPy = true;
    return `py.truthy(${this.ex(e)})`;
  }

  paren(s: string): string { return atomic(s) ? s : `(${s})`; }
  num(s: string, t: Ty, other: Ty): string { return t.k === "int" && other.k === "float" ? `${this.paren(s)}.toFloat()` : s; }

  fnArg(e: N, el: Ty = U): string {
    if (e._t === "Lambda") { this.lambdaParam = el; try { return this.ex(e); } finally { this.lambdaParam = U; } }
    if (e._t === "Name" && e.id === "len") return "len";
    if (e._t === "Name" && e.id === "str") { this.usesPy = true; return "x__ => py.str(x__)"; }
    if (e._t === "Name" && e.id === "abs") return "x__ => x__.abs";
    if (e._t === "Attribute" && e.attr === "get") return `k__ => ${this.ex(e.value)}[k__]!`;
    if (e._t === "Attribute" && (e.attr === "lower" || e.attr === "upper") && e.value._t === "Name" && e.value.id === "str") return `s__ => s__.${e.attr}()`;
    if (e._t === "Call" && e.func._t === "Name" && this.usesOp.has(e.func.id)) {
      const cls = this.scope.get(e.func.id)?.cls;
      if (cls === "operator.itemgetter" && e.args.length >= 1) {
        const idx = (a: N) => a._t === "Constant" && a.value?.$i !== undefined ? (el.k === "tuple" || el.k === "?" ? `.${a.value.$i}` : `[${a.value.$i}]`) : `[${this.ex(a)}]`;
        if (e.args.length === 1) return `x__ => x__${idx(e.args[0])}`;
        return `x__ => (${e.args.map((a: N) => `x__${idx(a)}`).join(", ")})`;
      }
      if (cls === "operator.attrgetter" && e.args.length >= 1 && e.args.every((a: N) => a._t === "Constant" && typeof a.value === "string")) {
        if (e.args.length === 1) return `x__ => x__.${e.args[0].value}`;
        return `x__ => (${e.args.map((a: N) => `x__.${a.value}`).join(", ")})`;
      }
    }
    if (e._t === "Name") return ident(e.id);
    return no("this key/function argument is not translated");
  }

  private foreignArgExpr(a: N): string {
    if (a._t === "Name" && PY_BUILTIN_VALUES.has(a.id) && !this.scope.has(a.id)) {
      this.usesBuiltins = true;
      return `pyb__.module().attr(${strLit(a.id)})`;
    }
    return this.ex(a);
  }

  private foreignCallExpr(callee: string, args: N[], keywords: N[]): string {
    if (args.some((a: N) => a._t === "Starred")) no("f(*args) is not translated");
    const argEl = args.length >= 1 ? this.elemOf(this.ty(args[0])) : U;
    const evalArg = (a: N) => {
      if (a._t === "Lambda") { this.lambdaParam = argEl; try { return this.ex(a); } finally { this.lambdaParam = U; } }
      return this.foreignArgExpr(a);
    };
    const hasKwCollision = keywords.some((k: N) => !k.arg || MYCEL_KW.has(k.arg));
    if (hasKwCollision && callee.includes(".")) {
      const lastDot = callee.lastIndexOf(".");
      const recv = callee.slice(0, lastDot);
      const meth = callee.slice(lastDot + 1);
      const pos = args.map(evalArg).join(", ");
      const kwEntries = keywords.map((k: N) => (k.arg ? `${strLit(k.arg)}: ${evalArg(k.value)}` : no("f(**kwargs) is not translated"))).join(", ");
      const target = this.foreignMods.has(recv) ? `${recv}.module()` : recv;
      return `${target}.callKw(${strLit(meth)}, [${pos}], {${kwEntries}})`;
    }
    const all = [
      ...args.map(evalArg),
      ...keywords.map((k: N) => (k.arg ? `${ident(k.arg)}: ${evalArg(k.value)}` : no("f(**kwargs) is not translated"))),
    ];
    return `${callee}(${all.join(", ")})`;
  }

  ex(e: N, want?: Ty): string {
    switch (e._t) {
      case "Constant": return this.constant(e.value);
      case "Name": {
        if (e.id === "self") return "self";
        const t = this.scope.get(e.id);
        if (t?.k === "fn" && t.cls?.startsWith("math.")) return no(`math.${t.cls.slice(5)} used as a value is not translated`);
        if (e.id === "main" && this.renamedMain) return "main_";
        return ident(e.id);
      }
      case "JoinedStr": return this.fstring(e);
      case "List": {
        if (e.elts.some((x: N) => x._t === "Starred")) {
          this.usesPy = true;
          const parts: string[] = [];
          let cur: string[] = [];
          const flush = () => { if (cur.length) { parts.push(`[${cur.join(", ")}]`); cur = []; } };
          for (const x of e.elts) {
            if (x._t === "Starred") { flush(); parts.push(this.ex(x.value)); }
            else cur.push(this.ex(x));
          }
          flush();
          return parts.reduce((acc, p) => (acc ? `py.concat(${acc}, ${p})` : p), "");
        }
        if (e.elts.length > 1) {
          const ts = e.elts.map((x: N) => this.ty(x));
          const ks = new Set(ts.filter((t: Ty) => t.k !== "?").map((t: Ty) => t.k));
          if (ks.size > 1) {
            if (ks.size === 2 && ks.has("int") && ks.has("float")) {
              return `[${e.elts.map((x: N, i: number) => (ts[i].k === "int" ? `${this.paren(this.ex(x))}.toFloat()` : this.ex(x))).join(", ")}]`;
            }
            return `[${e.elts.map((x: N) => `${this.paren(this.ex(x))} as Any`).join(", ")}]`;
          }
        }
        return `[${e.elts.map((x: N) => this.ex(x)).join(", ")}]`;
      }
      case "Tuple": return e.elts.length === 1 ? no("a one-element tuple is not translated") : `(${e.elts.map((x: N) => this.ex(x)).join(", ")})`;
      case "Set": return `Set([${e.elts.map((x: N) => this.ex(x)).join(", ")}])`;
      case "Dict": {
        if (e.keys.some((k: N) => k === null)) no("{**d} is not translated");
        if (!e.keys.length) { const tn = want && this.tyName(want); return tn && want!.k === "dict" ? `{}` : "{}"; }
        const vs = e.values.map((v: N) => this.ty(v));
        const vks = new Set(vs.filter((t: Ty) => t.k !== "?").map((t: Ty) => t.k));
        const mixV = vks.size > 1;
        return `{${e.keys.map((k: N, i: number) => `${this.ex(k)}: ${mixV ? `${this.paren(this.ex(e.values[i]))} as Any` : this.ex(e.values[i])}`).join(", ")}}`;
      }
      case "BinOp": return this.binop(e);
      case "UnaryOp": {
        if (e.op._t === "Not") return `!${this.paren(this.cond(e.operand))}`;
        if (e.op._t === "USub") return `-${this.paren(this.ex(e.operand))}`;
        if (e.op._t === "UAdd") return this.ex(e.operand);
        return no("~x is not translated");
      }
      case "BoolOp": {
        const ts = e.values.map((v: N) => this.ty(v));
        if (ts.every((t: Ty) => t.k === "bool")) return e.values.map((v: N) => this.paren(this.ex(v))).join(e.op._t === "And" ? " && " : " || ");
        if (e.values.length === 2 && e.values[0]._t === "Name") {
          const a = this.ex(e.values[0]), b = this.ex(e.values[1]), c = this.cond(e.values[0]);
          return e.op._t === "Or" ? `if ${c} { ${a} } else { ${b} }` : `if ${c} { ${b} } else { ${a} }`;
        }
        return e.values.map((v: N) => this.paren(this.cond(v))).join(e.op._t === "And" ? " && " : " || ");
      }
      case "Compare": return this.compare(e);
      case "IfExp": return `if ${this.cond(e.test)} { ${this.ex(e.body)} } else { ${this.ex(e.orelse)} }`;
      case "Lambda": {
        const ps = e.args.args.map((a: N) => ident(a.arg));
        const scope = new Scope(this.scope);
        for (const a of e.args.args) scope.vars.set(a.arg, e.args.args.length === 1 ? this.lambdaParam : U);
        this.lambdaParam = U;
        const saved = this.scope; this.scope = scope;
        const body = this.ex(e.body);
        this.scope = saved;
        return `${ps.length === 1 ? ps[0] : `(${ps.join(", ")})`} => ${body}`;
      }
      case "Call": return this.call(e);
      case "Attribute": {
        if (e.value._t === "Name" && e.value.id === "math" && this.usesMath) { if (e.attr === "pi") return "math.PI"; if (e.attr === "e") return "math.E"; if (e.attr === "inf") return "Float.infinity"; if (e.attr === "nan") return "Float.nan"; }
        if (e.value._t === "Name" && e.value.id === "sys" && this.usesEnv) return no(`sys.${e.attr} is not translated (sys.argv[1:] is env.args())`);
        if (e.value._t === "Name" && this.foreignMods.has(e.value.id)) return `${e.value.id}.module().attr(${strLit(e.attr)})`;
        return `${this.ex(e.value)}.${e.attr}`;
      }
      case "Subscript": return this.subscript(e);
      case "ListComp": return this.listComp(e);
      case "GeneratorExp": return this.comp(e, (elt) => `[${elt} ${this.gens(e.generators)}]`);
      case "SetComp": return this.comp(e, (elt) => `Set([${elt} ${this.gens(e.generators)}])`);
      case "DictComp": {
        const saved = this.scope; this.scope = new Scope(this.scope);
        const gens = this.gens(e.generators);
        const s = `{${this.ex(e.key)}: ${this.ex(e.value)} ${gens}}`;
        this.scope = saved; return s;
      }
      case "Starred": return no("*args in a call is not translated");
      case "NamedExpr": return no("the walrus operator := is not translated");
      case "Await": return `await ${this.ex(e.value)}`;
      case "Yield": return e.value ? `yield ${this.ex(e.value)}` : "yield nil";
      case "YieldFrom": return `yield* ${this.ex(e.value)}`;
    }
    return no(`${e._t} is not translated`);
  }

  /** Detect `[int(x) for x in re.findall(r'\d+', text)]` -> `text.extract(Int)` */
  private listComp(e: N): string {
    if (e.generators.length === 1 && !e.generators[0].ifs.length && e.generators[0].target._t === "Name" && e.elt._t === "Call" && e.elt.func._t === "Name" && e.elt.func.id === "int" && e.elt.args.length === 1 && e.elt.args[0]._t === "Name" && e.elt.args[0].id === e.generators[0].target.id) {
      const it = e.generators[0].iter;
      if (it._t === "Call" && it.func._t === "Attribute" && it.func.value._t === "Name" && it.func.value.id === "re" && it.func.attr === "findall" && it.args.length === 2) {
        const pat = it.args[0];
        if (pat._t === "Constant" && typeof pat.value === "string" && ["\\d+", "[0-9]+", "-?\\d+"].includes(pat.value)) {
          return `${this.paren(this.ex(it.args[1]))}.extract(Int)`;
        }
      }
    }
    return this.comp(e, (elt) => `[${elt} ${this.gens(e.generators)}]`);
  }

  comp(e: N, f: (elt: string) => string): string {
    const saved = this.scope; this.scope = new Scope(this.scope);
    try {
      const gensFirst = this.gens(e.generators);
      void gensFirst;
      return f(this.ex(e.elt));
    } finally { this.scope = saved; }
  }

  gens(gs: N[]): string {
    return gs.map((g: N) => {
      if (g.is_async) no("async comprehensions are not translated");
      return `for ${this.forHead(g.target, g.iter, this.scope, true)}${g.ifs.map((c: N) => ` if ${this.cond(c)}`).join("")}`;
    }).join(" ");
  }

  constant(v: any): string {
    if (v === null) return "nil";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "string") return strLit(v);
    if (v.$i !== undefined) { const b = BigInt(v.$i); if (b > 0x7fffffffffffffffn) no("an integer above 2^63 does not fit in Mycel's Int"); return v.$i; }
    if (v.$f !== undefined) { const s: string = v.$f; if (s === "inf") return "Float.infinity"; if (s === "nan") return "Float.nan"; return /[.e]/.test(s) ? s.replace(/^(\d+)e/, "$1.0e") : s + ".0"; }
    return no(`the constant ${v.$x} is not translated`);
  }

  fstring(e: N): string {
    let o = "";
    for (const v of e.values) {
      if (v._t === "Constant") { o += strLit(v.value).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}"); continue; }
      const spec = v.format_spec ? v.format_spec.values.map((p: N) => (p._t === "Constant" ? p.value : no("a computed format spec is not translated"))).join("") : "";
      let inner: string;
      if (v.conversion === 114) { this.usesPy = true; inner = `py.repr(${this.ex(v.value)})`; }
      else inner = spec ? this.ex(v.value) : this.strOf(v.value);
      o += `{${inner}${spec ? ":" + spec : ""}}`;
    }
    return `f"${o}"`;
  }

  binop(e: N): string {
    const lt = this.ty(e.left), rt = this.ty(e.right);
    if (lt.k === "obj" && lt.cls && this.classes.get(lt.cls)?.enumKind === "IntEnum" && rt.k === "obj" && rt.cls && this.classes.get(rt.cls)?.enumKind === "IntEnum") {
      const l = `${this.paren(this.ex(e.left))}.value`, r = `${this.paren(this.ex(e.right))}.value`;
      if (e.op._t === "Add") return `${l} + ${r}`;
      if (e.op._t === "Sub") return `${l} - ${r}`;
    }
    if (lt.k === "obj" && lt.cls && this.classes.get(lt.cls)?.enumKind === "IntEnum" && rt.k === "int") {
      const l = `${this.paren(this.ex(e.left))}.value`, r = this.paren(this.ex(e.right));
      if (e.op._t === "Add") return `${l} + ${r}`;
      if (e.op._t === "Sub") return `${l} - ${r}`;
    }
    const l = this.paren(this.ex(e.left)), r = this.paren(this.ex(e.right));
    switch (e.op._t) {
      case "Add": if (lt.k === "list" || rt.k === "list") { this.usesPy = true; return `py.concat(${this.ex(e.left)}, ${this.ex(e.right)})`; } return `${l} + ${r}`;
      case "Sub": return `${l} - ${r}`;
      case "Mult":
        if (lt.k === "str" && rt.k === "int") return `${l}.repeat(${this.ex(e.right)})`;
        if (lt.k === "int" && rt.k === "str") return `${r}.repeat(${this.ex(e.left)})`;
        if (lt.k === "list" || rt.k === "list") { this.usesPy = true; return lt.k === "list" ? `py.repeat(${this.ex(e.left)}, ${this.ex(e.right)})` : `py.repeat(${this.ex(e.right)}, ${this.ex(e.left)})`; }
        return `${l} * ${r}`;
      case "Div": return `${l} / ${r}`;
      case "FloorDiv": this.usesPy = true; return `py.floordiv(${this.num(this.ex(e.left), lt, rt)}, ${this.num(this.ex(e.right), rt, lt)})`;
      case "Mod":
        if (lt.k === "str") return no("%-formatting of strings is not translated (use an f-string)");
        this.usesPy = true; return `py.mod(${this.num(this.ex(e.left), lt, rt)}, ${this.num(this.ex(e.right), rt, lt)})`;
      case "Pow":
        if (lt.k === "value" || rt.k === "value") { this.usesPy = true; return `py.pow(${this.ex(e.left)}, ${this.ex(e.right)})`; }
        return `${l} ** ${r}`;
      case "BitAnd": return `${l} & ${r}`;
      case "BitOr": return `${l} | ${r}`;
      case "BitXor":
        if (lt.k === "set" || rt.k === "set") return `((${l} - ${r}) | (${r} - ${l}))`;
        return `${l} ^ ${r}`;
      case "LShift": return `${l} << ${r}`;
      case "RShift": return `${l} >> ${r}`;
    }
    return no(`the operator ${e.op._t} is not translated`);
  }

  compare(e: N): string {
    const parts: string[] = [];
    let left = e.left;
    e.ops.forEach((op: N, i: number) => {
      const right = e.comparators[i];
      const charLit2 = (x: N, other: N) => (x._t === "Constant" && typeof x.value === "string" && [...x.value].length === 1 && this.ty(other).k === "char" && (op._t === "Eq" || op._t === "NotEq") ? charLit(x.value) : undefined);
      const lt2 = this.ty(left), rt2 = this.ty(right);
      const side = (x: N, t: Ty, o: Ty) => {
        if (t.k === "obj" && t.cls && this.classes.get(t.cls)?.enumKind === "IntEnum" && o.k === "int") return `${this.paren(this.ex(x))}.value`;
        if (t.k === "char" && o.k === "str" && (op._t === "Eq" || op._t === "NotEq")) return `${this.paren(this.ex(x))}.toString()`;
        return this.paren(this.ex(x));
      };
      const a = charLit2(left, right) ?? side(left, lt2, rt2);
      const b = (op._t === "In" || op._t === "NotIn") && right._t === "Tuple"
        ? `[${right.elts.map((x: N) => this.ex(x)).join(", ")}]`
        : (charLit2(right, left) ?? side(right, rt2, lt2));
      const m: Record<string, string> = { Eq: "==", NotEq: "!=", Lt: "<", LtE: "<=", Gt: ">", GtE: ">=", Is: "==", IsNot: "!=", In: "in", NotIn: "not in" };
      if ((op._t === "Is" || op._t === "IsNot") && !(right._t === "Constant" && right.value === null)) no("`is` between objects is not translated");
      parts.push(`${a} ${m[op._t]} ${b}`);
      left = right;
    });
    return parts.join(" && ");
  }

  subscript(e: N): string {
    const sl = e.slice;
    if (e.value._t === "Attribute" && e.value.value._t === "Name" && e.value.value.id === "sys" && e.value.attr === "argv" && this.usesEnv) {
      if (sl._t === "Slice" && sl.lower?._t === "Constant" && sl.lower.value?.$i === "1" && !sl.upper && !sl.step) return "env.args()";
      if (sl._t === "Constant" && sl.value?.$i !== undefined && sl.value.$i !== "0") return `env.args()[${Number(sl.value.$i) - 1}]`;
      return no("sys.argv: only sys.argv[1:] and sys.argv[n] are translated (Mycel's env.args() leaves out the program name)");
    }
    if (e.value._t === "Name") {
      const dk = this.scope.getDd(e.value.id);
      if (dk === "int") return `${ident(e.value.id)}.get(${this.ex(sl)}, 0)`;
      if (dk === "float") return `${ident(e.value.id)}.get(${this.ex(sl)}, 0.0)`;
      if (dk === "list") return `(${ident(e.value.id)}[${this.ex(sl)}] ?? [])`;
      if (dk === "set") return `(${ident(e.value.id)}[${this.ex(sl)}] ?? Set())`;
    }
    const vt = this.ty(e.value), v = this.paren(this.ex(e.value));
    if (sl._t === "Slice") {
      const lo = sl.lower ? this.ex(sl.lower) : "", hi = sl.upper ? this.ex(sl.upper) : "";
      if (sl.step) {
        const st = sl.step;
        if (st._t === "UnaryOp" && st.op._t === "USub" && st.operand._t === "Constant" && st.operand.value?.$i === "1" && !sl.lower && !sl.upper) return `${v}.reversed()`;
        return no("a slice with a step is not translated");
      }
      this.usesPy = true;
      return `py.slice(${this.ex(e.value)}, ${lo || "nil"}, ${hi || "nil"})`;
    }
    if (sl._t === "Tuple") return no("x[a, b] is not translated");
    if (vt.k === "dict") return `${v}[${this.keyOf(sl, vt)}]!`;
    if (vt.k === "tuple" && sl._t === "Constant" && sl.value?.$i !== undefined) return `${v}.${sl.value.$i}`;
    if (vt.k === "tuple") return no("indexing a tuple with a variable is not translated");
    return `${v}[${this.ex(sl)}]`;
  }

  call(e: N): string {
    if (e.args.some((a: N) => a._t === "Starred")) no("f(*args) is not translated");
    const f = e.func;
    const A = (i: number) => this.ex(e.args[i]);
    const n = e.args.length;
    if (f._t === "Name") {
      const known = this.scope.get(f.id);
      if (known?.k === "value") return this.foreignCallExpr(ident(f.id), e.args, e.keywords);
      if (known?.k === "fn" && known.cls?.startsWith("math.")) return this.mathCall(known.cls.slice(5), e);
      if (this.classes.has(f.id) || this.fns.has(f.id) || this.scope.getFn(f.id) || (known && known.k !== "?") || this.scope.has(f.id)) {
        return `${f.id === "main" && this.renamedMain ? "main_" : ident(f.id)}(${this.args(e)})`;
      }
      switch (f.id) {
        case "print": return this.print(e);
        case "len": return `len(${A(0)})`;
        case "str": { if (!n) return `""`; const t = this.ty(e.args[0]); if (t.k === "str") return A(0); if (!t.opt && (t.k === "int" || t.k === "float" || t.k === "char")) return `str(${A(0)})`; return this.strOf(e.args[0]); }
        case "repr": this.usesPy = true; return `py.repr(${A(0)})`;
        case "int": { const t = this.ty(e.args[0]); if (n > 1) no("int(x, base) is not translated"); if (t.k === "int" && !t.opt) return A(0); if (t.k === "float" && !t.opt) return `${this.paren(A(0))}.toInt()`; this.usesPy = true; return `py.int(${A(0)})`; }
        case "float": { const t = this.ty(e.args[0]); if (t.k === "float" && !t.opt) return A(0); if (t.k === "int" && !t.opt) return `${this.paren(A(0))}.toFloat()`; this.usesPy = true; return `py.float(${A(0)})`; }
        case "bool": return this.cond(e.args[0]);
        case "abs": return `${this.paren(A(0))}.abs`;
        case "round": { const t = this.ty(e.args[0]); if (t.k === "int") return A(0); this.usesPy = true; return n > 1 ? `py.round(${A(0)}, ${A(1)})` : `py.round(${A(0)})`; }
        case "sum": {
          const el = this.elemOf(this.ty(e.args[0]));
          if (el.k === "value") { this.usesPy = true; return `py.sum(${this.listy(e.args[0])})`; }
          return `sum(${this.listy(e.args[0])})`;
        }
        case "min": case "max": {
          const key = kw(e, "key");
          if (key) { this.usesPy = true; return `py.${f.id}By(${this.listy(e.args[0])}, ${this.fnArg(key, this.elemOf(this.ty(e.args[0])))})`; }
          if (n === 1) return `${f.id}(${this.listy(e.args[0])})`;
          if (n === 2) return `${f.id}(${A(0)}, ${A(1)})`;
          return `${f.id}([${e.args.map((a: N) => this.ex(a)).join(", ")}])`;
        }
        case "sorted": {
          const key = kw(e, "key"), rev = kw(e, "reverse");
          const src = this.listy(e.args[0]);
          const pyOrder = key?._t === "Lambda" && key.body._t === "Tuple";
          if (pyOrder) this.usesPy = true;
          const el = this.elemOf(this.ty(e.args[0]));
          const isRev = rev && !(rev._t === "Constant" && rev.value === false);
          if (key) {
            const kFn = this.fnArg(key, el);
            if (isRev) {
              return pyOrder ? `py.sortedBy(${this.paren(src)}.reversed(), ${kFn}).reversed()` : `${this.paren(src)}.reversed().sortedBy(${kFn}).reversed()`;
            }
            return pyOrder ? `py.sortedBy(${src}, ${kFn})` : `${this.paren(src)}.sortedBy(${kFn})`;
          }
          let s = el.k === "tuple" ? (this.usesPy = true, `py.sorted(${src})`) : `${this.paren(src)}.sorted()`;
          if (isRev) s += ".reversed()";
          return s;
        }
        case "reversed": return `${this.paren(this.listy(e.args[0]))}.reversed()`;
        case "list": return n ? this.listy(e.args[0], true) : "[]";
        case "set": return n ? `Set(${this.listy(e.args[0])})` : "Set()";
        case "dict": if (!n) return "{}"; if (n === 1 && !e.keywords.length) return `{k__: v__ for (k__, v__) in ${this.ex(e.args[0])}}`; return no("dict(...) with keyword arguments is not translated");
        case "tuple": return no("tuple(...) is not translated");
        case "range": return this.range(e);
        case "enumerate": if (kw(e, "start") || n > 1) no("enumerate(xs, start) is not translated"); return `${this.paren(A(0))}.enumerate()`;
        case "zip": if (n !== 2) no("zip of more than two lists is not translated"); return `${this.paren(this.listy(e.args[0]))}.zip(${this.listy(e.args[1])})`;
        case "any": case "all": return `${this.paren(this.listy(e.args[0]))}.${f.id}(b__ => b__)`;
        case "map": if (n !== 2) no("map() with several lists is not translated"); return `${this.paren(this.listy(e.args[1]))}.map(${this.fnArg(e.args[0], this.elemOf(this.ty(e.args[1])))})`;
        case "filter": if (n !== 2) no("filter() is not translated"); return `${this.paren(this.listy(e.args[1]))}.filter(${this.fnArg(e.args[0], this.elemOf(this.ty(e.args[1])))})`;
        case "next": return n > 1 ? `(${this.paren(A(0))}.next() ?? ${A(1)})` : `${this.paren(A(0))}.next()!`;
        case "ord": { const a0 = e.args[0]; if (a0._t === "Constant" && typeof a0.value === "string" && [...a0.value].length === 1) return `'${a0.value === "'" ? "\\'" : a0.value === "\\" ? "\\\\" : a0.value}'.code`; return `${this.paren(A(0))}.code`; }
        case "chr": return `${this.paren(A(0))}.toChar().toString()`;
        case "input": return n ? `input(${A(0)})` : "input()";
        case "isinstance": {
          const ts = e.args[1]._t === "Tuple" ? e.args[1].elts : [e.args[1]];
          return ts.map((t: N) => `${this.paren(A(0))} is ${t._t === "Name" ? (PRIMS[t.id] ?? (t.id === "list" ? "[Any]" : this.classes.has(t.id) ? t.id : no(`isinstance(x, ${t.id}) is not translated`))) : no("isinstance with this type is not translated")}`).join(" || ");
        }
        case "divmod": this.usesPy = true; return `(py.floordiv(${A(0)}, ${A(1)}), py.mod(${A(0)}, ${A(1)}))`;
        case "pow": if (n !== 2) no("pow(a, b, mod) is not translated"); return `${this.paren(A(0))} ** ${this.paren(A(1))}`;
        case "exit": case "quit": return no("exit() is not translated");
        case "super": return "super";
      }
      return no(`the built-in ${f.id}() is not translated`);
    }
    if (f._t === "Attribute") return this.method(e);
    return no("this call is not translated");
  }

  args(e: N): string {
    return [...e.args.map((a: N) => this.ex(a)), ...e.keywords.map((k: N) => (k.arg ? `${ident(k.arg)}: ${this.ex(k.value)}` : no("f(**kwargs) is not translated")))].join(", ");
  }

  /** an argument that Mycel needs as a list */
  listy(e: N, copy = false): string {
    const t = this.ty(e);
    if (t.k === "str") return `${this.paren(this.ex(e))}.chars()`;
    if (t.k === "dict") return `${this.paren(this.ex(e))}.keys`;
    if (t.k === "range" && copy) return `${this.paren(this.ex(e))}.toArray()`;
    if (t.k === "set" && copy) return `${this.paren(this.ex(e))}.toArray()`;
    if (t.k === "gen" && copy) return `${this.paren(this.ex(e))}.toArray()`;
    if (copy && (t.k === "list" || t.k === "?" || t.k === "value")) return `[x__ for x__ in ${this.ex(e)}]`;
    return this.ex(e);
  }

  range(e: N): string {
    const a = e.args.map((x: N) => this.ex(x));
    const p = (s: string) => (/^-?[\w.]+$/.test(s) ? s : `(${s})`);
    if (a.length === 1) return `0..${p(a[0])}`;
    if (a.length === 2) return `${p(a[0])}..${p(a[1])}`;
    const st = e.args[2];
    const lit = st._t === "Constant" && st.value?.$i !== undefined ? BigInt(st.value.$i) : st._t === "UnaryOp" && st.op._t === "USub" && st.operand._t === "Constant" && st.operand.value?.$i !== undefined ? -BigInt(st.operand.value.$i) : undefined;
    if (lit === undefined) return `(${p(a[0])}..${p(a[1])}).step(${a[2]})`;
    if (lit > 0n) return `(${p(a[0])}..${p(a[1])}).step(${lit})`;
    this.usesPy = true;
    const S = (-lit).toString();
    return `[${p(a[0])} - k__ * ${S} for k__ in 0..py.floordiv(${p(a[0])} - ${p(a[1])} + ${S} - 1, ${S})]`;
  }

  mathCall(fn: string, e: N): string {
    const A = (i: number) => { const t = this.ty(e.args[i]); const s = this.ex(e.args[i]); return t.k === "int" ? `${this.paren(s)}.toFloat()` : s; };
    switch (fn) {
      case "sqrt": return `${this.paren(A(0))}.sqrt()`;
      case "floor": return `${this.paren(A(0))}.floor()`;
      case "ceil": return `${this.paren(A(0))}.ceil()`;
      case "pi": return "math.PI";
      case "gcd": case "lcm": return `math.${fn}(${this.ex(e.args[0])}, ${this.ex(e.args[1])})`;
      case "log": return e.args.length === 2 ? `(math.log(${A(0)}) / math.log(${A(1)}))` : `math.log(${A(0)})`;
      case "isnan": return `${this.paren(A(0))}.isNaN`;
      case "isfinite": return `${this.paren(A(0))}.isFinite`;
      case "isinf": return `(!${this.paren(A(0))}.isFinite && !${this.paren(A(0))}.isNaN)`;
      case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": case "exp": case "log2": case "log10": case "atan2": case "hypot": case "pow": case "degrees": case "radians":
        return `math.${fn}(${e.args.map((_: N, i: number) => A(i)).join(", ")})`;
      case "fabs": return `${this.paren(A(0))}.abs`;
    }
    return no(`math.${fn} is not translated`);
  }

  private reCall(m: string, e: N): string {
    const pat = e.args[0];
    const patStr = pat?._t === "Constant" && typeof pat.value === "string" ? pat.value : undefined;
    if (m === "findall" && e.args.length === 2 && !e.keywords.length && patStr !== undefined) {
      const txt = this.paren(this.ex(e.args[1]));
      if (["\\d+", "[0-9]+", "-?\\d+"].includes(patStr)) {
        return `[str(n__) for n__ in ${txt}.extract(Int)]`;
      }
      if (["\\w+", "[A-Za-z]+", "[a-zA-Z]+"].includes(patStr)) {
        return `${txt}.extract(Word)`;
      }
    }
    if (m === "sub" && e.args.length === 3 && !e.keywords.length && patStr !== undefined && e.args[1]._t === "Constant" && typeof e.args[1].value === "string") {
      const repl = e.args[1].value;
      if (!/[\\^$.*+?()[\]{}|]/.test(patStr) && !repl.includes("\\")) {
        return `${this.paren(this.ex(e.args[2]))}.replace(${this.ex(pat)}, ${this.ex(e.args[1])})`;
      }
      if (!repl.includes("\\") && !/\(\?[P<=!]/.test(patStr)) {
        this.usesRe = true;
        return `re.replace(${this.ex(pat)}, ${this.ex(e.args[2])}, with: ${this.ex(e.args[1])})`;
      }
    }
    if (m === "split" && e.args.length === 2 && !e.keywords.length && patStr !== undefined) {
      if (!/[\\^$.*+?()[\]{}|]/.test(patStr)) {
        return `${this.paren(this.ex(e.args[1]))}.split(${this.ex(pat)})`;
      }
      if (!/\(\?[P<=!]/.test(patStr)) {
        this.usesRe = true;
        return `re.split(${this.ex(pat)}, ${this.ex(e.args[1])})`;
      }
    }
    if (m === "search" && e.args.length === 2 && !e.keywords.length && patStr !== undefined && !/\(\?[P<=!]/.test(patStr)) {
      this.usesRe = true;
      return `re.find(${this.ex(pat)}, ${this.ex(e.args[1])})`;
    }
    if (m === "findall" && e.args.length === 2 && !e.keywords.length && patStr !== undefined && !/\(\?[P<=!]/.test(patStr) && !/\([^?]/.test(patStr)) {
      this.usesRe = true;
      return `[m__.text for m__ in re.findAll(${this.ex(pat)}, ${this.ex(e.args[1])})]`;
    }
    return no(`re.${m}() is not translated (use .extract(...) or plain string helpers, or re)`);
  }

  method(e: N): string {
    const f = e.func, recv = f.value, m = f.attr, rt = this.ty(recv), n = e.args.length;
    if (recv._t === "Name" && recv.id === "math" && this.usesMath) return this.mathCall(m, e);
    if (recv._t === "Name" && recv.id === "re") return this.reCall(m, e);
    if (recv._t === "Name" && recv.id === "sys" && this.usesEnv) return no(`sys.${m}() is not translated`);
    if (recv._t === "Call" && recv.func._t === "Name" && recv.func.id === "super") return `super.${m === "__init__" ? "init" : m}(${this.args(e)})`;

    // File object from `with open(...) as f:` (files path)
    if (recv._t === "Name") {
      const fv = this.scope.getFile(recv.id);
      if (fv && fv.mode === "read") {
        if (m === "read" && n === 0) return fv.bufVar;
        if (m === "readlines" && n === 0) { this.usesPy = true; return `py.splitLinesKeep(${fv.bufVar})`; }
      }
    }
    // re Match methods
    if (rt.k === "obj" && rt.cls === "__re_Match__") {
      if (m === "group") {
        if (n === 0 || (n === 1 && e.args[0]._t === "Constant" && e.args[0].value?.$i === "0")) return `${this.paren(this.ex(recv))}.text`;
        if (n === 1 && e.args[0]._t === "Constant" && e.args[0].value?.$i !== undefined) return `${this.paren(this.ex(recv))}.groups[${Number(e.args[0].value.$i) - 1}]!`;
      }
      if (m === "start" && n === 0) return `${this.paren(this.ex(recv))}.start`;
      if (m === "end" && n === 0) return `${this.paren(this.ex(recv))}.end`;
    }

    // Foreign module or foreign Value
    if (recv._t === "Name" && this.foreignMods.has(recv.id)) {
      if (m === "parse_args" && n === 0 && !e.keywords.length && this.foreignMods.get(recv.id) === "argparse") {
        this.usesEnv = true;
        return `${recv.id}.parse_args(env.args())`;
      }
      return this.foreignCallExpr(`${recv.id}.${m}`, e.args, e.keywords);
    }
    if (rt.k === "value") {
      if (m === "strip" && n === 0) { this.usesPy = true; return `py.strip(${this.ex(recv)})`; }
      if (m === "parse_args" && n === 0 && !e.keywords.length && this.foreignMods.has("argparse")) {
        this.usesEnv = true;
        return `${this.ex(recv)}.parse_args(env.args())`;
      }
      return this.foreignCallExpr(`${this.paren(this.ex(recv))}.${m}`, e.args, e.keywords);
    }

    const R = this.paren(this.ex(recv));
    const A = (i: number) => this.ex(e.args[i]);
    const isStr = rt.k === "str" || (rt.k === "?" && recv._t === "Constant" && typeof recv.value === "string");
    const isChar = rt.k === "char";
    if (isStr || isChar || rt.k === "?") {
      switch (m) {
        case "join": return `${this.paren(this.listy(e.args[0]))}.join(${R})`;
        case "upper": case "lower": return `${R}.${m}()`;
        case "strip": if (n) no("strip(chars) is not translated"); return `${R}.trim()`;
        case "lstrip": if (n) no("lstrip(chars) is not translated"); return `${R}.trimStart()`;
        case "rstrip": if (n) no("rstrip(chars) is not translated"); return `${R}.trimEnd()`;
        case "split": if (n === 0) { this.usesPy = true; return `py.splitWs(${R})`; } if (n > 1) no("split(sep, n) is not translated"); return `${R}.split(${A(0)})`;
        case "replace": if (n > 2) no("replace(a, b, count) is not translated"); return `${R}.replace(${A(0)}, ${A(1)})`;
        case "startswith": return `${R}.startsWith(${A(0)})`;
        case "endswith": return `${R}.endsWith(${A(0)})`;
        case "find": return `(${R}.indexOf(${A(0)}) ?? -1)`;
        case "isalpha": return isChar || rt.k === "?" ? `${R}.isLetter` : `(!${R}.isEmpty && ${R}.chars().all(c__ => c__.isLetter))`;
        case "isdigit": case "isnumeric": case "isdecimal": return isChar || rt.k === "?" ? `${R}.isDigit` : `(!${R}.isEmpty && ${R}.chars().all(c__ => c__.isDigit))`;
        case "isspace": return isChar || rt.k === "?" ? `${R}.isWhitespace` : `(!${R}.isEmpty && ${R}.chars().all(c__ => c__.isWhitespace))`;
        case "isupper": return isChar || rt.k === "?" ? `${R}.isUpper` : `(${R} == ${R}.upper() && ${R} != ${R}.lower())`;
        case "islower": return isChar || rt.k === "?" ? `${R}.isLower` : `(${R} == ${R}.lower() && ${R} != ${R}.upper())`;
        case "isalnum": return isChar || rt.k === "?" ? `(${R}.isLetter || ${R}.isDigit)` : `(!${R}.isEmpty && ${R}.chars().all(c__ => c__.isLetter || c__.isDigit))`;
        case "capitalize": this.usesPy = true; return `(py.slice(${R}, nil, 1).upper() + py.slice(${R}, 1, nil).lower())`;
        case "zfill": this.usesPy = true; return `py.zfill(${R}, ${A(0)})`;
        case "rjust": return `${R}.padLeft(${A(0)}${n > 1 ? `, ${A(1)}` : ""})`;
        case "ljust": return `${R}.padRight(${A(0)}${n > 1 ? `, ${A(1)}` : ""})`;
      }
      if (isStr && m === "count") return `(${R}.split(${A(0)}).length - 1)`;
      if (isStr && m === "index") return `${R}.indexOf(${A(0)})!`;
      if (isStr) return no(`the string method ${m}() is not translated`);
    }
    if (rt.k === "list" || rt.k === "?") {
      switch (m) {
        case "append": return `${R}.push(${this.asElem(e.args[0], rt)})`;
        case "pop": return n ? `${R}.removeAt(${A(0)})` : `${R}.pop()!`;
        case "insert": return `${R}.insert(${A(1)}, at: ${A(0)})`;
        case "index": return `${R}.indexOf(${A(0)})!`;
        case "count": return `${R}.count(x__ => x__ == ${A(0)})`;
        case "remove": return `${R}.removeAt(${R}.indexOf(${A(0)})!)`;
        case "copy": return `[x__ for x__ in ${this.ex(recv)}]`;
      }
    }
    if (rt.k === "dict" || rt.k === "?") {
      switch (m) {
        case "get": return n > 1 ? `${R}.get(${A(0)}, ${A(1)})` : `${R}.get(${A(0)})`;
        case "keys": return `${R}.keys`;
        case "values": return `${R}.values`;
        case "items": return `${R}.entries`;
        case "pop": return `${R}.remove(${A(0)})!`;
        case "copy": return `${R}.copy()`;
      }
    }
    if (rt.k === "set" || rt.k === "?") {
      switch (m) {
        case "add": return `${R}.add(${A(0)})`;
        case "discard": case "remove": return `${R}.remove(${A(0)})`;
        case "union": return `(${R} | ${A(0)})`;
        case "intersection": return `(${R} & ${A(0)})`;
        case "difference": return `(${R} - ${A(0)})`;
      }
    }
    if (rt.k === "obj" || rt.k === "?") return `${R}.${m}(${this.args(e)})`;
    return no(`the method ${m}() on a ${rt.k} is not translated`);
  }

  keyOf(k: N, d: Ty): string {
    const t = this.ty(k);
    if (d.key?.k === "str" && t.k === "char") return `${this.paren(this.ex(k))}.toString()`;
    if (d.key?.k === "char" && k._t === "Constant" && typeof k.value === "string" && [...k.value].length === 1) return charLit(k.value);
    return this.ex(k);
  }
  asElem(a: N, list: Ty): string { const t = this.ty(a); return list.el?.k === "str" && t.k === "char" ? `${this.paren(this.ex(a))}.toString()` : this.ex(a); }

  // ------------------------------------------------------------------ static types
  ty(e: N): Ty {
    if (!e) return U;
    switch (e._t) {
      case "Constant": { const v = e.value; return v === null ? T("none") : typeof v === "boolean" ? T("bool") : typeof v === "string" ? T("str") : v.$i !== undefined ? T("int") : v.$f !== undefined ? T("float") : U; }
      case "JoinedStr": return T("str");
      case "Name": { const t = this.scope.get(e.id); return t && t.k !== "?" ? t : this.scope.hint(e.id) ?? t ?? (this.classes.has(e.id) ? T("fn") : U); }
      case "List": { const el = e.elts.length ? this.ty(e.elts[0]) : undefined; return T("list", el && el.k !== "?" ? { el } : {}); }
      case "Tuple": return T("tuple", { items: e.elts.map((x: N) => this.ty(x)) });
      case "Set": return T("set", e.elts.length ? { el: this.ty(e.elts[0]) } : {});
      case "Dict": return T("dict", e.keys.length ? { key: this.ty(e.keys[0]), val: this.ty(e.values[0]) } : {});
      case "ListComp": case "GeneratorExp": { const saved = this.scope; this.scope = new Scope(this.scope); try { for (const g of e.generators) this.forHead(g.target, g.iter, this.scope, true); return T("list", { el: this.ty(e.elt) }); } catch { return T("list"); } finally { this.scope = saved; } }
      case "SetComp": return T("set");
      case "DictComp": return T("dict");
      case "BinOp": {
        const a = this.ty(e.left), b = this.ty(e.right), op = e.op._t;
        if (a.k === "value" || b.k === "value") return T("value");
        if (op === "Div") return T("float");
        if (a.k === "str" || b.k === "str") return op === "Add" || op === "Mult" ? T("str") : U;
        if (a.k === "list") return a;
        if (b.k === "list") return b;
        if (a.k === "set" && b.k === "set") return a;
        if (a.k === "float" || b.k === "float") return T("float");
        if (a.k === "int" && b.k === "int") return T("int");
        if (a.k === "char" && a.k === b.k) return T("str");
        return U;
      }
      case "UnaryOp": return e.op._t === "Not" ? T("bool") : this.ty(e.operand);
      case "BoolOp": { const ts = e.values.map((v: N) => this.ty(v)); return ts.every((t: Ty) => t.k === "bool") ? T("bool") : ts[ts.length - 1]; }
      case "Compare": return T("bool");
      case "IfExp": { const a = this.ty(e.body); return a.k !== "?" ? a : this.ty(e.orelse); }
      case "Subscript": {
        if (e.value._t === "Attribute" && e.value.attr === "argv") return e.slice._t === "Slice" ? T("list", { el: T("str") }) : T("str");
        if (e.value._t === "Name") {
          const dk = this.scope.getDd(e.value.id);
          if (dk === "int") return T("int");
          if (dk === "float") return T("float");
          if (dk === "list") return T("list");
          if (dk === "set") return T("set");
        }
        const v = this.ty(e.value);
        if (e.slice._t === "Slice") return v.k === "char" ? T("str") : v;
        if (v.k === "list") return v.el ?? U;
        if (v.k === "str") return T("char");
        if (v.k === "dict") return v.val ?? U;
        if (v.k === "tuple" && e.slice._t === "Constant" && e.slice.value?.$i !== undefined) return v.items?.[Number(e.slice.value.$i)] ?? U;
        if (v.k === "value") return T("value");
        return U;
      }
      case "Attribute": {
        if (e.value._t === "Name" && this.classes.get(e.value.id)?.enumKind) return T("obj", { cls: e.value.id });
        const v = this.ty(e.value);
        if (v.k === "value" || (e.value._t === "Name" && this.foreignMods.has(e.value.id))) return T("value");
        if (v.k === "obj" && v.cls) {
          let c = this.classes.get(v.cls);
          while (c) { const f = c.fields.get(e.attr); if (f) return f; c = c.base ? this.classes.get(c.base) : undefined; }
        }
        if (e.value._t === "Name" && e.value.id === "math" && this.usesMath) return T("float");
        return U;
      }
      case "Call": return this.callTy(e);
    }
    return U;
  }

  callTy(e: N): Ty {
    const f = e.func;
    if (f._t === "Name") {
      const known = this.scope.get(f.id);
      if (known?.k === "value") return T("value");
      if (known?.k === "fn" && known.cls?.startsWith("math.")) return ["floor", "ceil", "gcd", "lcm"].includes(known.cls.slice(5)) ? T("int") : T("float");
      if (this.classes.has(f.id)) return T("obj", { cls: f.id });
      const lf = this.scope.getFn(f.id) ?? this.fns.get(f.id);
      if (lf) return lf.ret;
      const a0 = e.args[0] ? this.ty(e.args[0]) : U;
      switch (f.id) {
        case "len": case "int": case "ord": return T("int");
        case "str": case "repr": case "chr": case "input": return T("str");
        case "float": return T("float");
        case "bool": case "isinstance": case "any": case "all": return T("bool");
        case "abs": return a0;
        case "round": return e.args.length > 1 ? T("float") : T("int");
        case "sum": { const el = this.elemOf(a0); return el.k === "value" ? T("value") : el.k === "float" ? T("float") : T("int"); }
        case "min": case "max": return e.args.length === 1 ? this.elemOf(a0) : a0;
        case "sorted": case "reversed": return a0.k === "str" ? T("list", { el: T("char") }) : a0.k === "dict" ? T("list", { el: a0.key }) : a0.k === "range" ? T("list", { el: T("int") }) : a0.k === "set" ? T("list", { el: a0.el }) : a0.k === "list" ? a0 : T("list");
        case "list": return a0.k === "str" ? T("list", { el: T("char") }) : a0.k === "range" ? T("list", { el: T("int") }) : a0.k === "set" ? T("list", { el: a0.el }) : a0.k === "dict" ? T("list", { el: a0.key }) : a0.k === "gen" ? T("list", { el: a0.el }) : a0.k === "list" ? a0 : T("list");
        case "set": return T("set", a0.k === "str" ? { el: T("char") } : a0.el ? { el: a0.el } : {});
        case "dict": return T("dict");
        case "range": return T("range");
        case "next": return a0.k === "gen" ? (a0.el ?? U) : U;
        case "enumerate": return T("list", { el: T("tuple", { items: [T("int"), this.elemOf(a0)] }) });
        case "zip": return T("list", { el: T("tuple", { items: [this.elemOf(a0), this.elemOf(e.args[1] ? this.ty(e.args[1]) : U)] }) });
        case "divmod": return T("tuple", { items: [a0, a0] });
        case "pow": return a0;
      }
      return U;
    }
    if (f._t === "Attribute") {
      const r = this.ty(f.value), m = f.attr;
      if (f.value._t === "Name" && f.value.id === "re") {
        if (m === "search") return T("obj", { cls: "__re_Match__", opt: true });
        if (m === "findall" || m === "split") return T("list", { el: T("str") });
        if (m === "sub") return T("str");
      }
      if (r.k === "value" || (f.value._t === "Name" && this.foreignMods.has(f.value.id))) return T("value");
      if (f.value._t === "Name" && f.value.id === "math" && this.usesMath) return ["floor", "ceil", "gcd", "lcm"].includes(m) ? T("int") : ["isnan", "isfinite", "isinf"].includes(m) ? T("bool") : T("float");
      if (r.k === "str" || r.k === "char") {
        if (["upper", "lower", "strip", "lstrip", "rstrip", "replace", "join", "capitalize", "zfill", "ljust", "rjust", "title"].includes(m)) return r.k === "char" && (m === "upper" || m === "lower") ? T("char") : T("str");
        if (m === "split") return T("list", { el: T("str") });
        if (m.startsWith("is") || m === "startswith" || m === "endswith") return T("bool");
        if (["find", "index", "count"].includes(m)) return T("int");
      }
      if (f.value._t === "Constant" && typeof f.value.value === "string" && m === "join") return T("str");
      if (r.k === "list") { if (m === "pop") return r.el ?? U; if (m === "index" || m === "count") return T("int"); if (m === "copy") return r; }
      if (m === "get" && e.args.length > 1 && (r.k === "dict" || r.k === "?")) { const d = this.ty(e.args[1]); if (r.val && r.val.k !== "?") return r.val; if (d.k !== "?") return d; }
      if (m === "get" && e.args.length === 1 && (r.k === "dict" || r.k === "?")) { return { ...(r.val ?? U), opt: true }; }
      if (r.k === "dict") {
        if (m === "keys") return T("list", { el: r.key });
        if (m === "values") return T("list", { el: r.val });
        if (m === "items") return T("list", { el: T("tuple", { items: [r.key ?? U, r.val ?? U] }) });
        if (m === "copy") return r;
      }
      if (r.k === "obj" && r.cls) return U;
    }
    return U;
  }
}

function hasYield(body: N[]): boolean {
  let found = false;
  walk(body, (n) => {
    if (n._t === "Yield" || n._t === "YieldFrom") found = true;
  }, true);
  return found;
}
function charLit(c: string): string { return `'${c === "'" ? "\\'" : c === "\\" ? "\\\\" : c}'`; }
function walkFind(n: N, f: (n: N) => N | undefined): N | undefined { let r: N | undefined; walk(n, (x) => { if (r === undefined) r = f(x); }); return r; }
function isEmptyLit(v: N): boolean { return (v?._t === "List" && !v.elts.length) || (v?._t === "Dict" && !v.keys.length) || (v?._t === "Call" && v.func._t === "Name" && v.func.id === "set" && !v.args.length); }
function kw(e: N, name: string): N | undefined { return e.keywords?.find((k: N) => k.arg === name)?.value; }
function atomic(s: string): boolean {
  let d = 0, q: string | undefined;
  if (s.startsWith("-") || s.startsWith("!")) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = undefined; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    else if (d === 0 && (/[\s+\-*/<>=!&|?%^]/.test(c) || (c === "." && s[i + 1] === "."))) return false;
  }
  return true;
}
function trimBlank(xs: string[]): string[] { const o: string[] = []; for (const l of xs) { if (l === "" && (o.length === 0 || o[o.length - 1] === "")) continue; o.push(l); } while (o.length && o[o.length - 1] === "") o.pop(); return o; }
/** visit every node (skipping nested function/class bodies when `shallow`) */
function walk(n: N, f: (n: N) => void, shallow = false) {
  if (Array.isArray(n)) { for (const x of n) walk(x, f, shallow); return; }
  if (!n || typeof n !== "object" || !n._t) return;
  f(n);
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith("_")) continue;
    if (shallow && (n._t === "FunctionDef" || n._t === "ClassDef" || n._t === "Lambda") && k === "body") continue;
    if (v && typeof v === "object") walk(v, f, shallow);
  }
}
