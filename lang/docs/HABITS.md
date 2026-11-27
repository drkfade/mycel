# Habits from other languages

Generated from `lang/src/habits.ts` (`mycel help habits` prints it). Every row is tested: an
accepted habit compiles; any other habit is a compile error whose message names the language it came from and the
Mycel spelling.

## Coming from Python

| you write | in Mycel |
|---|---|
| `and / or / not` | works: `and`, `or`, `not` work (same as `&&` `\|\|` `!`) |
| `print(a, b)` | works: prints the values with a space between |
| `f"hi {name}"` | works: the same: f-strings with {x:.2f} and {x=} |
| `for i, x in items` | works: the same |
| `{k: v for x in xs}` | works: the same dict (map) comprehension; nested `for`/`if` clauses work too |
| `len(x)` | works: the same |
| `x ** 2` | works: the same |
| `no main(): statements at the top` | works: the same: a file can just be statements |
| `x if c else y` | works: the same |
| `x = 1 (no let)` | works: the same: the first assignment creates the variable |
| `a, b = b, a` | works: the same |
| `x in items / not in` | works: the same |
| `[x * 2 for x in xs if x > 1]` | works: the same |
| `xs[-1]` | works: the same: negative indexes count from the end |
| `d.get(k, default)` | works: the same |
| `a & b, a \| b, a - b on sets` | works: the same; sets are written `Set([1, 2])` |
| `def f(x):` | `def` is Python — Mycel writes `fn f(x) { ... }` |
| `elif` | `elif` is Python — Mycel writes `else if` |
| `None` | `None` is Python — Mycel writes `nil` |
| `True / False` | `True`/`False` are Python — Mycel writes `true` / `false` |
| `if x:` | a `:` block is Python — Mycel blocks use `{ ... }` |
| `lambda x: x + 1` | `lambda` is Python — Mycel writes `x => x + 1` |
| `raise` | `raise` is Python — Mycel writes `throw` |
| `except` | `except` is Python — Mycel writes `catch e { ... }` |

## Coming from JavaScript

| you write | in Mycel |
|---|---|
| `&&  \|\|  !` | works: the same |
| `x => x + 1` | works: the same |
| `x?.y and x ?? y` | works: the same |
| `JSON object literals` | works: the same, where a `json.Json` is expected |
| `// comments and ; at line end` | works: the same (semicolons are optional) |
| `async / await` | works: the same |
| `=== and !==` | `===` is JavaScript — Mycel's `==` already compares values: write `==` |
| `function f() {}` | `function` is JavaScript — Mycel writes `fn f() { ... }` |
| `const x = 1` | `const` is JavaScript — Mycel writes `let` (`var` for a value that changes) |
| `console.log(x)` | `console.log` is JavaScript — Mycel writes `print(x)` |
| `null / undefined` | `undefined` is JavaScript — Mycel writes `nil` |
| `this.x` | `this` is JavaScript/Java — Mycel writes `self.n` |
| `new Foo()` | `new` is JavaScript/Java — Mycel writes `Foo()` |
| `switch (x) { case 1: }` | `switch` — Mycel writes `match x { 1 => ... }` |
| `x++` | `x++` — Mycel writes `x += 1` |
| ``template ${x}`` | backticks are JavaScript — Mycel writes f"a {x}" |
| `import x from 'y'` | `import ... from` is JavaScript — Mycel writes `import std.fs` |

## Coming from TypeScript

| you write | in Mycel |
|---|---|
| `interface / enum / class` | works: the same keywords |
| `x!  and  x?.y` | works: the same |
| `generics <T>` | works: the same |
| `let x: Type = value` | works: the same (types are Int, Float, String, Bool) |
| `type Alias = ...` | works: the same |
| `async/await, Promise-style code` | works: the same without Promise: `async fn` returns the value |
| `number` | `number` is TypeScript — Mycel has `Int` (whole) and `Float` (decimal) |
| `string / boolean` | `string` — Mycel writes `String`; `boolean` is `Bool` |
| `any / unknown` | `any` is TypeScript — Mycel writes `Any` |
| `const / function` | `const` is JavaScript/TypeScript — Mycel writes `let` |
| `number[]` | `number` is TypeScript — Mycel writes `[Int]` for a list of whole numbers |
| `unknown` | `unknown` is TypeScript — Mycel writes `Any` |
| `x as number` | `number` is TypeScript — Mycel has `Int` and `Float` |
| `string[]` | Mycel writes a list type as `[String]` |
| `export function` | `export` is TypeScript — Mycel writes `pub fn f() { ... }` |

## Coming from Java

| you write | in Mycel |
|---|---|
| `System.out.println(x)` | `System.out.println` is Java — Mycel writes `print(x)` |
| `public static void main` | no boilerplate: write statements directly, or `fn main() { ... }` |
| `int x = 5;` | types follow the name: `let x: Int = 5` (or just `let x = 5`) |
| `String / double / boolean as types` | `double` is Java — Mycel's decimal type is `Float` |
| `new Foo()` | `new` is JavaScript/Java — Mycel writes `Foo()` |
| `void f()` | `void` is Java — Mycel writes `fn f() { ... }` (no return type needed) |
| `null` | `null` is JavaScript/Java — Mycel writes `nil` |
| `i++` | `x++` — Mycel writes `x += 1` |
| `for (int i = 0; ...; i++)` | Mycel writes `for i in 0..3 { ... }` |
| `extends / implements` | `extends` is Java — Mycel writes `class B: A { ... }` |
| `class Foo { }` | works: the same shape |
| `if (x) { } else { }` | works: the same (parentheses are optional) |
| `&&  \|\|  !` | works: the same |
| `while (x) { }` | works: the same |
| `try { } catch (e) { }` | works: `catch e { ... }` |

## Coming from Go

| you write | in Mycel |
|---|---|
| `if x { } else { }` | works: the same |
| `nil` | works: the same |
| `// comments` | works: the same |
| `struct Foo { }` | works: the same shape |
| `for i := range / for ... range` | works: `for i in 0..3 { }` (and `for x in items`) |
| `x := 5` | `:=` is Go — Mycel writes `let x = 5` |
| `func f() {}` | `func` is Go/Swift — Mycel writes `fn f() { ... }` |
| `fmt.Println(x)` | `fmt.Println` is Go — Mycel writes `print(x)` |
| `var x int` | types follow a colon: `var x: Int = 1` |
| `switch x { case 1: }` | `switch` — Mycel writes `match x { 1 => ... }` |
| `x++` | `x++` — Mycel writes `x += 1` |
| `go f()` | `go` is Go — Mycel writes `spawn f()` |
| `outer: for ... break outer` | works: the same labeled `break`/`continue` |
| `select { case v := <-a: ... }` | works: `let (which, v) = await task.select([a, b])` (and `select(chans, timeout: ms)`) |
| `defer f()` | `defer` is Go/Swift — put cleanup in `try { } finally { }` |
| `package main` | `package` is Go/Java — a Mycel file is a module; no package line |
| `int / string / float64 / bool types` | `float64` is Go — Mycel's decimal type is `Float` |

## Coming from Rust

| you write | in Mycel |
|---|---|
| `fn f(x: Int) -> Int { }` | works: the same shape |
| `let x = 5  (immutable by default)` | works: the same |
| `match x { A => .. }` | works: the same |
| `enum and struct` | works: the same |
| `Result and ?` | works: the same |
| `for i in 0..n` | works: the same |
| `if let Some(x) = y` | works: `if let x = y { }` |
| `let mut x = 5` | `let mut` is Rust — Mycel writes `var x = 5` |
| `println!("{}", x)` | `println!` is Rust — Mycel writes `print(x)` |
| `None` | `None` is Python/Rust — Mycel writes `nil` |
| `i32 / u64 / f64 / usize` | `i32` is Rust — Mycel's whole-number type is `Int` |
| `impl Foo { }` | `impl` is Rust — Mycel puts methods inside the class, or `extend Foo { ... }` |
| `vec![1, 2]` | `vec!` is Rust — Mycel writes `[1, 2]` |
| `Type::method` | `::` is Rust — Mycel writes `.` |
| `loop { }` | `loop` is Rust — Mycel writes `while true { ... }` |
| `let x: &str` | no references: Mycel's text type is `String` |

## Coming from Swift

| you write | in Mycel |
|---|---|
| `func f() -> Int` | `func` is Go/Swift — Mycel writes `fn f() -> Int { ... }` |
| `"\(x)" interpolation` | `\(x)` is Swift — Mycel writes f"v {x}" |
| `guard let x = y else { return }` | `guard` is Swift — Mycel writes `if x == nil { return }` or `if let v = x { ... }` |
| `switch x { case .a: }` | `switch` — Mycel writes `match x { .a => ... }` |
| `for i in 0..<n` | `..<` is Swift — Mycel's `0..3` already excludes the end (`0..=3` includes it) |
| `extension Foo { }` | `extension` is Swift — Mycel writes `extend Int { ... }` |
| `let / var` | works: the same |
| `if let x = y { }` | works: the same |
| `if let x { } (shorthand)` | `if let x { }` is Swift shorthand — Mycel names the value: `if let x = x { ... }` |
| `outer: for ... { break outer }` | works: the same labeled loops (`break outer`, `continue outer`) |
| `func f((a, b): (Int, Int))-style tuple params` | works: `fn f((a, b): (Int, Int))`; closures `((a, b)) => a + b` |
| `x?.y, x ?? y, x!` | works: the same |
| `struct / class / enum / protocol→interface` | works: the same (`protocol` is `interface`) |
| `closures x in ... → x => ...` | works: `x => x * 2` |
| `print(a, b)` | works: the same |
| `defer` | `defer` is Go/Swift — put cleanup in `try { } finally { }` |
| `Character` | `Character` is Swift — Mycel writes `Char` |
| `nil` | works: the same |
| `Double / String as types` | `Double` is Swift — Mycel's decimal type is `Float` |

