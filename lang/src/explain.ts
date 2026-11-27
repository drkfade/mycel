// `mycel explain <code>` (from Rust's `rustc --explain`): a longer, teaching explanation of every diagnostic code, with
// a wrong program and its fix. tests/explain.test.ts proves the catalog is complete (every code the compiler can emit
// has an entry) and that every example is true: `bad` produces exactly that code, `good` compiles with no error.
import { closest } from "./diag";

export interface Explanation {
  /** one line, lower case, what went wrong */
  title: string;
  /** why the rule exists and how to fix it, in plain words */
  text: string;
  /** a whole program that triggers the code (omitted only when no single file can: internal errors, module layouts) */
  bad?: string;
  /** the same program, fixed */
  good?: string;
}

const E: Record<string, Explanation> = {
  // ---------- reading the file ----------
  E0001: { title: "the text cannot be read as Mycel tokens", text: "Something in the file is not a word, number, string or symbol Mycel knows: an unclosed string, a stray character such as `$` or `@` in the wrong place, or a bad escape. The caret points at the first character that could not be read.", bad: `print("hello)`, good: `print("hello")` },
  E0002: { title: "the program is nested too deeply to compile", text: "An expression or block is nested hundreds of levels deep (often generated code). Split it into smaller named steps: `let part = ...` and then use `part`." },
  E0003: { title: "internal compiler error", text: "The compiler itself failed. This is a bug in Mycel, not in your program. Shrink the program to the smallest version that still fails and report it with the message." },
  E0100: { title: "syntax error", text: "The code does not follow Mycel's grammar here: a bracket is missing, an operator has nothing after it, or a word is in the wrong place. The message names what the parser expected and, for brackets, the line where the unclosed one was opened.", bad: `print((1 + 2)`, good: `print((1 + 2))` },
  E0101: { title: "a habit from another language", text: "This spelling comes from another language (Python, JavaScript, Java, Go, Rust, Swift...). Mycel has one way to write each thing, and the message gives it. `mycel help habits` lists every habit and its Mycel spelling.", bad: `fn main() {\n  console.log("hi")\n}`, good: `fn main() {\n  print("hi")\n}` },

  // ---------- modules ----------
  E0201: { title: "a name is declared twice in a module", text: "Two top-level declarations (functions with the same parameters, types, or `let`s) share one name, so a use of the name would be ambiguous. Rename one of them.", bad: `let size = 1\nlet size = 2\nfn main() { print(size) }`, good: `let small = 1\nlet large = 2\nfn main() { print(small + large) }` },
  E0202: { title: "the module has no such member", text: "The imported module exists, but it declares nothing with this name. Check the spelling (the message suggests the nearest name) or the module's docs (`mycel doc`).", bad: `import std.math\nprint(math.squareroot(4.0))`, good: `import std.math\nprint(math.sqrt(4.0))` },
  E0203: { title: "the name is private to its module", text: "Only top-level declarations marked `pub` can be used from another module. Add `pub` to the declaration you want to share, or keep using it only inside its own file." },
  E0204: { title: "the module cannot be found", text: "No file or package provides this module. Standard modules are `std.<name>` (`import std.json`); your own modules are files under `src/` named by their path (`src/models/user.myc` is `models.user`); packages come from `ply.json` dependencies after `ply install`.", bad: `import std.jsn\nprint(1)`, good: `import std.json\nprint(json.stringify(json.Json.Num(1.0)))` },
  E0205: { title: "circular import", text: "Modules import each other in a cycle (the message spells it out: a -> b -> a). Mycel loads modules in order, so a cycle has no first module. Move the shared declarations into a third module that both import." },
  E0206: { title: "an import conflicts with a declaration, or a library module runs statements", text: "Either an imported name is also declared in this module (import it under another name with `import m.{x as y}`), or a module that others import has top-level statements: statements outside functions only run in the file you start, so move them into a function." },

  // ---------- types and declarations ----------
  E0210: { title: "nested optional types are not supported", text: "`Int??` would need two different kinds of nothing. Mycel has one: `nil`. Use `Int?`, or an enum when you really need to tell two kinds of absence apart.", bad: `type MaybeInt = Int?\nlet x: MaybeInt? = nil\nprint(x)`, good: `type MaybeInt = Int?\nlet x: MaybeInt = nil\nprint(x)` },
  E0211: { title: "unknown type", text: "No type with this name is declared or imported here. Check the spelling (built-in types are `Int Float Bool String Char`, collections are written `[T]`, `{K: V}`, `Set<T>`), or import the module that declares it.", bad: `let n: Integer = 1\nprint(n)`, good: `let n: Int = 1\nprint(n)` },
  E0212: { title: "wrong number of type arguments", text: "A generic type needs exactly as many type arguments as it declares (`Box<T>` takes one); a non-generic type takes none.", bad: `let xs: Set<Int, Int> = Set([1])\nprint(xs)`, good: `let xs: Set<Int> = Set([1])\nprint(xs)` },
  E0213: { title: "a type alias refers to itself", text: "`type A = [A]` has no end. A recursive shape needs a real type: an `enum` or a `class` can refer to itself.", bad: `type Tree = [Tree]\nlet t: Tree = []\nprint(t)`, good: `enum Tree {\n  Leaf\n  Node([Tree])\n}\nlet t: Tree = .Leaf\nprint(t)` },
  E0214: { title: "this type cannot be a map key or set element", text: "Map keys and set elements must be values that compare by content and never change: `Int String Char Bool Float`. Use one of those, for example a String built from the parts.", bad: `let m = {[1]: "one"}\nprint(m)`, good: `let m = {"1": "one"}\nprint(m)` },
  E0215: { title: "a type argument does not satisfy its bound", text: "A generic like `fn max<T: Comparable>` only accepts types that conform to the bound. Make the type conform (add the interface and its methods) or use a type that already does.", bad: `fn biggest<T: Comparable>(xs: [T]) -> T? => xs.sorted().last\nclass Box { let n: Int }\nprint(biggest([Box(n: 1)]))`, good: `fn biggest<T: Comparable>(xs: [T]) -> T? => xs.sorted().last\nprint(biggest([3, 1, 2]))` },
  E0216: { title: "invalid inheritance", text: "A class can inherit from one class (listed first, before interfaces), never from itself, a struct, an enum or a built-in type. Use an interface to share behaviour across unrelated types.", bad: `class A: A { }\nprint(1)`, good: `class Base { }\nclass A: Base { }\nprint(1)` },
  E0220: { title: "a function is declared twice with the same parameters", text: "Overloads must differ in parameter types or counts, otherwise a call cannot choose between them. Rename one, or change its parameters.", bad: `fn f(x: Int) -> Int => x\nfn f(y: Int) -> Int => y\nprint(f(1))`, good: `fn f(x: Int) -> Int => x\nfn f(x: String) -> String => x\nprint(f(1))` },
  E0221: { title: "a parameter needs a type", text: "Parameters of top-level functions, methods, extern functions and interfaces need a type when nothing in the program fixes it, and every call must agree on it. Write `name: Type`.", bad: `extern fn f(x) -> Int\nprint(1)`, good: `extern fn f(x: Int) -> Int\nprint(1)` },
  E0222: { title: "a function cannot be both async and gen", text: "Async generators are not supported yet. Make it a `gen fn` that yields values, or an `async fn` that returns a list." },
  E0223: { title: "a top-level let must bind a single name", text: "Declarations at the top of a module are named one at a time so other modules can import them. Destructure inside a function instead: `let (a, b) = pair()` in `fn main()`." },
  E0224: { title: "a variable needs an initial value", text: "Mycel has no uninitialised variables. Give a value (`let x = 0`), or make a `var` optional (`var x: Int?`), which starts as nil.", bad: `fn main() {\n  let x: Int\n  print(x)\n}`, good: `fn main() {\n  let x: Int = 0\n  print(x)\n}` },
  E0225: { title: "the initial value has the wrong type", text: "The value given to a field or variable does not match its declared type. Change the value or the type." },
  E0226: { title: "a member is declared twice", text: "A field, property, method or enum variant appears twice in the same type. Remove or rename one.", bad: `class P {\n  var x: Int = 0\n  var x: Int = 1\n}\nprint(1)`, good: `class P {\n  var x: Int = 0\n  var y: Int = 1\n}\nprint(1)` },
  E0227: { title: "struct fields are immutable", text: "A `struct` is a value: its fields are fixed when it is made (`let`). To change one, make a copy with `p.with(x: 2)`, or use a `class` for an object that changes.", bad: `struct P {\n  var x: Int\n}\nprint(1)`, good: `struct P {\n  let x: Int\n}\nprint(P(x: 1).with(x: 2).x)` },
  E0228: { title: "a subclass adds fields but has no initializer", text: "The memberwise initializer only works without a base class that needs its own arguments. Write an `init` that sets the new fields and calls `super.init(...)`." },
  E0229: { title: "an extension adds a member that already exists", text: "An `extend` block cannot replace a method the type already has. Give the new method a different name." },
  E0230: { title: "a type cannot be inferred", text: "Nothing in the program says what type this value has (an empty list or map that is never filled, a closure with untyped parameters that is never called). Add an annotation: `let xs: [Int] = []`.", bad: `fn main() {\n  let xs = []\n  print(xs)\n}`, good: `fn main() {\n  let xs: [Int] = []\n  print(xs)\n}` },
  E0231: { title: "nil alone has no type", text: "`nil` says there is no value, but not what kind of value is missing. Annotate: `var name: String? = nil`.", bad: `fn main() {\n  let x = nil\n  print(x)\n}`, good: `fn main() {\n  let x: String? = nil\n  print(x)\n}` },
  E0240: { title: "a member does not match its interface", text: "A method or property required by an interface exists but with a different type. Make the types match the interface's declaration." },
  E0241: { title: "the type does not implement the interface", text: "A type that declares an interface must provide every method and property it requires (the message lists the missing ones with their exact signatures).", bad: `interface Named {\n  fn name() -> String\n}\nclass Dog: Named { }\nprint(1)`, good: `interface Named {\n  fn name() -> String\n}\nclass Dog: Named {\n  fn name() -> String => "dog"\n}\nprint(Dog().name())` },
  E0242: { title: "a struct contains itself", text: "A struct is stored by value, so a struct inside itself would be infinitely large. Make the field optional in a `class`, or use an `enum` for recursive data." },
  E0243: { title: "override of a method the base class does not have", text: "`override` says this method replaces one in the base class, but there is none with this name and parameters. Remove `override` or fix the name.", bad: `class A {\n  fn hi() { }\n}\nclass B: A {\n  override fn hello() { }\n}\nprint(1)`, good: `class A {\n  fn hi() { }\n}\nclass B: A {\n  override fn hi() { }\n}\nprint(1)` },
  E0244: { title: "a method replaces a base method without override", text: "Replacing a base-class method must be marked `override`, so it never happens by accident (a typo or a new base method would otherwise silently change behaviour).", bad: `class A {\n  fn hi() { }\n}\nclass B: A {\n  fn hi() { }\n}\nprint(1)`, good: `class A {\n  fn hi() { }\n}\nclass B: A {\n  override fn hi() { }\n}\nprint(1)` },
  E0245: { title: "an override returns an incompatible type", text: "An override must return the base method's type (or a subtype), so code that calls through the base type still gets what it expects." },
  E0250: { title: "a gen function must return Gen<T>", text: "A `gen fn` produces values with `yield`; its return type is `Gen<T>` (or `Iterator<T>`/`Iterable<T>`), or leave it out.", bad: `gen fn nums() -> Int {\n  yield 1\n}\nprint(1)`, good: `gen fn nums() -> Gen<Int> {\n  yield 1\n}\nfor n in nums() { print(n) }` },
  E0251: { title: "duplicate parameter", text: "Two parameters of one function have the same name. Rename one.", bad: `fn f(a: Int, a: Int) -> Int => a\nprint(f(1, 2))`, good: `fn f(a: Int, b: Int) -> Int => a + b\nprint(f(1, 2))` },
  E0252: { title: "a function can end without returning its value", text: "Some path through the function reaches its end with no `return`, but the function promises a value. Add a `return` on that path (often the `else` of an `if`), or at the end.", bad: `fn sign(n: Int) -> String {\n  if n < 0 { return "-" }\n}\nprint(sign(1))`, good: `fn sign(n: Int) -> String {\n  if n < 0 { return "-" }\n  return "+"\n}\nprint(sign(1))` },
  E0253: { title: "an initializer does not set every field", text: "Every non-optional field without a default must be assigned in each `init`, so no object ever exists half-made.", bad: `class P {\n  var x: Int\n  init() { }\n}\nprint(1)`, good: `class P {\n  var x: Int\n  init() { self.x = 0 }\n}\nprint(P().x)` },
  E0254: { title: "an initializer must call super.init", text: "A subclass whose base class needs arguments must call `super.init(...)` in its `init`, so the base part is set up too." },
  E0260: { title: "the name is already declared in this scope", text: "Two `let`/`var` in the same block have the same name. Reuse the first with assignment (`x = ...` on a `var`), or pick a new name. An inner block may shadow an outer name.", bad: `fn main() {\n  let x = 1\n  let x = 2\n  print(x)\n}`, good: `fn main() {\n  var x = 1\n  x = 2\n  print(x)\n}` },
  E0261: { title: "break or continue outside of a loop", text: "`break` and `continue` only work inside `for` and `while`. To leave a function early, use `return`.", bad: `fn main() {\n  break\n}`, good: `fn main() {\n  for i in 0..3 { if i == 1 { break } }\n}` },
  E0262: { title: "only an Error can be thrown or caught", text: "Thrown values are `Error` (or a subclass) so `catch e: MyError` can be typed. Write `throw Error(\"message\")` or define `class MyError: Error { }`.", bad: `fn main() {\n  throw "oops"\n}`, good: `fn main() {\n  throw Error("oops")\n}` },
  E0263: { title: "a local function cannot be generic or a generator", text: "Functions declared inside another function are simple closures. Move a generic or `gen` function to the top level." },
  E0264: { title: "return outside of a function", text: "`return` leaves a function; at the top of a file there is none to leave. Remove it, or put the code in a function." },
  E0265: { title: "this kind of function cannot return a value", text: "A `gen fn` produces values with `yield` (a plain `return` just stops it), and an `init` always produces the new object.", bad: `gen fn nums() -> Gen<Int> {\n  return 1\n}\nprint(1)`, good: `gen fn nums() -> Gen<Int> {\n  yield 1\n  return\n}\nprint(1)` },
  E0266: { title: "return value does not fit the function", text: "Either the function declares a result and `return` gives none, or it returns nothing (`Void`) and `return` gives a value. Declare the return type `-> T` or return the right thing.", bad: `fn f() -> Int {\n  return\n}\nprint(f())`, good: `fn f() -> Int {\n  return 1\n}\nprint(f())` },
  E0267: { title: "this expression has no value", text: "The call returns `Void` (nothing), so there is nothing to store. Call it as a statement on its own line.", bad: `fn hello() { print("hi") }\nfn main() {\n  let x = hello()\n}`, good: `fn hello() { print("hi") }\nfn main() {\n  hello()\n}` },
  E0268: { title: "a let or parameter pattern can fail to match", text: "`let` and destructured parameters must always succeed. A pattern that can fail (an enum variant, a list of fixed length, a literal) needs `if let pattern = value { ... }` or `match`.", bad: `fn main() {\n  let [first, ..rest] = [1, 2, 3]\n  print(first)\n}`, good: `fn main() {\n  if let [first, ..rest] = [1, 2, 3] { print(first, rest) }\n}` },
  E0269: { title: "this catch clause can never run", text: "An earlier `catch` already handles every error this one would (for example `catch e` before `catch e: MyError`). Put the specific clauses first.", bad: `class Oops: Error { }\nfn main() {\n  try { throw Oops("x") } catch e { print(1) } catch e: Oops { print(2) }\n}`, good: `class Oops: Error { }\nfn main() {\n  try { throw Oops("x") } catch e: Oops { print(2) } catch e { print(1) }\n}` },
  E0270: { title: "no enclosing loop has this label", text: "`break name` and `continue name` name a loop around them, labeled `name: for ...` or `name: while ...`. Check the spelling, or label the loop. Labels do not reach into closures.", bad: `outer: for i in 0..3 {\n  for j in 0..3 { if j == 1 { break outr } }\n}`, good: `outer: for i in 0..3 {\n  for j in 0..3 { if j == 1 { break outer } }\n}` },
  E0271: { title: "a label is reused by a nested loop", text: "If an inner loop had the same label as an outer one, `break name` could mean either. Give each nested loop its own label.", bad: `rows: for i in 0..2 {\n  rows: for j in 0..2 { break rows }\n}`, good: `rows: for i in 0..2 {\n  cols: for j in 0..2 { break rows }\n}` },

  // ---------- expressions ----------
  E0300: { title: "type mismatch", text: "A value of one type is used where another is required. Nothing converts implicitly except an Int literal where a Float is expected. Convert explicitly (`n.toString()`, `s.toInt()`, `n.toFloat()`) or change the declared type.", bad: `let n: Int = "5"\nprint(n)`, good: `let n: Int = 5\nprint(n)` },
  E0301: { title: "the two branches have different types", text: "An `if` or `match` used as a value must give the same type from every branch, so the result has one type.", bad: `let x = if true { 1 } else { "one" }\nprint(x)`, good: `let x = if true { 1 } else { 0 }\nprint(x)` },
  E0310: { title: "integer literal too large", text: "`Int` is a signed 64-bit integer (at most 9223372036854775807). Use a Float literal like `1.0e30` for bigger, approximate numbers.", bad: `print(99999999999999999999)`, good: `print(99999999999999999999.0)` },
  E0311: { title: "this value cannot be put in a string", text: "A function or a `Void` result has no text form. Interpolate the value you mean: call the function, `f\"{f()}\"`.", bad: `fn hi() { }\nprint(f"{hi()}")`, good: `fn hi() -> String => "hi"\nprint(f"{hi()}")` },
  E0312: { title: "self is not available here", text: "`self` is the object a method was called on. It exists in methods, initializers and extensions, not in top-level functions or static members.", bad: `fn main() {\n  print(self)\n}`, good: `class C {\n  let n: Int = 1\n  fn show() { print(self.n) }\n}\nC().show()` },
  E0313: { title: "super must be followed by a member call", text: "`super` alone is not a value. Call a base-class member: `super.method(...)` or `super.init(...)`." },
  E0321: { title: "this cast can never succeed", text: "`as` converts between related types (a class and its subclass, `Any` and a concrete type). Unrelated types never convert; use a conversion method (`toString()`, `toInt()`).", bad: `let s = 5 as String\nprint(s)`, good: `let s = 5.toString()\nprint(s)` },
  E0330: { title: "yield outside a gen fn", text: "`yield` produces the next value of a generator. Declare the function `gen fn`.", bad: `fn nums() {\n  yield 1\n}\nprint(1)`, good: `gen fn nums() -> Gen<Int> {\n  yield 1\n}\nprint(1)` },
  E0331: { title: "yield needs a value", text: "Each `yield` produces one value: `yield x`. To stop the generator, use `return`." },
  E0332: { title: "await outside an async function", text: "`await` waits for a Task; only `async` code can wait. Make the function `async fn` (a file whose top-level statements await becomes async on its own).", bad: `import std.task\nfn f() {\n  await task.sleep(1)\n}\nprint(1)`, good: `import std.task\nasync fn f() {\n  await task.sleep(1)\n}\nprint(1)` },
  E0333: { title: "only a Task can be awaited", text: "`await` needs the result of an `async fn` call (a `Task<T>`). A plain value is already there; remove the `await`.", bad: `async fn main() {\n  let x = await 5\n  print(x)\n}`, good: `async fn main() {\n  let x = 5\n  print(x)\n}` },
  E0340: { title: "? used where errors cannot propagate", text: "`r?` returns early from the enclosing function with the error (or nil), so that function must itself return a `Result` or an optional. Otherwise handle the value with `match`, `if let` or `??`.", bad: `fn parse(s: String) -> Int {\n  return s.toInt()?\n}\nprint(parse("1"))`, good: `fn parse(s: String) -> Int? {\n  return s.toInt()?\n}\nprint(parse("1"))` },
  E0341: { title: "the error types do not match", text: "`?` passes the error up unchanged, so the error type of the value must fit the error type of the function's `Result`. Convert it first (`match` and wrap it), or change the function's error type." },
  E0342: { title: "? needs a Result or an optional", text: "`?` unwraps a `Result` or an optional. On a plain value there is nothing to unwrap; remove the `?`.", bad: `fn f() -> Int? {\n  let x = 5\n  return x?\n}\nprint(f())`, good: `fn f() -> Int? {\n  let x = 5\n  return x\n}\nprint(f())` },
  E0350: { title: "an overloaded function cannot be used as a value", text: "With several overloads, a bare name does not say which one you mean. Wrap it in a closure with typed parameters: `(x: Int) => f(x)`." },
  E0351: { title: "this name is a type or module, not a value", text: "A type is constructed by calling it (`Point(x: 1, y: 2)`) and a module is used through its members (`math.sqrt(2.0)`).", bad: `import std.math\nprint(math)`, good: `import std.math\nprint(math.sqrt(4.0))` },
  E0352: { title: "cannot find this name", text: "No variable, function, type or import has this name here. Check the spelling (the message suggests the nearest name) or declare it with `let`. Names declared inside a block or comprehension are not visible after it.", bad: `fn main() {\n  let count = 1\n  print(cuont)\n}`, good: `fn main() {\n  let count = 1\n  print(count)\n}` },
  E0360: { title: "this unary operator does not apply", text: "`!` needs a Bool (compare first: `x != 0`, `value != nil`), unary `-` needs a number, `~` an Int.", bad: `let n = 3\nprint(!n)`, good: `let n = 3\nprint(n != 0)` },
  E0361: { title: "?? needs an optional on the left", text: "`a ?? b` gives `a`'s value or, when it is nil, `b`. If `a` can never be nil, the `??` does nothing; remove it.", bad: `let n = 3\nprint(n ?? 0)`, good: `let n: Int? = nil\nprint(n ?? 0)` },
  E0362: { title: "these values cannot be compared", text: "`<`, `==` and friends compare values of the same type (numbers with numbers, strings with strings, or a type that defines `operator <`). Convert one side first.", bad: `print(1 == "1")`, good: `print(1 == "1".toInt())` },
  E0363: { title: "this operator does not apply to these types", text: "The operator is not defined for these operand types: `\"a\" + 1` mixes a String and an Int. Convert (`f\"a{1}\"`), or define `operator +` on your own type.", bad: `print("total: " + 5)`, good: `print(f"total: {5}")` },
  E0370: { title: "this cannot be assigned to", text: "The left side of `=` must be a variable, field, index or a tuple of those (`a, b = b, a`). A call or a literal cannot be assigned.", bad: `fn main() {\n  var a = 1\n  var b = 2\n  a, b = 3\n  print(a, b)\n}`, good: `fn main() {\n  var a = 1\n  var b = 2\n  a, b = 3, 4\n  print(a, b)\n}` },
  E0371: { title: "cannot assign to a constant", text: "`let` fixes a binding once. Declare it with `var` when it should change.", bad: `fn main() {\n  let n = 1\n  n = 2\n  print(n)\n}`, good: `fn main() {\n  var n = 1\n  n = 2\n  print(n)\n}` },
  E0372: { title: "cannot assign to this member", text: "A method, computed property without `set`, or `let` field cannot be assigned. Use `var` for a field that changes." },
  E0373: { title: "cannot modify a field of a struct", text: "Structs are immutable values. Make a changed copy with `p.with(field: value)`, or use a `class`.", bad: `struct P {\n  let x: Int\n}\nfn main() {\n  var p = P(x: 1)\n  p.x = 2\n}`, good: `struct P {\n  let x: Int\n}\nfn main() {\n  var p = P(x: 1)\n  p = p.with(x: 2)\n  print(p.x)\n}` },
  E0374: { title: "this value cannot be assigned through an index", text: "Only lists, maps and types with `operator []=` accept `x[i] = v`. Strings and tuples are not changed in place." },
  E0380: { title: "the member is private or protected", text: "`private` members are visible only inside their class, `protected` ones also in subclasses. Use a public method, or change the access modifier.", bad: `class Safe {\n  private var code: Int = 1\n}\nprint(Safe().code)`, good: `class Safe {\n  private var code: Int = 1\n  fn hint() -> Int => self.code % 10\n}\nprint(Safe().hint())` },
  E0381: { title: "?. or ?[ on a value that is not optional", text: "`?.` is for values that might be nil. On a value that is always there, use plain `.` or `[...]`.", bad: `let s = "hi"\nprint(s?.length)`, good: `let s = "hi"\nprint(s.length)` },
  E0382: { title: "the value might be nil", text: "An optional (`T?`) must be checked before you use it: `if let x = value { ... }`, `value ?? fallback`, `value?.member`, or `value!` when nil would be a bug (it panics).", bad: `fn main() {\n  let names: [String]? = ["a"]\n  print(names[0])\n}`, good: `fn main() {\n  let names: [String]? = ["a"]\n  if let ns = names { print(ns[0]) }\n}` },
  E0383: { title: "this value cannot be indexed", text: "`x[i]` works on lists, maps, strings, tuples (with a literal index) and types with `operator []`.", bad: `let n = 5\nprint(n[0])`, good: `let n = [5]\nprint(n[0])` },
  E0390: { title: "no such member", text: "The type has no field, method or property with this name. Check the spelling (the message suggests the nearest member) or `mycel doc` for the type.", bad: `print([1, 2].size)`, good: `print([1, 2].length)` },
  E0391: { title: "the type is not known yet", text: "A member is used on a value whose type the compiler has not worked out at this point (for example an untyped closure parameter). Annotate where the value is declared." },
  E0392: { title: "the tuple has no such element", text: "Tuple elements are numbered from 0: a pair has `.0` and `.1`.", bad: `let p = (1, 2)\nprint(p.2)`, good: `let p = (1, 2)\nprint(p.1)` },
  E0393: { title: "this value has no members", text: "Functions, `nil` and `Any` have no members to call. Call the function first, check the optional, or cast the `Any` (`x as? Int`)." },
  E0395: { title: "cannot tell which enum a leading-dot name belongs to", text: "`.Circle` takes its type from where it is used (an argument, a typed variable, a match arm). With no such context, name the type: `Shape.Circle`.", bad: `enum Shape {\n  Circle\n}\nfn main() {\n  let s = .Circle\n}`, good: `enum Shape {\n  Circle\n}\nfn main() {\n  let s: Shape = .Circle\n  print(s)\n}` },
  E0396: { title: "wrong payload for an enum variant", text: "A variant is constructed with exactly the values it declares: `Circle(r: Float)` needs one, a plain `None` takes none." },

  // ---------- calls ----------
  E0400: { title: "this value is not a function", text: "Only functions and closures can be called with `(...)`. A property is read without parentheses: `xs.length`, not `xs.length()`.", bad: `print([1, 2].length())`, good: `print([1, 2].length)` },
  E0401: { title: "too many arguments", text: "The call passes more arguments than the function takes. Remove the extra ones, or check that you are calling the function you mean.", bad: `fn f(a: Int) -> Int => a\nprint(f(1, 2))`, good: `fn f(a: Int) -> Int => a\nprint(f(1))` },
  E0402: { title: "no parameter with this name", text: "A named argument `name: value` must match a parameter name. The message suggests the nearest one.", bad: `fn f(count: Int) -> Int => count\nprint(f(cuont: 1))`, good: `fn f(count: Int) -> Int => count\nprint(f(count: 1))` },
  E0403: { title: "an argument is given twice", text: "One parameter received two values (positionally and by name, or by name twice). Pass it once." },
  E0404: { title: "missing argument", text: "A parameter without a default value got no argument. Pass it, or give the parameter a default (`count: Int = 1`).", bad: `fn f(a: Int, b: Int) -> Int => a + b\nprint(f(1))`, good: `fn f(a: Int, b: Int) -> Int => a + b\nprint(f(1, 2))` },
  E0405: { title: "no overload accepts these arguments", text: "The function has several versions and none takes these argument types. The message lists the candidates; convert an argument to match one." },
  E0406: { title: "wrong explicit type arguments", text: "`f<Int>(...)` passes type arguments explicitly; the count must match the function's type parameters." },
  E0410: { title: "this type cannot be constructed", text: "Interfaces describe behaviour and cannot be made directly; enums are made through their variants (`Shape.Circle(1.0)`); an alias is constructed through the type it names.", bad: `interface Shape {\n  fn area() -> Float\n}\nprint(Shape())`, good: `interface Shape {\n  fn area() -> Float\n}\nclass Sq: Shape {\n  fn area() -> Float => 1.0\n}\nprint(Sq().area())` },
  E0411: { title: "the type has no initializer", text: "This type (often a built-in or an extern class) cannot be constructed with `Type(...)`. Use the function or literal that makes one." },
  E0420: { title: "super in a class without a base class", text: "`super` refers to the base class. This class does not inherit from one." },
  E0421: { title: "super.init outside an initializer", text: "`super.init(...)` sets up the base part of a new object, so it can only be called inside `init`." },
  E0430: { title: "the closure takes the wrong number of parameters", text: "The place the closure is passed to calls it with a fixed number of values. `xs.map(x => ...)` gives one; `reduce(0, (acc, x) => ...)` gives two. To take one pair apart, destructure it: `((k, v)) => ...`.", bad: `print([(1, 2)].map((a, b) => a + b))`, good: `print([(1, 2)].map(((a, b)) => a + b))` },

  // ---------- loops and patterns ----------
  E0440: { title: "cannot loop over a value that might be nil", text: "Unwrap the optional first: `for x in items ?? [] { }` or `if let xs = items { for x in xs { } }`.", bad: `fn main() {\n  let xs: [Int]? = [1]\n  for x in xs { print(x) }\n}`, good: `fn main() {\n  let xs: [Int]? = [1]\n  for x in xs ?? [] { print(x) }\n}` },
  E0441: { title: "this value is not iterable", text: "`for` walks lists, sets, maps, ranges, strings, generators and types with `fn iter() -> Iterator<T>`. To count, use a range: `for i in 0..n`.", bad: `for i in 10 { print(i) }`, good: `for i in 0..10 { print(i) }` },
  E0450: { title: "the pattern's literal has the wrong type", text: "A literal or range in a pattern must have the type of the value being matched (`match n { 1 => ... }` for an Int, `\"a\" => ...` for a String).", bad: `let n = 1\nprint(match n { "one" => 1, _ => 0 })`, good: `let n = 1\nprint(match n { 1 => 1, _ => 0 })` },
  E0451: { title: "the pattern's shape cannot match this type", text: "A tuple pattern needs a tuple with the same number of elements, a list pattern a list, `Type{...}` that type. Check what the value is.", bad: `let p = (1, 2)\nprint(match p { (a, b, c) => a, _ => 0 })`, good: `let p = (1, 2)\nprint(match p { (a, b) => a + b })` },
  E0452: { title: "this type test can never succeed", text: "`is T` on a value whose type can never be `T` is always false. Check the type you meant." },
  E0453: { title: "alternatives of a | pattern cannot bind names", text: "In `A(x) | B(x)` each side would bind `x` differently. Write separate arms, or match without binding (`.A(_) | .B(_)`)." },
  E0454: { title: "not a variant of this enum", text: "The matched value is an enum without a variant of this name. Check the spelling (the message suggests the nearest variant)." },
  E0455: { title: "wrong number of fields in a variant pattern", text: "A variant pattern lists one sub-pattern per field (`Rect(w, h)` for `Rect(w: Float, h: Float)`), or `_` for ones you do not need." },
  E0460: { title: "the match does not cover every case", text: "`match` must handle every possible value so nothing falls through unnoticed (Rust's exhaustive match). The message lists the missing cases; add an arm for each, or `_ => ...` for the rest.", bad: `enum Light {\n  Red\n  Green\n}\nfn say(l: Light) -> String => match l { .Red => "stop" }\nprint(say(.Red))`, good: `enum Light {\n  Red\n  Green\n}\nfn say(l: Light) -> String => match l { .Red => "stop", .Green => "go" }\nprint(say(.Red))` },

  // ---------- warnings ----------
  W0101: { title: "unused variable", text: "The variable is declared but never read, which is often a typo or leftover. Remove it, or start its name with `_` to say it is unused on purpose.", bad: `fn main() {\n  let unused = 1\n}`, good: `fn main() {\n  let _unused = 1\n}` },
  W0102: { title: "unreachable code", text: "This code comes after a `return`, `throw`, `break` or `continue`, so it can never run. Remove it or move it before the jump.", bad: `fn f() -> Int {\n  return 1\n  print("never")\n}\nprint(f())`, good: `fn f() -> Int {\n  print("now")\n  return 1\n}\nprint(f())` },
  W0103: { title: "unnecessary !", text: "`!` unwraps an optional, but this value is not optional. Remove the `!`.", bad: `let n = 1\nprint(n!)`, good: `let n = 1\nprint(n)` },
  W0301: { title: "the Task from this async call is ignored", text: "The call starts work, but nothing waits for it and its errors would go unreported. Write `await call()` to wait, or `spawn call()` and keep the Task.", bad: `import std.task\nasync fn work() { await task.sleep(1) }\nasync fn main() {\n  work()\n}`, good: `import std.task\nasync fn work() { await task.sleep(1) }\nasync fn main() {\n  await work()\n}` },
};

export const EXPLANATIONS: Readonly<Record<string, Explanation>> = E;

/** "e300", "300", "E0300" and "e0300" all mean E0300; a bare number without a W means an error code. */
export function normalizeCode(raw: string): string {
  const m = /^([ew])?0*(\d{1,4})$/i.exec(raw.trim());
  if (!m) return raw.trim().toUpperCase();
  return (m[1] ?? "E").toUpperCase() + m[2].padStart(4, "0");
}

const indent = (s: string) => s.split("\n").map((l) => "    " + l).join("\n");

/** The text printed by `mycel explain <code>`, or undefined for an unknown code. */
export function explain(raw: string): string | undefined {
  const code = normalizeCode(raw);
  const x = E[code];
  if (!x) return undefined;
  let out = `${code}: ${x.title}\n\n${x.text}`;
  if (x.bad) out += `\n\nThis program gets ${code}:\n\n${indent(x.bad)}`;
  if (x.good) out += `\n\nFixed:\n\n${indent(x.good)}`;
  return out;
}

/** Unknown code: say so, and offer the nearest real code or the list. */
export function explainUnknown(raw: string): string {
  const code = normalizeCode(raw);
  // a mistyped number is closest by value within its letter (E0461 -> E0460), not by edit distance (that ties E0401)
  const m = /^([EW])(\d{4})$/.exec(code);
  const near = m ? Object.keys(E).filter((c) => c[0] === m[1]).sort((a, b) => Math.abs(+a.slice(1) - +m[2]) - Math.abs(+b.slice(1) - +m[2]))[0] : closest(code, Object.keys(E));
  return `mycel: no explanation for "${raw}"${near ? ` — did you mean \`mycel explain ${near}\`?` : ""} (\`mycel explain\` lists every code)`;
}

/** `mycel explain` with no code: every code and its title. */
export function explainList(): string {
  return "Every Mycel diagnostic code (`mycel explain <code>` for the long form):\n\n" + Object.entries(E).map(([c, x]) => `  ${c}  ${x.title}`).join("\n");
}

/** One line after compiler errors, like rustc's "For more information about this error, try `rustc --explain`". */
export function explainHint(codes: string[]): string | undefined {
  const known = [...new Set(codes)].filter((c) => E[c]);
  if (!known.length) return undefined;
  return `help: \`mycel explain ${known[0]}\` explains ${known.length === 1 ? "this error" : "the first error"} with an example`;
}
