# Mycel language specification (v0.1)

Mycel (formerly Ply) is statically typed, expression-friendly, and compiles to JavaScript that runs in a capability sandbox.
File extension `.myc` (`.olx` is accepted everywhere); project manifest `ply.json`. A file may be just statements
(`print("hi")` is a whole program): top-level statements become the implicit `fn main()`.

## 1. Lexical structure

* Source is UTF-8. Identifiers: letters (any script), digits, `_`; they cannot start with a digit or contain `$`
  (that is how generated code can never collide with a user name).
* Comments: `// line`, `/* block */`, `/// doc` (read by `mycel doc`).
* Statements end at a newline or `;`. A newline is *ignored* inside `(...)`/`[...]`, after a binary operator or `,`,
  and when the next line starts with `.name`, `?.`, `&&`, `||`, `??` or `|>` (so method chains and long conditions
  wrap naturally). A capitalised `.Variant` at the start of a line begins a new statement/arm.
* Keywords: `let var fn class struct interface enum type extend import pub private protected static if else while for in
  match return break continue throw try catch finally true false nil is as async await spawn gen yield init self super
  override operator extern then`. `get`, `set` and `test` are contextual.
* Literals: `42`, `1_000`, `0xFF`, `0b101`, `0o17` (Int); `3.14`, `1e9` (Float); `"text"`, f-strings `f"total {a + b} {x:.2f} {x=}"` (`{{`/`}}` for braces) with escapes
  `\n \t \r \0 \\ \" \' \$ \u{1F600}`; `"""multi-line"""` (indentation of the closing quotes is removed);
  `'c'` (Char); `true false nil`; `[1, 2]`, `{"k": v}` (empty map `{}`), `Set([1, 2])` (set), `(a, b)` (tuple).

## 2. Types

| | |
|---|---|
| `Int` | signed 64-bit; overflow, division by zero and shifts out of range **panic** |
| `Float` | IEEE-754 double; prints with a decimal point (`1.0`) |
| `Bool`, `String`, `Char`, `Void`, `Never`, `Any` | `String` indexes/lengths count Unicode characters |
| `[T]`, `{K: V}`, `Set<T>`, `(A, B)` | arrays, maps, sets, tuples; map keys and set elements are `Int String Char Bool Float` |
| `T?` | optional (nil or a `T`); nested optionals are rejected |
| `(A, B) -> R` | function type |
| `Result<T, E>`, `Task<T>`, `Gen<T>`, `Range` | built in (`Result` is an ordinary enum declared in the prelude) |
| `class`, `struct`, `enum`, `interface`, `type X = ...` | declared types; generics `Box<T: Comparable>` |

Inference is local: `let x = 1`, lambdas get parameter types from context, generic arguments are inferred from
arguments and the expected type. Un-annotated functions infer their return type (also across mutual recursion);
parameters and fields always need a type or an initial value. Nothing converts implicitly *except* literals: an integer
literal is accepted where a Float is expected (`let f: Float = 3`), and where a `json.Json` is expected, JSON-shaped
literals are that JSON value (JavaScript): `let v: json.Json = {"name": "Ada", "tags": [1, true, nil]}`. A variable
still names its kind (`.Str(name)`); the compiler suggests it. Type parameters are **invariant** and erased at
run time. Numbers mix like Python: `Int` and `Float` arithmetic yields `Float` (`n * 1.5`), `7 / 2` is `3.5`, and whole-number division is `7.div(2)`.

## 3. Declarations

```
let name[: T] = expr         var name[: T] = expr         // let: binding is immutable. var of optional type may omit "= nil"
fn name<T: Bound>(a: T, b: Int = 1, ...rest: Int) -> R { ... }      fn f(x: Int) => x * 2
async fn / gen fn / extern fn (body supplied by the host) / pub fn
class Name<T>: Base, Iface { var x: Int = 0   let y: Int   init(...) {}   fn m() {}   static fn s() {}
                             get area: Float { ... }   set area(v: Float) { ... }   operator +(o: Name) -> Name { ... } }
struct P { let x: Int, y: Int }     // immutable value type: structural ==, generated with(x: ...) copy, no inheritance
enum E { A, B(n: Int), C(String, Int)   fn method() {}   get prop: T { ... } }
interface I: J { get name: String   fn f() -> Int   fn g() -> String { default body } }
type Alias<T> = ...        extend Int { fn double() -> Int { self * 2 } }      extend Int: Iface { ... }
test "name" { ... }        import a.b      import a.b as c      import a.b.{x, Y as Z}      import a.b.*
```

* **Destructuring**: `let (a, b) = pair`, `let P{x, y} = p`, `for (k, v) in map`, and in parameters:
  `fn f((a, b): (Int, Int))`, `fn g(P{x, y}: P)`, `((k, v)) => k` (one tuple argument; `(a, b) => ...` takes two).
  Like `let`, a parameter pattern must always match (no enum variants or list patterns; use `match`) and has no default.
* **Overloading**: functions/methods/initializers with the same name and different parameter types or counts.
* **Named arguments**, default values (evaluated per call), variadic last parameter.
* **Access**: members are `public` unless `private` (declaring class only) or `protected` (class and subclasses).
  Top-level declarations are visible to other modules only when `pub`. Checked at compile time.
* **Classes**: single inheritance; `override` is mandatory (and checked) when replacing a base method; interfaces
  can carry default methods; every non-optional field must be assigned in each `init` (or have a default); an
  `init` of a subclass must call `super.init(...)` unless the base has a no-argument initializer. A class without
  `init` gets a memberwise initializer (all fields in order, defaults optional).
* **Operators** overloadable via `operator`: `+ - * / % ** == < [] & | ^ << >>` and unary `-`. Defining `<` gives
  `> <= >=`; `T: Comparable` generics use `<` on class types that define it.
* **Extensions** add methods (not stored fields) to any type, including builtins and arrays (`extend<T> [T]`), and
  may declare conformance to an interface.

## 4. Expressions

Precedence, low to high: assignment (`= += -= *= /= %= **= ??= <<= >>=`) · `cond ? a : b` · `|>` · `??` · `||` ·
`&&` · `== !=` · `< <= > >= is as as?` · `.. ..=` · `|` · `^` · `&` · `<< >>` · `+ -` · `* / %` · `**` (right) · unary
`- ! ~ await spawn try yield` · postfix `() [] . ?. ! ?`.

* `a ?? b`, `a?.b`, `a?[i]`, `a!` (panics on nil), `r?` (propagates `Err`/nil to the caller). `x?` needs no space
  before `?`; `x ? a : b` needs one. An optional chain short-circuits as a whole: `a?.b.c()` is nil if `a` is.
* `if c { a } else { b }` is the value form of `if` (one expression per branch, `else if` chains; Rust/Kotlin/Swift), and Python's `a if c else b` works too; `match` is an expression; `try expr` turns a throwing expression
  into `Result<T, Error>`.
* `a |> f` calls `f(a)`; `a |> g(b)` calls `g(a, b)`. Ranges: `0..n` (excludes n), `0..=n`, usable for slicing
  (`xs[1..3]`, `s[..2]`) and `for`.
* Leading-dot shorthand `.Circle(r: 1.0)` takes its enum type from context. Lambdas: `x => x + 1`, `fn(x) => x + 1`, `fn(x) { return x + 1 }`,
  `(a, b) => a + b`, `(x: Int) -> Int => { return x }`.
* Comprehensions (Python): `[e for p in xs]`, `[e for p in xs if c]`, `{k: v for p in xs}` (a map). Several
  `for`/`if` clauses run left to right like nested loops (`[(a, b) for a in xs for b in ys if a != b]`); `p` is any
  pattern (`for (k, v) in m`, `for i, x in list` = position + value); `xs` is anything `for` can walk. The names
  live only inside the comprehension. Sets are built with `Set([...])` (one way to make a set).
* Collections are mutable reference types; `let` fixes the binding, not the contents. Use `.copy()`.

## 5. Statements and control flow

`if / else if / else`, `if let pat = optionalOrValue { }`, `while`, `while let`, `for pat in iterable`, `break`,
`continue`, labeled loops (`outer: for ... { for ... { break outer } }`, also `continue outer` and `name: while`), `return`, `throw`, `try { } catch e: Type { } catch e { } finally { }`, `match` with guards.
`for` iterates arrays, sets, maps (as `(key, value)`), ranges, strings (characters), generators and any type with
`fn iter() -> Iterator<T>`. A function that can reach its end without returning a declared value is an error;
unreachable code and unused variables are warnings.

**Patterns**: `_`, `name`, literals (`1`, `"s"`, `nil`, `true`), ranges (`1..=9`), `(a, b)`, `[first, ..rest]`,
`Variant(a, b)` / `.Variant(r: x)`, `Type{field, other: pat}`, `is Type`, `name @ pattern` (bind and test).
`match` must be exhaustive for enums, `Bool`, optionals, tuples and list patterns, else the compiler lists the
missing cases.

## 6. Errors

* **Compile-time**: syntax, names, types, arity, access, overrides, interface conformance, exhaustiveness, definite
  initialisation, missing returns. Each diagnostic has `code`, `message`, source span, `why`, `suggestion`.
  `mycel explain <code>` (Rust's `--explain`) prints a longer explanation of any code with a wrong program and its fix
  (every example is compiled by the test suite); `mycel run`/`check` end with a `help:` line naming it.
* **Result/optional**: explicit, propagated with `?` (error types must be compatible).
* **Exceptions**: `throw` any `Error` (class, subclasses are typed errors); `catch e: Sub`. Stack captured at `throw`.
* **Panics**: index out of range, nil force-unwrap, overflow, division by zero, failed cast, failed assert, stack
  overflow, and every limit. A panic **cannot be caught**; the host receives a typed failure with a stack trace.

## 7. Concurrency

One thread, cooperative. `async fn` returns `Task<T>`; `await` unwraps it (allowed only in `async` code);
`spawn call()` starts it without waiting; `std.task` provides `sleep`, `all`, `race`, `timeout`, `Channel<T>` and
`select(channels)` / `select(channels, timeout: ms)` (Go's select, as a function: the first channel with a value wins and
the others keep theirs).
`gen fn` produces a `Gen<T>` (`yield`, `yield*`). A dropped `Task` that fails is reported, never silently lost.

## 8. Modules and packages

A file is a module named by its path under `src/` (`src/models/user.olx` → `models.user`); modules form namespaces
(`user.User`). Import cycles are rejected with the cycle spelled out. A package is a directory with `ply.json`
(`name`, `version`, `dependencies`, `capabilities`); dependencies are semver ranges (`^1.2.0 ~1.2.3 >=1.0.0 1.x *`)
or `path:../dir`, installed flat into `ply_modules/` with `ply.lock` (sha256 integrity, verified by `ply install`).
`ply publish` copies a package to the local registry (`$PLY_REGISTRY`, default `~/.olx/registry`); versions are immutable.

## 9. Safety model

Compiled code can only call functions the compiler resolved: there is no way to name host objects, `eval`, or JS
properties. The host passes **capabilities** (fs paths, net hosts, listen, process commands, env names) per run;
denied calls return `Err(CapabilityError)` with the reason and flag hint (e.g. `run with --allow-read`, `run with --allow-write`).
Limits: steps, wall time, output bytes, collection size, string length, abort signal. `runIsolated` (worker thread)
adds a hard heap cap and kills runaway native work. Known boundaries: see `STATUS.md`.

## 10. Standard library

Every module is written in Mycel (`std/*.olx` / `std/*.myc`) with typed interfaces and capability enforcement:
* `std.ui` — Beginner-friendly UI kit (`window`, `text`, `button`, `input`, `list`, `image`, `row`, `column`, event handlers). First backend is the playground browser sandbox using a safe structured message protocol to DOM renderer without arbitrary HTML/JS injection.
* `std.db` — Key-value store (`db.openKV()`, `set`, `get`, `has`, `remove`, `keys`) and simple typed tables (`db.open()`, `table`, `insert`, `all`, `find`, `findOne`, `update`, `delete`, `count`) over SQLite. Requires `--allow-write` when file-backed.
* `std.files` — Python-style file and path operations (`files.path()`, `read`, `write`, `append`, `exists`, `list`, `remove`, `mkdir`, `lines`) and `Path` class (`name`, `extension`, `stem`, `parent`, `join`, `text`). Requires `--allow-read` / `--allow-write`.
* `std.time` — Python-style time operations (`time.now()`, `time.today()`, `time.sleep()`, `time.format()`, `Duration`, `seconds`, `minutes`, `hours`, `days`).
* `std.web` — Minimal web apps and routing (`web.App`, `html`, `json`, `redirect`, `files`).
* `std.json`, `std.fs`, `std.http`, `std.sqlite`, `std.task`, `std.env`, `std.process`, `std.math`, `std.crypto`, `std.re`, `std.log`, `std.test`.
