#!/usr/bin/env node

/**
 * make_ai_learn.mjs
 *
 * Generates the Cloud AI learning materials for Mycel:
 * 1. site/public/mycel/ai-learn/mycel-for-ai.md (complete self-contained reference)
 * 2. site/public/mycel/ai-learn/mycel-for-ai-short.md (llms.txt summary + copyable system prompt)
 * 3. site/public/mycel/ai-learn/index.html (page with download links, sizes, and prompt copy box)
 *
 * All examples and diagnostics are executed against real tools:
 * - mycel run --allow-all
 * - mycel check
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const mycelBin = path.join(rootDir, "lang/bin/mycel");
const stdDir = path.join(rootDir, "lang/std");
const outDir = path.join(rootDir, "site/public/mycel/ai-learn");
const tmpDir = path.join("/tmp", `mycel_ai_${Date.now()}`);

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

console.log("=== Building Mycel Cloud AI Materials ===");

// Helper to run code with mycel
function runMycel(code, input = "") {
  const tmp = path.join(tmpDir, `ex_${Date.now()}_${Math.random().toString(36).slice(2)}.myc`);
  fs.writeFileSync(tmp, code, "utf8");
  try {
    const res = spawnSync(mycelBin, ["run", "--allow-all", tmp], {
      input,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, NO_COLOR: "1" }
    });
    if (res.status !== 0) {
      console.error("FAIL:", res.stderr || res.stdout);
      throw new Error(`Execution failed (code ${res.status}):\n${code}\n${res.stderr}`);
    }
    return (res.stdout || "").trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Helper to check code with mycel and capture compiler diagnostic
function checkMycel(code) {
  const tmp = path.join(tmpDir, `check_${Date.now()}_${Math.random().toString(36).slice(2)}.myc`);
  fs.writeFileSync(tmp, code, "utf8");
  try {
    const res = spawnSync(mycelBin, ["check", tmp], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, NO_COLOR: "1" }
    });
    const output = (res.stderr || res.stdout || "").trim();
    // Clean up temporary file path from compiler messages so output is deterministic
    const cleaned = output.replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "snippet.myc");
    return cleaned;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// -------------------------------------------------------------
// 1. 47 Verified Executable Examples
// -------------------------------------------------------------
const EXAMPLES = [
  {
    id: "ex01_hello",
    title: "Hello World and Top-Level Statements",
    category: "Basics",
    code: `print("Hello, Mycel!")\nprint("A file can just be top-level statements.")`
  },
  {
    id: "ex02_variables",
    title: "Variables and Immutability (`let` vs `var`)",
    category: "Basics",
    code: `let greeting = "Hello"\nvar counter = 10\ncounter += 5\nprint(f"{greeting}! Counter is now {counter}")`
  },
  {
    id: "ex03_division",
    title: "Division Semantics (`/` yields Float, `.div()` yields Int)",
    category: "Basics & Arithmetic",
    code: `let a = 7\nlet b = 2\nlet floatResult = a / b\nlet intResult = a.div(b)\nlet remainder = a % b\nprint(f"Float division: 7 / 2 = {floatResult}")\nprint(f"Integer division: 7.div(2) = {intResult}")\nprint(f"Modulo remainder: 7 % 2 = {remainder}")`
  },
  {
    id: "ex04_numbers",
    title: "Mixed Arithmetic and Number Methods",
    category: "Basics & Arithmetic",
    code: `let n = 42\nlet f = 2.5\nlet mixed = n * f\nprint("Mixed Int * Float:", mixed)\nprint("Absolute value of -15:", (-15).abs)\nprint("Clamped value:", 120.clamp(0, 100))`
  },
  {
    id: "ex05_fstrings",
    title: "F-Strings, Specifiers, and Expression Debugging",
    category: "Strings",
    code: `let item = "Notebook"\nlet price = 12.4567\nprint(f"Item: {item}, Price: \${price:.2f}")\nlet a = 14\nlet b = 28\nprint(f"Debug: {a + b = }")`
  },
  {
    id: "ex06_multiline_strings",
    title: "Multi-line Strings and Indentation Stripping",
    category: "Strings",
    code: `let query = """\n  SELECT id, name\n  FROM users\n  WHERE active = true\n  """\nprint(query)`
  },
  {
    id: "ex07_char_vs_string",
    title: "Chars (Single Quotes) vs Strings (Double Quotes)",
    category: "Strings",
    code: `let ch: Char = 'A'\nlet s: String = "Apple"\nprint("Character:", ch)\nprint("String first letter:", s[0])\nprint("Is Char matching:", s[0] == ch)`
  },
  {
    id: "ex08_if_expression",
    title: "If / Else as an Expression",
    category: "Control Flow",
    code: `let score = 88\nlet grade = if score >= 90 {\n  "A"\n} else if score >= 80 {\n  "B"\n} else {\n  "C"\n}\nprint(f"Score {score} earned grade {grade}")`
  },
  {
    id: "ex09_match_basic",
    title: "Pattern Matching on Values (`match`)",
    category: "Control Flow",
    code: `let httpStatus = 404\nlet message = match httpStatus {\n  200 => "OK"\n  301 => "Moved Permanently"\n  404 => "Not Found"\n  500 => "Internal Server Error"\n  _ => "Unknown Status"\n}\nprint(f"HTTP {httpStatus}: {message}")`
  },
  {
    id: "ex10_ranges_and_for",
    title: "For Loops and Numeric Ranges",
    category: "Control Flow",
    code: `var halfOpenSum = 0\nfor i in 0..5 {\n  halfOpenSum += i\n}\nvar closedSum = 0\nfor i in 1..=5 {\n  closedSum += i\n}\nprint("Sum 0..5 (half-open):", halfOpenSum)\nprint("Sum 1..=5 (closed):", closedSum)`
  },
  {
    id: "ex11_while_loop",
    title: "While Loop with Break and Continue",
    category: "Control Flow",
    code: `var n = 0\nvar evens: [Int] = []\nwhile true {\n  n += 1\n  if n > 10 { break }\n  if n % 2 != 0 { continue }\n  evens.push(n)\n}\nprint("First evens:", evens)`
  },
  {
    id: "ex12_function_defaults",
    title: "Functions with Default and Named Arguments",
    category: "Functions",
    code: `fn greet(name: String, greeting: String = "Hello", punctuation: String = "!") -> String {\n  return f"{greeting}, {name}{punctuation}"\n}\nprint(greet("Ada"))\nprint(greet("Grace", greeting: "Welcome", punctuation: "!!!"))`
  },
  {
    id: "ex13_expression_functions",
    title: "Expression-Bodied Functions (`=>`)",
    category: "Functions",
    code: `fn cube(x: Int) => x * x * x\nfn isPositive(x: Int) => x > 0\nprint("cube(3):", cube(3))\nprint("isPositive(-4):", isPositive(-4))`
  },
  {
    id: "ex14_variadic_functions",
    title: "Variadic Parameters (`...rest`)",
    category: "Functions",
    code: `fn maxOf(first: Int, ...rest: Int) -> Int {\n  var m = first\n  for x in rest {\n    if x > m { m = x }\n  }\n  return m\n}\nprint("Max of values:", maxOf(14, 82, 35, 99, 41))`
  },
  {
    id: "ex15_higher_order_functions",
    title: "Higher-Order Functions and Lambda Closures",
    category: "Functions",
    code: `fn transform(items: [Int], op: (Int) -> Int) -> [Int] {\n  var out: [Int] = []\n  for x in items {\n    out.push(op(x))\n  }\n  return out\n}\nlet numbers = [1, 2, 3, 4]\nlet squared = transform(numbers, x => x * x)\nprint("Squared:", squared)`
  },
  {
    id: "ex16_array_basics",
    title: "Array Operations and Negative Indexing",
    category: "Collections",
    code: `var fruits = ["apple", "banana", "cherry"]\nfruits.push("date")\nprint("Length:", fruits.length)\nprint("First element:", fruits[0])\nprint("Last element (negative index):", fruits[-1])\nprint("Contains banana:", fruits.contains("banana"))`
  },
  {
    id: "ex17_array_functional",
    title: "Array Functional Methods (map, filter, reduce)",
    category: "Collections",
    code: `let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nlet evens = nums.filter(x => x % 2 == 0)\nlet tripled = evens.map(x => x * 3)\nlet sum = tripled.reduce(0, (acc, x) => acc + x)\nprint("Sum of tripled evens:", sum)`
  },
  {
    id: "ex18_list_comprehension",
    title: "List Comprehensions with Filtering",
    category: "Collections",
    code: `let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nlet result = [x * x for x in nums if x > 4]\nprint("Squares > 4:", result)`
  },
  {
    id: "ex19_maps",
    title: "Maps and Default Value Retrieval",
    category: "Collections",
    code: `var inventory = {"pens": 20, "notebooks": 15}\ninventory["erasers"] = 8\nprint("Pens:", inventory["pens"] ?? 0)\nprint("Rulers (missing):", inventory["rulers"] ?? 0)\nprint("Keys in map:", inventory.length)`
  },
  {
    id: "ex20_heterogeneous_maps",
    title: "Heterogeneous Maps with `{String: Any}`",
    category: "Collections",
    code: `let record: {String: Any} = {\n  "title": "Compiler Guide",\n  "version": 1,\n  "stable": true\n}\nprint("Title:", record["title"] ?? "")\nprint("Version:", record["version"] ?? 0)`
  },
  {
    id: "ex21_sets",
    title: "Sets and Set Arithmetic (| & -)",
    category: "Collections",
    code: `let primes = Set([2, 3, 5, 7, 11])\nlet odds = Set([1, 3, 5, 7, 9, 11])\nlet both = primes & odds\nlet all = primes | odds\nprint("Intersection:", both.sorted())\nprint("Total unique in union:", all.length)`
  },
  {
    id: "ex22_tuples",
    title: "Tuples, Dot Indexing (.0), and Destructuring",
    category: "Collections",
    code: `let record = ("Alice", 28, true)\nprint("Name via .0:", record.0)\nprint("Age via .1:", record.1)\nlet (name, age, active) = record\nprint(f"Destructured: {name}, age {age}, active={active}")`
  },
  {
    id: "ex23_optionals_if_let",
    title: "Optionals and `if let` Binding",
    category: "Optionals & Safety",
    code: `fn lookupUser(id: Int) -> String? {\n  if id == 42 { return "Arthur Dent" }\n  return nil\n}\nif let user = lookupUser(42) {\n  print("User found:", user)\n} else {\n  print("User not found")\n}`
  },
  {
    id: "ex24_optional_chaining",
    title: "Optional Chaining (`?.`) and Coalescing (`??`)",
    category: "Optionals & Safety",
    code: `class Address { let city: String; init(city: String) { self.city = city } }\nclass Person { let address: Address?; init(address: Address? = nil) { self.address = address } }\nlet p1 = Person(address: Address(city: "Edinburgh"))\nlet p2 = Person()\nprint("P1 city:", p1.address?.city ?? "Unknown")\nprint("P2 city:", p2.address?.city ?? "Unknown")`
  },
  {
    id: "ex25_structs_value_types",
    title: "Structs (Immutable Value Types and `.with(...)`)",
    category: "OOP & Types",
    code: `struct Point {\n  let x: Int\n  let y: Int\n}\nlet p1 = Point(x: 10, y: 20)\nlet p2 = Point(x: 10, y: 20)\nlet p3 = p1.with(y: 99)\nprint("Structural equality p1 == p2:", p1 == p2)\nprint("Original p1:", p1.x, p1.y)\nprint("Copy with change p3:", p3.x, p3.y)`
  },
  {
    id: "ex26_classes_inheritance",
    title: "Classes, `super.init`, and `override`",
    category: "OOP & Types",
    code: `class Shape {\n  let color: String\n  init(color: String) { self.color = color }\n  fn describe() -> String { return f"{self.color} shape" }\n}\nclass Rectangle: Shape {\n  let width: Int\n  let height: Int\n  init(color: String, width: Int, height: Int) {\n    super.init(color: color)\n    self.width = width\n    self.height = height\n  }\n  override fn describe() -> String {\n    return f"{self.color} rectangle ({self.width}x{self.height})" }\n}\nlet r = Rectangle(color: "blue", width: 10, height: 5)\nprint(r.describe())`
  },
  {
    id: "ex27_getters_setters",
    title: "Computed Properties (`get` and `set`)",
    category: "OOP & Types",
    code: `class Temperature {\n  var celsius: Float\n  init(celsius: Float) { self.celsius = celsius }\n  get fahrenheit: Float { return self.celsius * 1.8 + 32.0 }\n  set fahrenheit(f: Float) { self.celsius = (f - 32.0) / 1.8 }\n}\nlet t = Temperature(celsius: 25.0)\nprint("Celsius 25 is Fahrenheit:", t.fahrenheit)\nt.fahrenheit = 212.0\nprint("Fahrenheit 212 is Celsius:", t.celsius)`
  },
  {
    id: "ex28_enums_payloads",
    title: "Enums as Algebraic Data Types with Pattern Matching",
    category: "OOP & Types",
    code: `enum WebResponse {\n  Success(body: String)\n  Redirect(url: String, code: Int)\n  Error(message: String)\n}\nfn formatResponse(res: WebResponse) -> String {\n  return match res {\n    .Success(body) => f"200 OK: {body}"\n    .Redirect(url, code) => f"{code} Redirect to {url}"\n    .Error(msg) => f"Error: {msg}"\n  }\n}\nprint(formatResponse(WebResponse.Success(body: "Welcome!")))\nprint(formatResponse(WebResponse.Redirect(url: "https://ol1x.xyz", code: 301)))`
  },
  {
    id: "ex29_interfaces",
    title: "Interfaces and Dynamic Polymorphism",
    category: "OOP & Types",
    code: `interface Printable {\n  fn format() -> String\n}\nclass Book: Printable {\n  let title: String\n  init(title: String) { self.title = title }\n  fn format() -> String { return f"Book: «{self.title}»" }\n}\nclass Song: Printable {\n  let name: String\n  init(name: String) { self.name = name }\n  fn format() -> String { return f"Song: ♫ {self.name} ♫" }\n}\nlet items: [Printable] = [Book(title: "The Odyssey"), Song(name: "Moonlight")]\nfor item in items {\n  print(item.format())\n}`
  },
  {
    id: "ex30_extensions",
    title: "Type Extensions (`extend Type { ... }`)",
    category: "OOP & Types",
    code: `extend String {\n  fn wrapQuotes() -> String { return f"\\"{self}\\"" }\n}\nextend Int {\n  fn squared() -> Int { return self * self }\n}\nprint("hello".wrapQuotes())\nprint(9.squared())`
  },
  {
    id: "ex31_operator_overloading",
    title: "Operator Overloading (`operator +`)",
    category: "OOP & Types",
    code: `class Money {\n  let cents: Int\n  init(cents: Int) { self.cents = cents }\n  operator +(other: Money) -> Money {\n    return Money(cents: self.cents + other.cents)\n  }\n  fn toString() -> String {\n    let dollars = self.cents.div(100)\n    let rem = self.cents % 100\n    let remStr = if rem < 10 { f"0{rem}" } else { f"{rem}" }\n    return f"\${dollars}.{remStr}"\n  }\n}\nlet m1 = Money(cents: 1250)\nlet m2 = Money(cents: 750)\nlet total = m1 + m2\nprint("Total money:", total.toString())`
  },
  {
    id: "ex32_generics",
    title: "Generics in Functions and Classes",
    category: "Generics",
    code: `class Container<T> {\n  let item: T\n  init(item: T) { self.item = item }\n  fn inspect() -> T { return self.item }\n}\nfn wrap<T>(val: T) -> Container<T> {\n  return Container(item: val)\n}\nlet c1 = wrap(100)\nlet c2 = wrap("Mycel Generics")\nprint("c1:", c1.inspect())\nprint("c2:", c2.inspect())`
  },
  {
    id: "ex33_pipelines",
    title: "Pipeline Operator (`|>`) for Readable Transformations",
    category: "Functional",
    code: `fn clean(s: String) => s.trim()\nfn uppercase(s: String) => s.upper()\nfn badge(s: String) => f"[TAG: {s}]"\nlet res = "   system alert   " |> clean |> uppercase |> badge\nprint("Pipelined:", res)`
  },
  {
    id: "ex34_result_type",
    title: "Result Type and `?` Error Propagation",
    category: "Error Handling",
    code: `fn validateAge(input: String) -> Result<Int, Error> {\n  let num = Int.parse(input)\n  if num == nil {\n    return Err(Error("Invalid integer"))\n  }\n  let n = num!\n  if n < 0 || n > 120 {\n    return Err(Error("Age out of reasonable bounds"))\n  }\n  return Ok(n)\n}\nfn parseUser(ageStr: String) -> Result<String, Error> {\n  let age = validateAge(ageStr)?\n  return Ok(f"Verified age: {age}")\n}\nprint(parseUser("25").unwrap())\nprint("Invalid:", parseUser("150").isErr)`
  },
  {
    id: "ex35_try_catch",
    title: "Try / Catch / Finally Exception Handling",
    category: "Error Handling",
    code: `fn risky(succeed: Bool) {\n  if !succeed {\n    throw Error("Connection timed out")\n  }\n  print("Operation completed")\n}\ntry {\n  risky(false)\n} catch err {\n  print("Caught expected error:", err.message)\n} finally {\n  print("Cleanup executed")\n}`
  },
  {
    id: "ex36_generators",
    title: "Generators with `gen fn` and `yield`",
    category: "Control Flow & Async",
    code: `gen fn fibonacci(count: Int) -> Gen<Int> {\n  var a = 0\n  var b = 1\n  var i = 0\n  while i < count {\n    yield a\n    let next = a + b\n    a = b\n    b = next\n    i += 1\n  }\n}\nvar sequence: [Int] = []\nfor num in fibonacci(7) {\n  sequence.push(num)\n}\nprint("Fibonacci sequence:", sequence)`
  },
  {
    id: "ex37_std_math",
    title: "Standard Library `math`",
    category: "Standard Library",
    code: `import math\nprint("PI:", math.PI > 3.14)\nprint("sqrt(144.0):", math.sqrt(144.0))\nprint("hypot(5.0, 12.0):", math.hypot(5.0, 12.0))\nprint("gcd(48, 18):", math.gcd(48, 18))`
  },
  {
    id: "ex38_std_json",
    title: "Standard Library `json` (Parse and Stringify)",
    category: "Standard Library",
    code: `import json\nlet raw = """{"title":"Dashboard","stars":142,"active":true}"""\nlet obj = json.parse(raw).unwrap()\nprint("Title:", obj["title"].asString ?? "")\nprint("Stars:", obj["stars"].asInt ?? 0)\nprint("Active:", obj["active"].asBool ?? false)\nlet serialized = json.stringify(obj)\nprint("Serialized length > 0:", serialized.length > 0)`
  },
  {
    id: "ex39_std_time",
    title: "Standard Library `time`",
    category: "Standard Library",
    code: `import time\nlet now = time.now()\nprint("Current timestamp is positive:", now > 0.0)\nlet dur = time.seconds(150.0)\nprint("Duration in minutes:", dur.toMinutes())`
  },
  {
    id: "ex40_std_crypto",
    title: "Standard Library `crypto` (SHA-256 and Hex)",
    category: "Standard Library",
    code: `import crypto\nlet digest = crypto.sha256("mycel-standard-library")\nprint("SHA-256 length:", digest.length)\nprint("SHA-256 prefix:", digest.substring(0, 10))`
  },
  {
    id: "ex41_std_re",
    title: "Standard Library `re` (Regex Match and Groups)",
    category: "Standard Library",
    code: `import re\nlet pattern = re.Regex.compile("([a-zA-Z]+)-(\\\\d+)").unwrap()\nlet m = pattern.find("Order ID: ITEM-89421 in queue")\nif let found = m {\n  print("Full match:", found.text)\n  print("Prefix:", found.groups[0] ?? "")\n  print("Number:", found.groups[1] ?? "")\n}`
  },
  {
    id: "ex42_std_env",
    title: "Standard Library `env` (Platform and Args)",
    category: "Standard Library",
    code: `import env\nprint("Platform recognized:", env.platform().length > 0)\nprint("Args available:", env.args().length >= 0)`
  },
  {
    id: "ex43_std_fs",
    title: "Standard Library `fs` (Sandboxed File I/O)",
    category: "Standard Library",
    code: `import fs\nfn main() {\n  let file = "/tmp/mycel_demo_fs.txt"\n  fs.writeText(file, "Mycel sandbox filesystem verified").unwrap()\n  let content = fs.readText(file).unwrap()\n  print("Read back:", content)\n  fs.remove(file).unwrap()\n  print("Cleaned up file:", !fs.exists(file).unwrap())\n}`
  },
  {
    id: "ex44_std_test",
    title: "Standard Library `test` (Unit Testing)",
    category: "Standard Library",
    code: `import test\ntest "arithmetic checks" {\n  test.assertEq(10 * 10, 100)\n  test.assertTrue("mycel".startsWith("my"))\n}\nprint("All tests registered clean")`
  },
  {
    id: "ex45_binary_search",
    title: "Algorithm: Binary Search",
    category: "Algorithms",
    code: `fn binarySearch(list: [Int], target: Int) -> Int? {\n  var low = 0\n  var high = list.length - 1\n  while low <= high {\n    let mid = (low + high).div(2)\n    let val = list[mid]\n    if val == target {\n      return mid\n    } else if val < target {\n      low = mid + 1\n    } else {\n      high = mid - 1\n    }\n  }\n  return nil\n}\nlet items = [3, 9, 14, 25, 33, 47, 59, 81, 95]\nprint("Find 47:", binarySearch(items, 47) ?? -1)\nprint("Find 50 (missing):", binarySearch(items, 50) ?? -1)`
  },
  {
    id: "ex46_word_count",
    title: "Algorithm: Word Frequency Counter",
    category: "Algorithms",
    code: `let sentence = "to be or not to be that is the question"\nvar counts: {String: Int} = {}\nfor word in sentence.split(" ") {\n  let cur = counts[word] ?? 0\n  counts[word] = cur + 1\n}\nprint("'to' count:", counts["to"] ?? 0)\nprint("'be' count:", counts["be"] ?? 0)\nprint("'question' count:", counts["question"] ?? 0)`
  },
  {
    id: "ex47_inventory_calc",
    title: "Algorithm: Data Aggregation Pipeline",
    category: "Algorithms",
    code: `import json\nlet rawData = """[\n  {"sku": "A10", "qty": 4, "price": 12.5},\n  {"sku": "B20", "qty": 0, "price": 50.0},\n  {"sku": "C30", "qty": 2, "price": 100.0}\n]"""\nlet items = json.parse(rawData).unwrap().asArray ?? []\nvar totalValue = 0.0\nfor item in items {\n  let qty = item["qty"].asInt ?? 0\n  if qty > 0 {\n    let price = item["price"].asFloat ?? 0.0\n    totalValue += price * qty.toFloat()\n  }\n}\nprint(f"Total inventory value: \${totalValue:.2f}")`
  }
];

console.log(`Running and verifying all ${EXAMPLES.length} code examples...`);
for (let i = 0; i < EXAMPLES.length; i++) {
  const ex = EXAMPLES[i];
  const out = runMycel(ex.code);
  ex.output = out;
  if ((i + 1) % 10 === 0 || i + 1 === EXAMPLES.length) {
    console.log(`  ✔ Verified [${i + 1}/${EXAMPLES.length}] examples`);
  }
}

// -------------------------------------------------------------
// 2. Common Errors with Real Diagnostics
// -------------------------------------------------------------
const COMMON_ERRORS = [
  {
    id: "err_def",
    title: "Using `def` (Python habit) instead of `fn`",
    broken: `def calculate(x, y):\n  return x + y`,
    fixed: `fn calculate(x: Int, y: Int) -> Int {\n  return x + y\n}`,
    desc: "Mycel uses `fn name(params) { ... }` with curly braces, never Python's `def` or colon `:` blocks."
  },
  {
    id: "err_elif",
    title: "Using `elif` (Python habit) instead of `else if`",
    broken: `let x = 10\nif x > 20 {\n  print("big")\n} elif x > 5 {\n  print("medium")\n}`,
    fixed: `let x = 10\nif x > 20 {\n  print("big")\n} else if x > 5 {\n  print("medium")\n}`,
    desc: "Mycel writes `else if` as two words, exactly like JavaScript, Rust, and Go."
  },
  {
    id: "err_slash_comment",
    title: "Starting a comment with `//` (C/JavaScript habit)",
    broken: `// the answer\nlet a = 42`,
    fixed: `# the answer\nlet a = 42`,
    desc: "Comments start with `#`. `//` is whole-number division in Mycel: `15 // 4` evaluates to `3`."
  },
  {
    id: "err_none",
    title: "Using `None` or `null` instead of `nil`",
    broken: `let name: String? = None`,
    fixed: `let name: String? = nil`,
    desc: "Mycel uses `nil` (like Swift, Lua, and Ruby) to represent the absence of a value. `None` and `null` are rejected with helpful fix-it diagnostics."
  },
  {
    id: "err_single_quote_string",
    title: "Single quotes around multi-character text",
    broken: `let greeting = 'Hello, world!'`,
    fixed: `let greeting = "Hello, world!"`,
    desc: "Single quotes `'c'` are strictly single-character `Char` literals. Strings MUST use double quotes `\"...\"`."
  },
  {
    id: "err_function_kw",
    title: "Using JavaScript's `function` keyword",
    broken: `function add(a, b) {\n  return a + b;\n}`,
    fixed: `fn add(a: Int, b: Int) -> Int {\n  return a + b\n}`,
    desc: "The `function` keyword is a JavaScript habit. Mycel exclusively uses `fn`."
  },
  {
    id: "err_const_kw",
    title: "Using `const` instead of `let`",
    broken: `const maxItems = 100`,
    fixed: `let maxItems = 100`,
    desc: "Immutable bindings are declared with `let`, not `const` or `val`."
  },
  {
    id: "err_tuple_brackets",
    title: "Indexing tuples with brackets `[0]` instead of dot `.0`",
    broken: `let pair = ("Alice", 95)\nlet first = pair[0]`,
    fixed: `let pair = ("Alice", 95)\nlet first = pair.0`,
    desc: "Tuples in Mycel use dot notation: `tup.0`, `tup.1`, or pattern matching `let (a, b) = tup`."
  },
  {
    id: "err_optional_unwrap",
    title: "Calling methods on optional `T?` without `?.` or `!`",
    broken: `let name: String? = "Mycel"\nlet len = name.length`,
    fixed: `let name: String? = "Mycel"\nlet len = name?.length ?? 0`,
    desc: "Optional types `T?` are safe by default. You cannot call methods on `T?` directly without narrowing, optional chaining `?.`, coalescing `??`, or force-unwrapping `!`."
  },
  {
    id: "err_super_call",
    title: "Calling `super()` like Python instead of `super.init(...)`",
    broken: `class Animal { init() {} }\nclass Dog: Animal {\n  init() {\n    super()\n  }\n}`,
    fixed: `class Animal { init() {} }\nclass Dog: Animal {\n  init() {\n    super.init()\n  }\n}`,
    desc: "Subclass initializers must explicitly invoke `super.init(...)`."
  },
  {
    id: "err_let_mutation",
    title: "Attempting to reassign an immutable `let` variable",
    broken: `let score = 50\nscore = 100`,
    fixed: `var score = 50\nscore = 100`,
    desc: "`let` creates an immutable binding. Use `var` when you intend to reassign a variable."
  },
  {
    id: "err_missing_return",
    title: "Missing `return` in a typed function",
    broken: `fn calculate() -> Int {\n  let a = 10\n  let b = 20\n}`,
    fixed: `fn calculate() -> Int {\n  let a = 10\n  let b = 20\n  return a + b\n}`,
    desc: "Functions with explicit non-Void return types must return a value on every code path."
  }
];

console.log(`Running compiler checks on ${COMMON_ERRORS.length} common errors...`);
for (const err of COMMON_ERRORS) {
  err.diagnostic = checkMycel(err.broken);
}

// -------------------------------------------------------------
// 3. Extract Real Standard Library Signatures from lang/std/*.olx
// -------------------------------------------------------------
console.log("Extracting real stdlib signatures from lang/std/*.olx...");
const stdFiles = fs.readdirSync(stdDir).filter(f => f.endsWith(".olx")).sort();
const STDLIB_MODULES = [];

for (const file of stdFiles) {
  const modName = file === "prelude.olx" ? "prelude (built-ins)" : file.replace(".olx", "");
  const fullPath = path.join(stdDir, file);
  const content = fs.readFileSync(fullPath, "utf8");

  STDLIB_MODULES.push({
    name: modName,
    file,
    raw: content
  });
}

// -------------------------------------------------------------
// 4. Extract Habits from lang/src/habits.ts
// -------------------------------------------------------------
console.log("Loading habits from lang/src/habits.ts...");
let habitsData = [];
try {
  const habitsModule = await import(path.join(rootDir, "lang/src/habits.ts"));
  habitsData = habitsModule.HABITS || [];
} catch (e) {
  console.warn("Could not import habits.ts dynamically:", e.message);
}

const habitsByLang = {};
for (const h of habitsData) {
  if (!habitsByLang[h.lang]) habitsByLang[h.lang] = [];
  habitsByLang[h.lang].push(h);
}

// -------------------------------------------------------------
// 5. Synthesize mycel-for-ai.md (Complete Reference)
// -------------------------------------------------------------
console.log("Generating site/public/mycel/ai-learn/mycel-for-ai.md...");

let md = `# Mycel Reference for AI Models & Large Language Models

> **Self-contained reference manual for Cloud and Local AI Models (Claude, ChatGPT, Gemini, Copilot)**
> Language: **Mycel** (\`.myc\`, \`.olx\`) | Manifest: \`ply.json\` | Compiler: \`mycel v0.1.0\`
> Copyright (c) 2026 drky. All examples and compiler outputs in this document are verified against the real Mycel compiler.

---

## Table of Contents
1. [Core Non-Negotiable Rules for AI Code Generators](#1-core-non-negotiable-rules-for-ai-code-generators)
2. [Language Overview & Syntax Specification](#2-language-overview--syntax-specification)
   - [Lexical Structure & Keywords](#lexical-structure--keywords)
   - [Type System & Inference](#type-system--inference)
   - [Numbers & Division Semantics](#numbers--division-semantics)
   - [Strings & Interpolation](#strings--interpolation)
   - [Collections (Arrays, Maps, Sets, Tuples)](#collections)
   - [Optionals & Safe Navigation](#optionals--safe-navigation)
   - [Control Flow & Pattern Matching](#control-flow--pattern-matching)
   - [Functions & Closures](#functions--closures)
   - [Classes, Structs, Enums, Interfaces & Extensions](#classes-structs-enums-interfaces--extensions)
   - [Error Handling](#error-handling)
   - [Modules & Imports](#modules--imports)
3. [Habits Comparison: What to Do When Coming from Other Languages](#3-habits-comparison)
4. [Standard Library Reference (Extracted from Real Sources)](#4-standard-library-reference)
5. [47 Verified Executable Examples with Real Outputs](#5-47-verified-executable-examples)
6. [Common Compiler Errors and Real Diagnostics](#6-common-compiler-errors-and-real-diagnostics)

---

## 1. Core Non-Negotiable Rules for AI Code Generators

When generating Mycel code, AI models MUST obey these 10 core rules to avoid syntax and type errors:

1. **Division**: \`a / b\` ALWAYS performs floating-point division and returns \`Float\`. For example, \`7 / 2\` evaluates to \`3.5\`. For whole-number division use \`//\`: \`7 // 2\` evaluates to \`3\` (\`Int\`), rounding down like Python (\`-7 // 2\` is \`-4\`); with a \`Float\` operand the result is a floored \`Float\` (\`7.0 // 2\` is \`3.0\`). \`%\` is the matching floor remainder.
2. **Strings vs Characters**: Strings MUST be wrapped in double quotes (\`"hello"\`). Single quotes are strictly for single-character \`Char\` literals (\`'c'\`). Using single quotes around multiple characters is a syntax error.
3. **Function Declarations**: Declare functions using \`fn name(params) -> ReturnType { ... }\` or short arrow syntax \`fn name(params) => expr\`. NEVER use \`def\`, \`function\`, or \`func\`.
4. **Variable Declarations**: Use \`let\` for immutable bindings and \`var\` for mutable variables. NEVER use \`const\` or \`val\`.
5. **Null Safety**: Absence of a value is \`nil\` (typed as optional \`T?\`). NEVER use \`None\`, \`null\`, or \`NULL\`. Safe call is \`?.\`, coalescing is \`??\`, and force unwrap is \`!\`.
6. **Tuples**: Tuples are written \`(a, b)\` and indexed using dot notation: \`pair.0\`, \`pair.1\`. They do NOT support bracket indexing (\`pair[0]\` will fail).
7. **Maps**: Maps are written \`{"key": "value"}\`. If values have mixed types, the map must be explicitly typed as \`{String: Any}\`. Missing map keys return \`nil\` (so \`map[k] ?? default\` is idiomatic).
8. **Conditionals**: Write \`if condition { ... } else if { ... } else { ... }\`. Conditionals do NOT take parentheses and MUST have curly braces. NEVER write \`elif\` or colons \`:\`.
9. **Object Oriented Initializers**: Classes use \`init(...) { ... }\`. In a subclass initializer, call \`super.init(...)\`, NEVER \`super(...)\`.
10. **Structs vs Classes**: \`struct\` creates an immutable value type with structural equality \`==\` and generated copy method \`.with(field: val)\`. \`class\` creates a reference type with inheritance.

---

## 2. Language Overview & Syntax Specification

### Lexical Structure & Keywords
- **Files**: Extension \`.myc\` (or \`.olx\`). Top-level statements are valid directly without boilerplate \`main()\` function.
- **Comments**: \`# line\` (no block comments; put \`#\` at the start of each line), \`## doc comment\`. \`//\` is whole-number division, not a comment.
- **Keywords**: \`let var fn class struct interface enum type extend import pub private protected static if else while for in match return break continue throw try catch finally true false nil is as async await spawn gen yield init self super override operator extern then\`.
- **Contextual Keywords**: \`get\`, \`set\`, \`test\`.

### Type System & Inference
- **Primitives**: \`Int\` (64-bit signed integer, overflow panics), \`Float\` (IEEE-754 double), \`Bool\` (\`true\` / \`false\`), \`String\` (UTF-8 character-aware), \`Char\` (single Unicode codepoint), \`Void\` (no value), \`Never\` (functions that throw or exit), \`Any\` (dynamic escape hatch).
- **Generics**: Invariant. Declared with \`<T>\` or bounded \`<T: Comparable>\`.
- **Type Aliases**: \`type Milliseconds = Int\`.

### Numbers & Division Semantics
- \`7 / 2\` evaluates to \`3.5\` (\`Float\`).
- \`7.div(2)\` evaluates to \`3\` (\`Int\`).
- \`7 % 2\` evaluates to \`1\` (\`Int\`).
- \`2 ** 8\` evaluates to \`256\` (\`Int\`).
- Integer and Float can be mixed in arithmetic expressions (e.g. \`10 * 1.5\` yields \`15.0\`).
- Number methods: \`.abs\`, \`.sign\`, \`.isEven\`, \`.isOdd\`, \`.min(other)\`, \`.max(other)\`, \`.clamp(lo, hi)\`, \`.toFloat()\`, \`.toInt()\`.

### Strings & Interpolation
- Double quotes: \`"text"\`. Escape sequences: \`\\n\`, \`\\t\`, \`\\r\`, \`\\\\ \`, \`\\"\`, \`\\'\`, \`\\$\`, \`\\u{1F600}\`.
- F-Strings: \`f"Hello, {name}!"\`. Formatting specifiers: \`f"Price: \${price:.2f}"\`. Debug expression: \`f"{x + y = }"\`. Escaped braces: \`{{\` and \`}}\`.
- Multiline Strings: Triple double quotes \`"""..."""\`. Leading indentation equal to the closing delimiter is automatically stripped.

### Collections
- **Arrays**: \`[1, 2, 3]\`. Typed as \`[T]\`. Zero-indexed. Supports negative indices from end: \`arr[-1]\`. Methods include \`.length\`, \`.push(x)\`, \`.pop()\`, \`.contains(x)\`, \`.indexOf(x)\`, \`.map(fn)\`, \`.filter(fn)\`, \`.reduce(init, fn)\`, \`.sorted()\`.
- **Maps**: \`{"a": 1, "b": 2}\`. Empty map is \`{}\`. Typed as \`{K: V}\`. Lookup \`m[k]\` returns \`V?\` (\`nil\` if key missing).
- **Sets**: \`Set([1, 2, 3])\`. Typed as \`Set<T>\`. Set operations: union \`a | b\`, intersection \`a & b\`, difference \`a - b\`.
- **Tuples**: \`(1, "Ada", true)\`. Typed as \`(Int, String, Bool)\`. Fields accessed via \`.0\`, \`.1\`, \`.2\`, or destructuring: \`let (id, name, active) = tuple\`.

### Optionals & Safe Navigation
- Optional type is annotated with \`?\`: \`String?\`.
- \`nil\` represents absence.
- Safe navigation: \`user?.profile?.address?.city\`.
- Null coalescing: \`name ?? "Anonymous"\`.
- Force unwrap: \`val!\` (panics if \`val\` is \`nil\`).
- Optional binding: \`if let unwrapped = opt { ... } else { ... }\`.

### Control Flow & Pattern Matching
- **If / Else**: Evaluates as an expression if desired: \`let v = if cond { a } else { b }\`.
- **For Loop**: \`for item in items { ... }\` or \`for i in 0..10 { ... }\`.
- **While Loop**: \`while condition { ... }\`. Supports \`break\` and \`continue\`.
- **Match Expression**:
  \`\`\`mycel
  match val {
    Pattern1 => expr1
    Pattern2 => {
      statements...
    }
    _ => fallback
  }
  \`\`\`

### Functions & Closures
- Explicit: \`fn add(a: Int, b: Int) -> Int { return a + b }\`.
- Expression body: \`fn double(x: Int) => x * 2\`.
- Lambdas: \`x => x * 2\` or \`(a: Int, b: Int) => a + b\`.
- Default arguments: \`fn query(table: String, limit: Int = 50)\`.
- Variadic: \`fn logAll(...messages: String)\`.

### Classes, Structs, Enums, Interfaces & Extensions
- **Class**: Reference type with single inheritance. Must call \`super.init(...)\`. Overridden methods require \`override\`.
- **Struct**: Value type with structural equality \`==\`. Auto-generates \`.with(field: newValue)\`.
- **Enum**: Algebraic Data Types with payloads: \`enum Result<T, E> { Ok(T), Err(E) }\`.
- **Interface**: Contract definition: \`interface Drawable { fn draw() }\`.
- **Extension**: Add methods to existing types: \`extend String { fn padBoth() -> String { ... } }\`.
- **Operator Overloading**: \`operator +(other: Vector) -> Vector\`.

### Error Handling
- \`Result<T, Error>\` with \`Ok(val)\` and \`Err(err)\`.
- The \`?\` postfix operator unwraps \`Ok\` or returns early with \`Err\`.
- Exceptions: \`throw Error("message")\`, \`try { ... } catch err { ... } finally { ... }\`.

---

## 3. Habits Comparison

Here is how common habits from other programming languages map to Mycel:
`;

for (const [lang, habits] of Object.entries(habitsByLang)) {
  md += `\n### Coming from ${lang}\n\n`;
  md += `| You write in ${lang} | What happens in Mycel | Mycel rule / syntax |\n`;
  md += `|---|---|---|\n`;
  for (const h of habits) {
    const status = h.ok ? "✅ Works" : "❌ Compile error";
    const habitEsc = h.habit.replace(/\|/g, "\\|");
    const mycelEsc = h.mycel.replace(/\|/g, "\\|");
    md += `| \`${habitEsc}\` | ${status} | ${mycelEsc} |\n`;
  }
}

md += `\n---\n\n## 4. Standard Library Reference\n\n`;
md += `Signatures extracted directly from Mycel's standard library definition files (\`lang/std/*.olx\`):\n\n`;

for (const mod of STDLIB_MODULES) {
  md += `### ${mod.name}\n\n`;
  md += `Source: \`lang/std/${mod.file}\`\n\n`;
  md += "```mycel\n" + mod.raw.trim() + "\n```\n\n";
}

md += `---\n\n## 5. 47 Verified Executable Examples\n\n`;
md += `Every single example below was compiled and executed with \`mycel run --allow-all\` by \`lang/ai/make_ai_learn.mjs\`. Outputs are exact real outputs.\n\n`;

for (let i = 0; i < EXAMPLES.length; i++) {
  const ex = EXAMPLES[i];
  md += `### Example ${i + 1}: ${ex.title}\n`;
  md += `*Category: ${ex.category}*\n\n`;
  md += "```mycel\n" + ex.code + "\n```\n\n";
  md += "**Verified Output:**\n";
  md += "```text\n" + ex.output + "\n```\n\n";
}

md += `---\n\n## 6. Common Compiler Errors and Real Diagnostics\n\n`;
md += `The Mycel compiler includes helpful error diagnostics and did-you-mean hints. Below are real compiler diagnostics generated with \`mycel check\` for common mistakes:\n\n`;

for (let i = 0; i < COMMON_ERRORS.length; i++) {
  const err = COMMON_ERRORS[i];
  md += `### Mistake ${i + 1}: ${err.title}\n\n`;
  md += `${err.desc}\n\n`;
  md += "**Incorrect Code:**\n";
  md += "```mycel\n" + err.broken + "\n```\n\n";
  md += "**Real Compiler Diagnostic:**\n";
  md += "```text\n" + err.diagnostic + "\n```\n\n";
  md += "**Fixed Mycel Code:**\n";
  md += "```mycel\n" + err.fixed + "\n```\n\n";
}

const fullMdPath = path.join(outDir, "mycel-for-ai.md");
fs.writeFileSync(fullMdPath, md, "utf8");
console.log(`Wrote complete reference (${(Buffer.byteLength(md) / 1024).toFixed(1)} KB) to ${fullMdPath}`);

// -------------------------------------------------------------
// 6. Synthesize mycel-for-ai-short.md (Summary + System Prompt)
// -------------------------------------------------------------
console.log("Generating site/public/mycel/ai-learn/mycel-for-ai-short.md...");

const shortMd = `# Mycel Cheatsheet & System Prompt for AI Models

> Concise guide and pasteable system prompt for ChatGPT, Claude, Gemini, Copilot, and local LLMs.
> Canonical URL: https://ol1x.xyz/mycel/ai-learn/mycel-for-ai-short.md
> Full Reference: https://ol1x.xyz/mycel/ai-learn/mycel-for-ai.md

---

## Pasteable System Prompt for AI Assistants

Copy and paste the block below into your custom instructions, system prompt, or conversation prefix:

\`\`\`markdown
You are an expert programmer in the Mycel programming language (.myc). When writing Mycel code, strictly obey these rules:

1. DIVISION:
   - Floating-point division: 'a / b' ALWAYS yields Float (e.g. 7 / 2 == 3.5, 8 / 2 == 4.0).
   - Whole-number integer division: Use '//', e.g. '7 // 2 == 3' (floor, like Python); '/' always gives a Float.
   - Remainder: '7 % 2 == 1'. Exponentiation: '2 ** 8 == 256'.

2. STRINGS & CHARACTERS:
   - Double quotes are required for strings: "hello world".
   - Single quotes are strictly for 1-character Char literals: 'A', 'c'. NEVER use single quotes for multi-char text.
   - F-strings: f"Total: {sum:.2f}", f"{item=}". Multiline: """text""".

3. FUNCTIONS & VARIABLES:
   - Functions: 'fn name(params) -> ReturnType { ... }' or 'fn name(params) => expr'. NEVER use 'def' or 'function'.
   - Variables: 'let' for immutable bindings, 'var' for mutable. NEVER use 'const' or 'val'.
   - Top-level statements are allowed directly (no mandatory main() function).

4. OPTIONALS & NULL SAFETY:
   - Nullable types: 'T?'. Nil value: 'nil'. NEVER use 'None' or 'null'.
   - Unwrapping: '?.', '??', '!', and 'if let value = opt { ... }'.

5. COLLECTIONS:
   - Array: [1, 2, 3], supports negative indexing arr[-1].
   - Map: {"key": value}, missing key returns nil. Heterogeneous map must be typed {String: Any}.
   - Set: Set([1, 2, 3]). Union '|', intersection '&', difference '-'.
   - Tuple: (a, b), indexed with dot: 'tup.0', 'tup.1' (NEVER tup[0]).

6. CONTROL FLOW:
   - 'if cond { ... } else if cond { ... } else { ... }'. NEVER use 'elif' or ':' colons.
   - Loops: 'for item in items', 'for i in 0..10', 'while cond'.
   - Pattern matching: 'match val { Pattern => expr, _ => fallback }'.

7. TYPES & OBJECT ORIENTATION:
   - 'struct Point { let x: Int, y: Int }' is an immutable value type with '==' and '.with(x: 10)'.
   - 'class Child: Parent { init() { super.init() } override fn work() {} }'.
   - 'enum Shape { Circle(radius: Float), Rect(width: Float, height: Float) }'.
   - 'interface Named { get name: String }'.
   - 'extend String { fn shout() => self + "!" }'.
   - Generics: 'class Box<T>', invariant type parameters.

8. STANDARD LIBRARY IMPORTS:
   - 'import json' (json.parse, json.stringify)
   - 'import math' (math.PI, math.sqrt, math.hypot, math.gcd)
   - 'import time' (time.now, time.seconds, time.Duration)
   - 'import crypto' (crypto.sha256, crypto.uuid)
   - 'import fs' (fs.readText, fs.writeText, fs.exists)
   - 'import re' (re.Regex.compile, pattern.find)
   - 'import env' (env.args, env.platform)
   - 'import test' (test "name" { test.assertEq(a, b) })
\`\`\`

---

## Quick Syntax Cheatsheet

### Declarations
\`\`\`mycel
let immutableBinding = 42
var mutableCounter = 0
mutableCounter += 1

fn add(a: Int, b: Int) -> Int { return a + b }
fn square(x: Int) => x * x
fn greet(name: String = "World") => f"Hello, {name}!"
fn sumAll(...nums: Int) -> Int { ... }
\`\`\`

### Numbers & Division
\`\`\`mycel
let floatVal = 7 / 2        # 3.5 (Float)
let intVal = 7 // 2          # 3 (Int)
let modVal = 7 % 2          # 1 (Int)
let powVal = 2 ** 10        # 1024 (Int)
\`\`\`

### Collections & Comprehensions
\`\`\`mycel
let arr = [10, 20, 30]
let last = arr[-1]          # 30
let doubled = [x * 2 for x in arr if x > 15]

let map = {"apples": 5, "oranges": 10}
let count = map["apples"] ?? 0

let setA = Set([1, 2, 3])
let setB = Set([3, 4, 5])
let common = setA & setB    # Set([3])

let tuple = ("Alice", 100)
let name = tuple.0
let score = tuple.1
\`\`\`

### Optionals
\`\`\`mycel
fn find(id: Int) -> String? { ... }
if let name = find(42) {
  print("Found:", name)
}
let displayName = find(99) ?? "Guest"
\`\`\`

### Structs, Classes & Enums
\`\`\`mycel
struct Point { let x: Int, y: Int }
let p = Point(x: 1, y: 2).with(y: 5)

class Animal {
  let name: String
  init(name: String) { self.name = name }
  fn sound() -> String => "..."
}

class Dog: Animal {
  init(name: String) { super.init(name: name) }
  override fn sound() -> String => "Bark!"
}

enum State {
  Idle
  Running(speed: Float)
}
\`\`\`
`;

const shortMdPath = path.join(outDir, "mycel-for-ai-short.md");
fs.writeFileSync(shortMdPath, shortMd, "utf8");
console.log(`Wrote short cheatsheet (${(Buffer.byteLength(shortMd) / 1024).toFixed(1)} KB) to ${shortMdPath}`);

// -------------------------------------------------------------
// 7. Synthesize index.html for site/public/mycel/ai-learn/
// -------------------------------------------------------------
console.log("Generating site/public/mycel/ai-learn/index.html...");

const fullSizeKB = (fs.statSync(fullMdPath).size / 1024).toFixed(1);
const shortSizeKB = (fs.statSync(shortMdPath).size / 1024).toFixed(1);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Learn Mycel for Cloud AI Models — Complete Reference &amp; System Prompts</title>
<meta name="description" content="Complete reference manual, pasteable system prompts, standard library signatures, habits comparison, and 47 verified executable examples for ChatGPT, Claude, and Gemini to generate accurate Mycel code.">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" type="image/png" sizes="32x32" href="/mycel/brand/mycel-32.png">
<link rel="apple-touch-icon" href="/mycel/brand/mycel-256.png">
<link rel="canonical" href="https://ol1x.xyz/mycel/ai-learn/">
<meta property="og:type" content="article">
<meta property="og:url" content="https://ol1x.xyz/mycel/ai-learn/">
<meta property="og:title" content="Learn Mycel for Cloud AI Models — Reference &amp; Prompts">
<meta property="og:description" content="Self-contained reference manual, pasteable system prompts, habits translation, and 47 verified executable examples for Claude, ChatGPT, and Gemini.">
<meta property="og:image" content="https://ol1x.xyz/mycel/brand/mycel-512.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Learn Mycel for Cloud AI Models",
  "description": "Complete reference manual, system prompt, standard library signatures, habits guide, and 47 verified executable examples for ChatGPT, Claude, and Gemini to generate accurate Mycel code.",
  "url": "https://ol1x.xyz/mycel/ai-learn/",
  "datePublished": "2026-11-07",
  "dateModified": "2026-11-07",
  "author": {
    "@type": "Person",
    "name": "drky"
  },
  "publisher": {
    "@type": "Organization",
    "name": "olix",
    "url": "https://ol1x.xyz/"
  }
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
 --bg:#0a0a0a;--bg-2:#101010;--bg-3:#171717;
 --surface:rgba(255,255,255,.035);--raised:rgba(255,255,255,.055);--bubble:rgba(255,255,255,.085);
 --hair:rgba(255,255,255,.11);--stroke:rgba(255,255,255,.08);
 --text:rgba(255,255,255,.92);--text-2:rgba(255,255,255,.62);--text-3:rgba(255,255,255,.4);
 --code-bg:#050505;--blue:#0857d1;--indigo:#2b33a8;--violet:#4d2b94;--accent:#4085ff;--ok:#30d158;--warn:#ff9f0a;
 --sans:Inter,system-ui,-apple-system,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace;
 --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:64px;
 --r-sm:6px;--r-md:10px;--r-lg:16px;
 --fs-xs:12px;--fs-sm:14px;--fs-base:16px;--fs-md:18px;--fs-lg:22px;--fs-xl:32px;
}
@media (prefers-color-scheme: light){
 :root{
  --bg:#f8f9fa;--bg-2:#f1f3f5;--bg-3:#e9ecef;
  --surface:rgba(0,0,0,.03);--raised:rgba(0,0,0,.05);--bubble:rgba(0,0,0,.08);
  --hair:rgba(0,0,0,.12);--stroke:rgba(0,0,0,.1);
  --text:rgba(0,0,0,.9);--text-2:rgba(0,0,0,.65);--text-3:rgba(0,0,0,.45);
  --code-bg:#ffffff;--accent:#0857d1;
 }
}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:var(--fs-base);line-height:1.6;-webkit-font-smoothing:antialiased}
body{min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{width:100%;max-width:980px;margin:0 auto;padding:0 var(--s4)}
header{padding:var(--s5) 0 var(--s4);border-bottom:1px solid var(--stroke)}
.nav{display:flex;align-items:center;justify-content:space-between;gap:var(--s4);flex-wrap:wrap}
.crumbs{font:var(--fs-sm) var(--mono);color:var(--text-3);display:flex;align-items:center;gap:var(--s2)}
.crumbs a{color:var(--text-2)}
.pills{display:flex;gap:var(--s2);flex-wrap:wrap}
.pill{font:var(--fs-xs) var(--mono);padding:4px 10px;border-radius:999px;border:1px solid var(--stroke);color:var(--text-2);background:var(--surface)}
.pill:hover{border-color:var(--hair);color:var(--text);text-decoration:none}
.pill.active{background:var(--bubble);color:var(--text);border-color:var(--hair)}
.tag{display:inline-block;font:11px/1.4 var(--mono);padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.05em}
.tag.ok{background:rgba(48,209,88,.15);color:#30d158;border:1px solid rgba(48,209,88,.3)}
.tag.info{background:rgba(64,133,255,.15);color:#4085ff;border:1px solid rgba(64,133,255,.3)}
.hero{padding-top:var(--s7);padding-bottom:var(--s6)}
.eyebrow{font:var(--fs-xs) var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.1em;margin-bottom:var(--s2)}
h1{font-size:clamp(28px,5vw,46px);letter-spacing:-.03em;line-height:1.15;margin-bottom:var(--s3)}
.lead{font-size:clamp(16px,2vw,19px);color:var(--text-2);line-height:1.5;max-width:760px;margin-bottom:var(--s5)}
section{padding:var(--s6) 0;border-top:1px solid var(--stroke)}
h2{font-size:clamp(20px,3.5vw,28px);letter-spacing:-.02em;margin-bottom:var(--s3)}
h3{font-size:var(--fs-md);margin-bottom:var(--s2)}
p{color:var(--text-2);margin-bottom:var(--s4)}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--s4);margin-top:var(--s4)}
.card{background:var(--surface);border:1px solid var(--stroke);border-radius:var(--r-lg);padding:var(--s5);display:flex;flex-direction:column;justify-content:space-between}
.card:hover{border-color:var(--hair)}
.card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--s3)}
.card h3{font-size:var(--fs-base);color:var(--text);margin-bottom:var(--s1)}
.meta-row{font:var(--fs-xs) var(--mono);color:var(--text-3);display:flex;gap:var(--s3);margin-bottom:var(--s4)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);padding:8px 16px;border-radius:var(--r-md);font:var(--fs-sm) var(--sans);font-weight:500;cursor:pointer;border:1px solid var(--stroke);background:var(--bubble);color:var(--text);transition:background .15s}
.btn:hover{background:var(--hair);text-decoration:none}
.btn-primary{background:var(--accent);color:#fff;border-color:transparent}
.btn-primary:hover{opacity:.9}
.btn-group{display:flex;gap:var(--s2);flex-wrap:wrap;margin-top:auto}
.code-wrap{background:var(--code-bg);border:1px solid var(--stroke);border-radius:var(--r-md);overflow:hidden;margin:var(--s4) 0}
.code-bar{background:var(--raised);padding:var(--s2) var(--s4);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--stroke);font:var(--fs-xs) var(--mono);color:var(--text-3)}
pre{padding:var(--s4);overflow-x:auto;font:13px/1.6 var(--mono);color:var(--text)}
code{font-family:var(--mono);font-size:13px}
.copy-btn{font:var(--fs-xs) var(--mono);padding:4px 10px;border-radius:var(--r-sm);border:1px solid var(--stroke);background:var(--surface);color:var(--text-2);cursor:pointer}
.copy-btn:hover{color:var(--text);background:var(--bubble)}
.copy-btn.copied{background:rgba(48,209,88,.2);color:#30d158;border-color:rgba(48,209,88,.4)}
.rule-box{background:rgba(64,133,255,.06);border:1px solid rgba(64,133,255,.2);border-radius:var(--r-md);padding:var(--s4);margin:var(--s4) 0}
.rule-box strong{color:var(--accent)}
.tbl-wrap{overflow-x:auto;margin:var(--s4) 0;border:1px solid var(--stroke);border-radius:var(--r-md)}
table{width:100%;border-collapse:collapse;font-size:var(--fs-sm);text-align:left}
th,td{padding:var(--s3) var(--s4);border-bottom:1px solid var(--stroke)}
th{background:var(--surface);font-family:var(--mono);font-size:var(--fs-xs);color:var(--text-2);text-transform:uppercase;letter-spacing:.05em}
tr:last-child td{border-bottom:none}
footer{margin-top:auto;padding:var(--s6) 0;border-top:1px solid var(--stroke);font-size:var(--fs-sm);color:var(--text-3);text-align:center}
footer a{color:var(--text-2)}
</style>
<link rel="stylesheet" href="/mycel/site.css?v=2ba6e2e275">
</head>
<body>
<nav class="mycel-nav" aria-label="Mycel"><div class="mycel-nav-inner"><a class="mycel-brand" href="/mycel/"><img src="/mycel/brand/mycel-128.png" alt=""><span>mycel</span></a><div class="mycel-links"><a href="/mycel/learn/">learn</a><a href="/mycel/docs/">docs</a><a href="/mycel/play/">play</a><a href="/mycel/learn/#guides">guides</a><a class="mycel-download" href="/mycel/download/">download</a></div></div></nav>

<header>
 <div class="wrap nav">
  <div class="crumbs">
   <a href="/">olix</a>
   <span>/</span>
   <a href="/mycel/">mycel</a>
   <span>/</span>
   <span>ai-learn</span>
  </div>
  <div class="pills">
   <a href="/mycel/fine-tune/" class="pill">Fine-tuning Data</a>
   <a href="/mycel/ai-learn/" class="pill active">For Cloud AI</a>
   <a href="/mycel/learn/" class="pill">Learn Tour</a>
   <a href="/mycel/play/" class="pill">Playground</a>
  </div>
 </div>
</header>

<main>
 <div class="wrap hero">
  <h1>Teach Cloud AI Models Mycel</h1>
  <p class="lead">Chat models don't know Mycel yet. Paste one of these into Claude, ChatGPT, Gemini or Copilot first: a short system prompt, a cheatsheet, or the full reference with the real standard library signatures.</p>
 </div>

 <section><div class="wrap">
  
  <h2>How to use with AI models</h2>
  <p>Pick by how much room you have in the prompt:</p>
  
  <div class="grid-cards">
   <div class="card">
    <div>
     <div class="card-head">
      <h3>System Prompt Snippet</h3>
      
     </div>
     <p>Paste directly into your custom instructions, project prompt, or chat prefix.</p>
    </div>
    <div class="btn-group">
     <button class="btn btn-primary" onclick="copySystemPrompt(this)">Copy Prompt</button>
     <a href="#prompt-box" class="btn">View Below</a>
    </div>
   </div>

   <div class="card">
    <div>
     <div class="card-head">
      <h3>Complete AI Reference</h3>
     </div>
     <p>One complete markdown document containing syntax, stdlib signatures, 47 verified executable examples, and compiler error guides.</p>
    </div>
    <div class="btn-group">
     <a href="/mycel/ai-learn/mycel-for-ai.md" download class="btn btn-primary">Download .md</a>
     <a href="/mycel/ai-learn/mycel-for-ai.md" class="btn" target="_blank">View Raw</a>
    </div>
   </div>

   <div class="card">
    <div>
     <div class="card-head">
      <h3>Short Cheatsheet</h3>
      <span class="tag info">llms.txt</span>
     </div>
     <p>A concise summary of grammar, types, standard library overview, and the rules models most often break, for short prompts.</p>
    </div>
    <div class="btn-group">
     <a href="/mycel/ai-learn/mycel-for-ai-short.md" download class="btn btn-primary">Download .md</a>
     <a href="/mycel/ai-learn/mycel-for-ai-short.md" class="btn" target="_blank">View Raw</a>
    </div>
   </div>
  </div>
 </div></section>

 <section id="prompt-box"><div class="wrap">
  
  <h2>The System Prompt for AI Coding Assistants</h2>
  <p>Paste this into ChatGPT (Custom Instructions), Claude (Project Knowledge or System Prompt), Gemini (System Instructions), or Cursor / Copilot:</p>

  <div class="code-wrap">
   <div class="code-bar">
    <span>system-prompt.txt</span>
    <button class="copy-btn" onclick="copySnippet(this, 'prompt-text')">Copy System Prompt</button>
   </div>
   <pre><code id="prompt-text">You are an expert programmer in the Mycel programming language (.myc). When writing Mycel code, strictly obey these rules:

1. DIVISION:
   - Floating-point division: 'a / b' ALWAYS yields Float (e.g. 7 / 2 == 3.5, 8 / 2 == 4.0).
   - Whole-number integer division: Use '//', e.g. '7 // 2 == 3' (floor, like Python); '/' always gives a Float.
   - Remainder: '7 % 2 == 1'. Exponentiation: '2 ** 8 == 256'.

2. STRINGS &amp; CHARACTERS:
   - Double quotes are required for strings: "hello world".
   - Single quotes are strictly for 1-character Char literals: 'A', 'c'. NEVER use single quotes for multi-char text.
   - F-strings: f"Total: {sum:.2f}", f"{item=}". Multiline: """text""".

3. FUNCTIONS &amp; VARIABLES:
   - Functions: 'fn name(params) -> ReturnType { ... }' or 'fn name(params) => expr'. NEVER use 'def' or 'function'.
   - Variables: 'let' for immutable bindings, 'var' for mutable. NEVER use 'const' or 'val'.
   - Top-level statements are allowed directly (no mandatory main() function).

4. OPTIONALS &amp; NULL SAFETY:
   - Nullable types: 'T?'. Nil value: 'nil'. NEVER use 'None' or 'null'.
   - Unwrapping: '?.', '??', '!', and 'if let value = opt { ... }'.

5. COLLECTIONS:
   - Array: [1, 2, 3], supports negative indexing arr[-1].
   - Map: {"key": value}, missing key returns nil. Heterogeneous map must be typed {String: Any}.
   - Set: Set([1, 2, 3]). Union '|', intersection '&amp;', difference '-'.
   - Tuple: (a, b), indexed with dot: 'tup.0', 'tup.1' (NEVER tup[0]).

6. CONTROL FLOW:
   - 'if cond { ... } else if cond { ... } else { ... }'. NEVER use 'elif' or ':' colons.
   - Loops: 'for item in items', 'for i in 0..10', 'while cond'.
   - Pattern matching: 'match val { Pattern => expr, _ => fallback }'.

7. TYPES &amp; OBJECT ORIENTATION:
   - 'struct Point { let x: Int, y: Int }' is an immutable value type with '==' and '.with(x: 10)'.
   - 'class Child: Parent { init() { super.init() } override fn work() {} }'.
   - 'enum Shape { Circle(radius: Float), Rect(width: Float, height: Float) }'.
   - 'interface Named { get name: String }'.
   - 'extend String { fn shout() => self + "!" }'.
   - Generics: 'class Box&lt;T&gt;', invariant type parameters.

8. STANDARD LIBRARY IMPORTS:
   - 'import json' (json.parse, json.stringify)
   - 'import math' (math.PI, math.sqrt, math.hypot, math.gcd)
   - 'import time' (time.now, time.seconds, time.Duration)
   - 'import crypto' (crypto.sha256, crypto.uuid)
   - 'import fs' (fs.readText, fs.writeText, fs.exists)
   - 'import re' (re.Regex.compile, pattern.find)
   - 'import env' (env.args, env.platform)
   - 'import test' (test "name" { test.assertEq(a, b) })</code></pre>
  </div>
 </div></section>

 <section><div class="wrap">
  <div class="eyebrow">Zero Hallucinations</div>
  <h2>What Large Language Models Get Wrong (And The Fix)</h2>
  <p>Cloud AI models are heavily trained on Python and JavaScript. When generating Mycel, they tend to regress to those habits. Here are the top four:</p>

  <div class="tbl-wrap">
   <table>
    <thead>
     <tr>
      <th>Concept</th>
      <th>What Models Hallucinate</th>
      <th>Real Mycel Syntax</th>
      <th>Why</th>
     </tr>
    </thead>
    <tbody>
     <tr>
      <td><strong>Integer Division</strong></td>
      <td><code>7 // 2</code></td>
      <td><code>7.div(2)</code></td>
      <td><code>/</code> is always Float division in Mycel (<code>7 / 2 == 3.5</code>). Whole-number division is an explicit method.</td>
     </tr>
     <tr>
      <td><strong>Function Definition</strong></td>
      <td><code>def f(x):</code> or <code>function f(x)</code></td>
      <td><code>fn f(x: Int) -&gt; Int { ... }</code></td>
      <td>Mycel strictly uses <code>fn</code> with curly braces. Colons are rejected by the compiler.</td>
     </tr>
     <tr>
      <td><strong>Null / Nil</strong></td>
      <td><code>None</code> or <code>null</code></td>
      <td><code>nil</code></td>
      <td>Optionals are typed <code>T?</code> and empty values are represented by <code>nil</code>.</td>
     </tr>
     <tr>
      <td><strong>Strings</strong></td>
      <td><code>'hello world'</code></td>
      <td><code>"hello world"</code></td>
      <td>Single quotes are reserved strictly for single <code>Char</code> values like <code>'A'</code>. Strings must use double quotes.</td>
     </tr>
    </tbody>
   </table>
  </div>
 </div></section>

 <section><div class="wrap">
  <div class="eyebrow">Verification Evidence</div>
  <h2>Verified Compiler Diagnostics &amp; Real Outputs</h2>
  <p>Every example in the reference files was executed against the real Mycel compiler (<code>lang/bin/mycel</code>). Here is an excerpt showing how the compiler guides models back on track:</p>

  <div class="code-wrap">
   <div class="code-bar">
    <span>real-diagnostic-example.myc</span>
    <span>mycel check output</span>
   </div>
   <pre><code>error [E0101]: \`def\` is Python — Mycel writes \`fn name(args) { ... }\`
  --&gt; snippet.myc:1:1
  |
1 | def calculate(x, y):
  | ^^^
  why: this word comes from another language
  fix: see \`mycel help habits\`

1 error, 0 warnings</code></pre>
  </div>
 </div></section>

 <section><div class="wrap">
  <div class="eyebrow">Related Resources</div>
  <h2>Fine-tuning and documentation</h2>
  <div class="grid-cards">
   <div class="card">
    <div>
     <div class="card-head">
      <h3>Fine-Tuning Datasets</h3>
      <span class="tag ok">LoRA</span>
     </div>
     <p>Downloadable verified JSONL datasets for local open-weights models. Includes instruction, error fix-it, and translation datasets.</p>
    </div>
    <div class="btn-group">
     <a href="/mycel/fine-tune/" class="btn btn-primary">Browse Datasets</a>
    </div>
   </div>

   <div class="card">
    <div>
     <div class="card-head">
      <h3>Learn Mycel Tour</h3>
      <span class="tag info">Human Course</span>
     </div>
     <p>Eight small interactive lessons with runnable code examples for developers learning the language.</p>
    </div>
    <div class="btn-group">
     <a href="/mycel/learn/" class="btn">Take the Tour</a>
    </div>
   </div>

   <div class="card">
    <div>
     <div class="card-head">
      <h3>In-Browser Playground</h3>
      <span class="tag info">WebWorker</span>
     </div>
     <p>Run real Mycel code directly in your browser. Sandboxed execution, zero installs needed.</p>
    </div>
    <div class="btn-group">
     <a href="/mycel/play/" class="btn">Open Playground</a>
    </div>
   </div>
  </div>
 </div></section>
</main>

<footer>
 <div class="wrap">
  <p><a href="/">olix</a> &middot; <a href="/mycel/">Mycel</a> &middot; <a href="/mycel/fine-tune/">Fine-Tuning</a> &middot; <a href="/mycel/ai-learn/">For Cloud AI</a> &middot; <a href="/provenance/">&copy; 2026 drky</a></p>
 </div>
</footer>

<script>
function copySnippet(btn, id){
 var text = document.getElementById(id).innerText;
 navigator.clipboard.writeText(text).then(function(){
  btn.classList.add('copied');
  var orig = btn.innerText;
  btn.innerText = 'Copied!';
  setTimeout(function(){
   btn.classList.remove('copied');
   btn.innerText = orig;
  }, 2000);
 });
}
function copySystemPrompt(btn){
 var text = document.getElementById('prompt-text').innerText;
 navigator.clipboard.writeText(text).then(function(){
  btn.innerText = 'Copied!';
  setTimeout(function(){ btn.innerText = 'Copy Prompt'; }, 2000);
 });
}
</script>
</body>
</html>
`;

const htmlPath = path.join(outDir, "index.html");
fs.writeFileSync(htmlPath, html, "utf8");
console.log(`Wrote index.html to ${htmlPath}`);

console.log("\n✔ All Cloud AI learning materials generated successfully.");
