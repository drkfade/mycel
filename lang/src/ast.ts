import { Span } from "./diag";

// ---- type expressions (syntax) ----
export type TypeExpr = { span: Span } & (
  | { k: "named"; name: string; path: string[]; args: TypeExpr[] }   // Int, Map<K,V>, mod.Type
  | { k: "optional"; inner: TypeExpr }
  | { k: "array"; elem: TypeExpr }
  | { k: "map"; key: TypeExpr; val: TypeExpr }
  | { k: "tuple"; elems: TypeExpr[] }
  | { k: "fn"; params: TypeExpr[]; ret: TypeExpr }
);

// ---- patterns ----
export type Pattern = { span: Span } & (
  | { k: "wild" }
  | { k: "bind"; name: string; mutable: boolean; sub?: Pattern }       // x  /  x @ pat
  | { k: "lit"; value: Expr }                                          // 1, "a", true, nil, -1
  | { k: "range"; lo?: Expr; hi?: Expr; inclusive: boolean }
  | { k: "variant"; path: string[]; args: Pattern[]; names?: (string | undefined)[] }  // Circle(r)  .Circle(r)  Shape.Rect(w: a, h: b)
  | { k: "tuple"; elems: Pattern[] }
  | { k: "array"; elems: Pattern[]; rest?: { name?: string } ; restIndex: number }
  | { k: "object"; type?: string[]; fields: { name: string; pat: Pattern }[] }   // Point{x, y: 0}
  | { k: "is"; type: TypeExpr; bind?: string }
  | { k: "or"; alts: Pattern[] }
);

export interface Arg { name?: string; value: Expr; span: Span }
export interface Param {
  name: string; type?: TypeExpr; default?: Expr; span: Span;
  /** `inout`-style sugar is not supported; `...` varargs: */
  variadic?: boolean;
  /** `fn f((a, b): (Int, Int))` / `((k, v)) => k`: the argument is destructured; `name` is the pattern's text (shown
   *  in messages, never writable as a name) and `js` the generated `$argN` it is passed in. */
  pat?: Pattern; js?: string;
}
export interface TypeParam { name: string; bounds: TypeExpr[]; span: Span }

export type Expr = { span: Span; id?: number } & (
  | { k: "int"; value: bigint }
  | { k: "float"; value: number }
  | { k: "str"; parts: (string | Expr)[] }
  | { k: "fmtx"; e: Expr; spec: string; debug: boolean }
  | { k: "char"; value: string }
  | { k: "bool"; value: boolean }
  | { k: "nil" }
  | { k: "id"; name: string }
  | { k: "self" }
  | { k: "array"; elems: Expr[] }
  | { k: "set"; elems: Expr[] }
  | { k: "map"; entries: { key: Expr; value: Expr }[] }
  | { k: "tuple"; elems: Expr[] }
  | { k: "unary"; op: string; operand: Expr }
  | { k: "binary"; op: string; left: Expr; right: Expr }
  | { k: "assign"; op: string; target: Expr; value: Expr }
  | { k: "call"; callee: Expr; args: Arg[]; typeArgs?: TypeExpr[] }
  | { k: "index"; obj: Expr; index: Expr; optional?: boolean }
  | { k: "member"; obj: Expr; name: string; optional?: boolean }
  | { k: "implicit"; name: string; args?: Arg[] }              // .Circle(1.0)
  | { k: "force"; operand: Expr }                               // x!
  | { k: "propagate"; operand: Expr }                           // x?
  | { k: "cast"; operand: Expr; type: TypeExpr; safe: boolean } // as / as?
  | { k: "is"; operand: Expr; type: TypeExpr }
  | { k: "range"; lo?: Expr; hi?: Expr; inclusive: boolean }
  | { k: "lambda"; params: Param[]; ret?: TypeExpr; body: Expr | Block; async?: boolean; brace?: boolean; implicitIt?: boolean }
  | { k: "ternary"; cond: Expr; then: Expr; else: Expr }
  | { k: "match"; subject: Expr; arms: MatchArm[] }
  | { k: "await"; operand: Expr }
  | { k: "spawn"; operand: Expr }
  | { k: "yield"; operand?: Expr; delegate?: boolean }
  | { k: "try"; operand: Expr }                                 // try f()  -> Result<T, Error>
  | { k: "pipe"; left: Expr; right: Expr }
  | { k: "super"; }                                             // only as callee/object
  // `[e for p in xs if c]` / `{k: v for p in xs}` (Python): clauses run left to right like nested `for`/`if`
  | { k: "comp"; kind: "list" | "map"; elem: Expr; key?: Expr; clauses: CompClause[] }
);
export type CompClause = { k: "for"; pat: Pattern; iter: Expr; span: Span; bare?: boolean } | { k: "if"; cond: Expr; span: Span };

export interface MatchArm { pat: Pattern; guard?: Expr; body: Expr | Block; span: Span }
/** `if let pat = expr` or plain boolean (pat undefined). */
export interface Cond { expr: Expr; pat?: Pattern }

export type Block = { k: "block"; stmts: Stmt[]; span: Span };

export type Stmt = { span: Span } & (
  | { k: "let"; pat: Pattern; mutable: boolean; type?: TypeExpr; init?: Expr; pub?: boolean }
  | { k: "expr"; expr: Expr }
  | { k: "if"; cond: Cond; then: Block; else?: Block | Stmt }
  | { k: "while"; cond: Cond; body: Block; label?: string }
  | { k: "for"; pat: Pattern; iter: Expr; body: Block; label?: string; /** `for a, b in xs`: position+value for lists, key+value for maps */ bare?: boolean }
  | { k: "match"; subject: Expr; arms: MatchArm[] }
  | { k: "return"; value?: Expr; implicit?: boolean }
  | { k: "break"; label?: string }
  | { k: "continue"; label?: string }
  | { k: "throw"; value: Expr }
  | { k: "try"; body: Block; catches: { name?: string; type?: TypeExpr; body: Block; span: Span }[]; finally?: Block }
  | { k: "block"; stmts: Stmt[] }
  | { k: "fn"; decl: FnDecl }
);

export type Visibility = "public" | "private" | "protected";
export interface FnDecl {
  name: string; typeParams: TypeParam[]; params: Param[]; ret?: TypeExpr; body?: Block | Expr;
  async: boolean; gen: boolean; pub: boolean; span: Span;
  static?: boolean; override?: boolean; vis?: Visibility; isInit?: boolean; extern?: boolean;
  /** `get`/`set` accessor name for computed properties. */
  accessor?: "get" | "set"; operator?: string; doc?: string;
}
export interface FieldDecl { name: string; type?: TypeExpr; init?: Expr; mutable: boolean; static: boolean; vis: Visibility; span: Span }

export type Decl = { span: Span; pub: boolean; doc?: string } & (
  | { k: "fn"; fn: FnDecl }
  | { k: "let"; stmt: Extract<Stmt, { k: "let" }> }
  | { k: "class"; name: string; typeParams: TypeParam[]; base?: TypeExpr; ifaces: TypeExpr[]; fields: FieldDecl[]; methods: FnDecl[]; abstract?: boolean; struct: boolean }
  | { k: "interface"; name: string; typeParams: TypeParam[]; extends: TypeExpr[]; methods: FnDecl[]; getters: { name: string; type: TypeExpr; span: Span }[] }
  | { k: "enum"; name: string; typeParams: TypeParam[]; variants: { name: string; fields: { name?: string; type: TypeExpr }[]; value?: Expr; span: Span }[]; methods: FnDecl[]; ifaces: TypeExpr[] }
  | { k: "alias"; name: string; typeParams: TypeParam[]; type: TypeExpr }
  | { k: "extend"; target: TypeExpr; typeParams: TypeParam[]; ifaces: TypeExpr[]; methods: FnDecl[] }
  | { k: "import"; path: string[]; names?: { name: string; alias?: string; span: Span }[]; alias?: string; all?: boolean;
      /** `import requests --python`: the runtime flag at the end of foreign imports */
      flag?: { name: string; span: Span; nonTrailing?: boolean };
      /** `import "@google/generative-ai" as genai --npm`: a package name that is not an identifier */
      quoted?: boolean;
      /** `from X import Y` canonical selective import form */
      fromForm?: boolean;
      /** deprecated `import X.{Y}` brace selective import form */
      braceForm?: boolean }
  | { k: "test"; name: string; body: Block }
);

export interface Module { decls: Decl[]; src: import("./diag").Source; /** set when the file has top-level statements (a script): they were wrapped into the implicit `main`. */ script?: Span }
