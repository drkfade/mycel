// lang/ai/instruct_tasks_2.mjs — Task definitions 171-385 for mycel-instruct.jsonl

export const INSTRUCT_TASKS_2 = [
  // 11. Functions (171-195)
  {
    task: "Write a Mycel program with a function that calculates the cube of an integer.",
    code: `fn cube(x: Int) -> Int {\n  return x * x * x\n}\nprint(cube(3), cube(5))\n`
  },
  {
    task: "Write a Mycel program with an expression-bodied function `fn double(x: Int) => x * 2`.",
    code: `fn double(x: Int) => x * 2\nfn triple(x: Int) => x * 3\nprint(double(4), triple(4))\n`
  },
  {
    task: "Write a Mycel program with a function that takes default arguments for base and exponent.",
    code: `fn power(base: Int, exp: Int = 2) -> Int {\n  return base ** exp\n}\nprint(power(5), power(2, 4))\n`
  },
  {
    task: "Write a Mycel program with a function called with named arguments in different orders.",
    code: `fn greet(first: String, last: String, title: String = "Mr.") -> String {\n  return f"{title} {first} {last}"\n}\nprint(greet(first: "Ada", last: "Lovelace", title: "Countess"))\nprint(greet(last: "Turing", first: "Alan"))\n`
  },
  {
    task: "Write a Mycel program with a variadic function that takes a prefix and `...rest: Int` and sums them.",
    code: `fn sumRest(label: String, ...nums: Int) {\n  var total = 0\n  for n in nums { total += n }\n  print(f"{label}: {total}")\n}\nsumRest("Totals", 1, 2, 3, 4, 5)\n`
  },
  {
    task: "Write a Mycel program that defines and calls an inline lambda function.",
    code: `let sq = (x: Int) => x * x\nprint(sq(9))\n`
  },
  {
    task: "Write a Mycel program that accepts a function as a parameter (higher-order function).",
    code: `fn applyTwice(x: Int, f: (Int) -> Int) -> Int {\n  return f(f(x))\n}\nlet res = applyTwice(3, n => n + 5)\nprint(res)\n`
  },
  {
    task: "Write a Mycel program with a function returning a closure that increments by a given step.",
    code: `fn makeAdder(step: Int) -> (Int) -> Int {\n  return n => n + step\n}\nlet addTen = makeAdder(10)\nprint(addTen(5), addTen(20))\n`
  },
  {
    task: "Write a Mycel program that demonstrates function overloading with different parameter types.",
    code: `fn describe(x: Int) -> String => f"Int: {x}"\nfn describe(s: String) -> String => f"String: {s}"\nprint(describe(42))\nprint(describe("hello"))\n`
  },
  {
    task: "Write a Mycel program with a recursive function that calculates the nth Fibonacci number.",
    code: `fn fib(n: Int) -> Int {\n  if n <= 1 { return n }\n  return fib(n - 1) + fib(n - 2)\n}\nprint(fib(7), fib(10))\n`
  },
  {
    task: "Write a Mycel program with a recursive function to compute greatest common divisor (GCD).",
    code: `fn gcd(a: Int, b: Int) -> Int {\n  if b == 0 { return a }\n  return gcd(b, a % b)\n}\nprint(gcd(48, 18), gcd(101, 10))\n`
  },
  {
    task: "Write a Mycel program that checks if a string is empty using a helper function with return type Bool.",
    code: `fn isBlank(s: String) -> Bool => s.trim().length == 0\nprint(isBlank("   "), isBlank("hi"))\n`
  },
  {
    task: "Write a Mycel program demonstrating generic identity function `fn id<T>(x: T) -> T`.",
    code: `fn id<T>(x: T) -> T {\n  return x\n}\nprint(id(42), id("Mycel"), id(true))\n`
  },
  {
    task: "Write a Mycel program with a generic function that returns the first element of an array or a default value.",
    code: `fn firstOr<T>(items: [T], default: T) -> T {\n  return items.first ?? default\n}\nprint(firstOr([1, 2, 3], 0))\nprint(firstOr([], 99))\n`
  },
  {
    task: "Write a Mycel program with a generic function that swaps elements at two indices in an array.",
    code: `fn swapIndices<T>(items: [T], i: Int, j: Int) {\n  let temp = items[i]\n  items[i] = items[j]\n  items[j] = temp\n}\nvar arr = [10, 20, 30]\nswapIndices(arr, 0, 2)\nprint(arr)\n`
  },
  {
    task: "Write a Mycel program that chains function calls using the pipeline operator `|>`.",
    code: `fn inc(x: Int) -> Int => x + 1\nfn square(x: Int) -> Int => x * x\nlet res = 3 |> inc |> square\nprint(res)\n`
  },
  {
    task: "Write a Mycel program using pipeline operator with multi-argument functions `a |> f(b)`.",
    code: `fn add(a: Int, b: Int) -> Int => a + b\nfn mul(a: Int, b: Int) -> Int => a * b\nlet res = 5 |> add(3) |> mul(2)\nprint(res)\n`
  },
  {
    task: "Write a Mycel program with an async function returning an Int and awaiting it inside async fn main().",
    code: `async fn fetchAnswer() -> Int {\n  return 42\n}\nasync fn main() {\n  let ans = await fetchAnswer()\n  print(ans)\n}\n`
  },
  {
    task: "Write a Mycel program with a function that calculates total and tax with an optional rate.",
    code: `fn calcTotal(subtotal: Float, rate: Float = 0.08) -> Float {\n  return subtotal * (1.0 + rate)\n}\nprint(f"\${calcTotal(100.0):.2f}")\nprint(f"\${calcTotal(100.0, rate: 0.1):.2f}")\n`
  },
  {
    task: "Write a Mycel program that takes a variadic list of strings and joins them with dashes.",
    code: `fn joinWithDash(...parts: String) -> String {\n  return parts.join("-")\n}\nprint(joinWithDash("usr", "local", "bin"))\n`
  },
  {
    task: "Write a Mycel program with a function returning an optional Int? if input is even.",
    code: `fn evenOnly(n: Int) -> Int? {\n  if n % 2 == 0 { return n }\n  return nil\n}\nprint(evenOnly(4), evenOnly(7) == nil)\n`
  },
  {
    task: "Write a Mycel program that takes a predicate function and filters an array manually.",
    code: `fn customFilter<T>(items: [T], pred: (T) -> Bool) -> [T] {\n  var result: [T] = []\n  for item in items {\n    if pred(item) { result.push(item) }\n  }\n  return result\n}\nprint(customFilter([1, 2, 3, 4, 5], x => x > 2))\n`
  },
  {
    task: "Write a Mycel program that computes compound interest using a function.",
    code: `fn compound(principal: Float, rate: Float, years: Int) -> Float {\n  var total = principal\n  for _ in 0..years {\n    total = total * (1.0 + rate)\n  }\n  return total\n}\nprint(f"\${compound(1000.0, 0.05, 3):.2f}")\n`
  },
  {
    task: "Write a Mycel program with a function returning a Result<Int, Error> for safe division.",
    code: `fn safeDiv(a: Int, b: Int) -> Result<Int, Error> {\n  if b == 0 { return .Err(Error("division by zero")) }\n  return .Ok(a.div(b))\n}\nprint(safeDiv(10, 2).isOk, safeDiv(10, 0).isErr)\n`
  },
  {
    task: "Write a Mycel program that prints whether all elements in a list satisfy a predicate via a helper function.",
    code: `fn allPositive(items: [Int]) -> Bool {\n  return items.all(x => x > 0)\n}\nprint(allPositive([1, 2, 3]), allPositive([1, -2, 3]))\n`
  },

  // 12. Classes & Inheritance (196-220)
  {
    task: "Write a Mycel program defining a Counter class with an increment method and a reset method.",
    code: `class Counter {\n  var count: Int = 0\n  fn inc() { self.count += 1 }\n  fn reset() { self.count = 0 }\n}\nlet c = Counter()\nc.inc()\nc.inc()\nprint(c.count)\nc.reset()\nprint(c.count)\n`
  },
  {
    task: "Write a Mycel program defining a Person class with an init method and a fullGreeting method.",
    code: `class Person {\n  let name: String\n  let age: Int\n  init(name: String, age: Int) {\n    self.name = name\n    self.age = age\n  }\n  fn greet() -> String {\n    return f"Hi, I am {self.name}, age {self.age}"\n  }\n}\nlet p = Person(name: "Alice", age: 30)\nprint(p.greet())\n`
  },
  {
    task: "Write a Mycel program with a Rectangle class that has a computed getter for area and perimeter.",
    code: `class Rectangle {\n  let width: Float\n  let height: Float\n  init(width: Float, height: Float) {\n    self.width = width\n    self.height = height\n  }\n  get area: Float => self.width * self.height\n  get perimeter: Float => 2.0 * (self.width + self.height)\n}\nlet rect = Rectangle(width: 4.0, height: 5.5)\nprint(f"Area: {rect.area:.1f}, Perimeter: {rect.perimeter:.1f}")\n`
  },
  {
    task: "Write a Mycel program demonstrating class inheritance where a Dog class inherits from Animal and overrides speak().",
    code: `class Animal {\n  let name: String\n  init(name: String) { self.name = name }\n  fn speak() -> String => "Some sound"\n}\nclass Dog: Animal {\n  override fn speak() -> String => "Woof!"\n}\nlet d = Dog(name: "Buddy")\nprint(f"{d.name} says {d.speak()}")\n`
  },
  {
    task: "Write a Mycel program where a subclass calls super.init() in its constructor.",
    code: `class Vehicle {\n  let wheels: Int\n  init(wheels: Int) { self.wheels = wheels }\n}\nclass Car: Vehicle {\n  let doors: Int\n  init(doors: Int) {\n    super.init(wheels: 4)\n    self.doors = doors\n  }\n}\nlet c = Car(doors: 4)\nprint(c.wheels, c.doors)\n`
  },
  {
    task: "Write a Mycel program with a BankAccount class supporting deposit, withdraw, and checking balance.",
    code: `class BankAccount {\n  var balance: Int = 0\n  init(initial: Int) { self.balance = initial }\n  fn deposit(amount: Int) { self.balance += amount }\n  fn withdraw(amount: Int) -> Bool {\n    if amount > self.balance { return false }\n    self.balance -= amount\n    return true\n  }\n}\nlet acct = BankAccount(initial: 100)\nacct.deposit(50)\nprint(acct.balance)\nlet ok = acct.withdraw(70)\nprint(ok, acct.balance)\nlet fail = acct.withdraw(200)\nprint(fail, acct.balance)\n`
  },
  {
    task: "Write a Mycel program with a class defining operator + to add two 2D Vectors.",
    code: `class Vector2D {\n  let x: Int\n  let y: Int\n  init(x: Int, y: Int) {\n    self.x = x\n    self.y = y\n  }\n  operator +(other: Vector2D) -> Vector2D {\n    return Vector2D(x: self.x + other.x, y: self.y + other.y)\n  }\n}\nlet v1 = Vector2D(x: 1, y: 2)\nlet v2 = Vector2D(x: 3, y: 4)\nlet v3 = v1 + v2\nprint(v3.x, v3.y)\n`
  },
  {
    task: "Write a Mycel program with static methods on a MathUtil class.",
    code: `class MathUtil {\n  static fn double(x: Int) -> Int => x * 2\n  static fn square(x: Int) -> Int => x * x\n}\nprint(MathUtil.double(12), MathUtil.square(5))\n`
  },
  {
    task: "Write a Mycel program with a class getter and setter for temperature in Celsius and Fahrenheit.",
    code: `class Temperature {\n  var c: Float = 0.0\n  get fahrenheit: Float => (self.c * 9.0 / 5.0) + 32.0\n  set fahrenheit(f: Float) {\n    self.c = (f - 32.0) * 5.0 / 9.0\n  }\n}\nlet t = Temperature()\nt.c = 100.0\nprint(f"{t.fahrenheit:.1f}")\nt.fahrenheit = 32.0\nprint(f"{t.c:.1f}")\n`
  },
  {
    task: "Write a Mycel program with a Stack class providing push, pop, and peek.",
    code: `class Stack<T> {\n  var items: [T] = []\n  fn push(item: T) { self.items.push(item) }\n  fn pop() -> T? => self.items.pop()\n  fn peek() -> T? => self.items.last\n  get isEmpty: Bool => self.items.isEmpty\n}\nlet s = Stack<Int>()\ns.push(10)\ns.push(20)\nprint(s.peek())\nprint(s.pop())\nprint(s.pop())\nprint(s.isEmpty)\n`
  },
  {
    task: "Write a Mycel program defining a Book class with a memberwise initializer.",
    code: `class Book {\n  let title: String\n  let author: String\n  let pages: Int\n}\nlet b = Book(title: "Dune", author: "Frank Herbert", pages: 412)\nprint(f"{b.title} by {b.author} ({b.pages}p)")\n`
  },
  {
    task: "Write a Mycel program with a class implementing the Printable interface with toString().",
    code: `class User: Printable {\n  let username: String\n  init(username: String) { self.username = username }\n  fn toString() -> String => f"User({self.username})"\n}\nlet u = User(username: "antigravity")\nprint(u.toString())\n`
  },
  {
    task: "Write a Mycel program with a StopWatch class that tracks elapsed iterations.",
    code: `class StopWatch {\n  var ticks: Int = 0\n  fn tick() { self.ticks += 1 }\n  fn elapsed() -> Int => self.ticks\n}\nlet sw = StopWatch()\nfor _ in 0..5 { sw.tick() }\nprint(f"Elapsed: {sw.elapsed()}")\n`
  },
  {
    task: "Write a Mycel program demonstrating polymorphism by storing base Animal objects and invoking speak().",
    code: `class Animal {\n  let name: String\n  init(name: String) { self.name = name }\n  fn speak() -> String => ""\n}\nclass Cat: Animal {\n  init(name: String) { super.init(name: name) }\n  override fn speak() -> String => "Meow"\n}\nclass Cow: Animal {\n  init(name: String) { super.init(name: name) }\n  override fn speak() -> String => "Moo"\n}\nlet barn: [Animal] = [Cat(name: "Whiskers"), Cow(name: "Bessie")]\nfor a in barn {\n  print(f"{a.name}: {a.speak()}")\n}\n`
  },
  {
    task: "Write a Mycel program with private fields in a class.",
    code: `class SecretVault {\n  private var secret: String\n  init(secret: String) { self.secret = secret }\n  fn reveal(key: String) -> String {\n    if key == "open" { return self.secret }\n    return "Locked"\n  }\n}\nlet vault = SecretVault(secret: "MyceliumGold")\nprint(vault.reveal("wrong"))\nprint(vault.reveal("open"))\n`
  },
  {
    task: "Write a Mycel program with a class representing a 2D Box with width, height and contains(x, y).",
    code: `class Box {\n  let w: Int\n  let h: Int\n  init(w: Int, h: Int) { self.w = w; self.h = h }\n  fn contains(x: Int, y: Int) -> Bool {\n    return x >= 0 && x <= self.w && y >= 0 && y <= self.h\n  }\n}\nlet b = Box(w: 10, h: 20)\nprint(b.contains(5, 5), b.contains(15, 5))\n`
  },
  {
    task: "Write a Mycel program that defines a Queue class with enqueue and dequeue methods.",
    code: `class Queue<T> {\n  var items: [T] = []\n  fn enqueue(x: T) { self.items.push(x) }\n  fn dequeue() -> T? {\n    if self.items.isEmpty { return nil }\n    return self.items.removeAt(0)\n  }\n}\nlet q = Queue<String>()\nq.enqueue("first")\nq.enqueue("second")\nprint(q.dequeue())\nprint(q.dequeue())\n`
  },
  {
    task: "Write a Mycel program demonstrating class inheritance with 3 levels: Shape -> Polygon -> Triangle.",
    code: `class Shape {\n  fn sides() -> Int => 0\n}\nclass Polygon: Shape {\n  let s: Int\n  init(s: Int) { self.s = s }\n  override fn sides() -> Int => self.s\n}\nclass Triangle: Polygon {\n  init() { super.init(s: 3) }\n}\nlet t = Triangle()\nprint(f"Sides: {t.sides()}")\n`
  },
  {
    task: "Write a Mycel program with a custom operator < on a Score class to allow sorting.",
    code: `class Score: Comparable {\n  let points: Int\n  init(points: Int) { self.points = points }\n  operator <(other: Score) -> Bool => self.points < other.points\n}\nlet s1 = Score(points: 50)\nlet s2 = Score(points: 80)\nprint(s1 < s2, s2 < s1)\n`
  },
  {
    task: "Write a Mycel program that tracks object count using a static property in a class.",
    code: `class Widget {\n  let id: Int\n  init(id: Int) { self.id = id }\n}\nvar widgets: [Widget] = []\nfor i in 1..=4 {\n  widgets.push(Widget(id: i))\n}\nprint(f"Created {widgets.length} widgets")\n`
  },
  {
    task: "Write a Mycel program with an Item class that has a discount method.",
    code: `class Item {\n  let name: String\n  let price: Float\n  init(name: String, price: Float) { self.name = name; self.price = price }\n  fn discounted(pct: Float) -> Float => self.price * (1.0 - pct / 100.0)\n}\nlet item = Item(name: "Headphones", price: 60.0)\nprint(f"\${item.discounted(20.0):.2f}")\n`
  },
  {
    task: "Write a Mycel program with a LightSwitch class toggling state.",
    code: `class LightSwitch {\n  var isOn: Bool = false\n  fn toggle() { self.isOn = !self.isOn }\n}\nlet sw = LightSwitch()\nsw.toggle()\nprint(sw.isOn)\nsw.toggle()\nprint(sw.isOn)\n`
  },
  {
    task: "Write a Mycel program with a Student class containing a list of grades and computing the average.",
    code: `class Student {\n  let name: String\n  var grades: [Int] = []\n  init(name: String) { self.name = name }\n  fn addGrade(g: Int) { self.grades.push(g) }\n  fn average() -> Float => sum(self.grades).toFloat() / self.grades.length.toFloat()\n}\nlet s = Student(name: "Charlie")\ns.addGrade(80)\ns.addGrade(90)\ns.addGrade(100)\nprint(f"{s.name} avg: {s.average():.1f}")\n`
  },
  {
    task: "Write a Mycel program with an override of toString() in a custom class.",
    code: `class Color {\n  let r: Int; let g: Int; let b: Int\n  init(r: Int, g: Int, b: Int) { self.r = r; self.g = g; self.b = b }\n  fn toString() -> String => f"rgb({self.r},{self.g},{self.b})"\n}\nlet c = Color(r: 255, g: 128, b: 0)\nprint(c.toString())\n`
  },
  {
    task: "Write a Mycel program demonstrating that classes have reference equality and mutable state.",
    code: `class BoxRef {\n  var value: Int\n  init(value: Int) { self.value = value }\n}\nlet b1 = BoxRef(value: 10)\nlet b2 = b1\nb2.value = 99\nprint(b1.value, b2.value)\n`
  },

  // 13. Structs (221-235)
  {
    task: "Write a Mycel program defining a Point struct with fields x and y.",
    code: `struct Point { let x: Int, y: Int }\nlet p = Point(x: 3, y: 4)\nprint(f"Point({p.x}, {p.y})")\n`
  },
  {
    task: "Write a Mycel program demonstrating structural equality `==` on structs.",
    code: `struct Point { let x: Int, y: Int }\nlet p1 = Point(x: 5, y: 10)\nlet p2 = Point(x: 5, y: 10)\nlet p3 = Point(x: 5, y: 20)\nprint(p1 == p2, p1 == p3)\n`
  },
  {
    task: "Write a Mycel program demonstrating the generated `.with(...)` copy method on a struct.",
    code: `struct Config { let host: String, port: Int }\nlet c1 = Config(host: "localhost", port: 8080)\nlet c2 = c1.with(port: 9000)\nprint(c1.port, c2.port, c2.host)\n`
  },
  {
    task: "Write a Mycel program defining an RGBColor struct with red, green, blue fields.",
    code: `struct RGBColor { let r: Int, g: Int, b: Int }\nlet white = RGBColor(r: 255, g: 255, b: 255)\nlet gray = white.with(r: 128, g: 128, b: 128)\nprint(white.r, gray.r)\n`
  },
  {
    task: "Write a Mycel program defining an immutable DateVal struct with year, month, day.",
    code: `struct DateVal { let year: Int, month: Int, day: Int }\nlet d1 = DateVal(year: 2026, month: 11, day: 7)\nlet d2 = d1.with(day: 8)\nprint(f"{d1.year}-{d1.month}-{d1.day}")\nprint(f"{d2.year}-{d2.month}-{d2.day}")\n`
  },
  {
    task: "Write a Mycel program with a struct representing a Money value (currency and amount in cents).",
    code: `struct Money { let currency: String, cents: Int }\nlet m1 = Money(currency: "USD", cents: 1500)\nlet m2 = m1.with(cents: 2000)\nprint(m1.currency, m1.cents, m2.cents)\n`
  },
  {
    task: "Write a Mycel program with a struct containing a method.",
    code: `struct Size { let w: Int, h: Int\n  fn area() -> Int => self.w * self.h\n}\nlet s = Size(w: 6, h: 7)\nprint(f"Area: {s.area()}")\n`
  },
  {
    task: "Write a Mycel program with an array of structs sorted by a field.",
    code: `struct UserScore { let name: String, score: Int }\nlet table = [UserScore(name: "A", score: 50), UserScore(name: "B", score: 90), UserScore(name: "C", score: 75)]\nlet sorted = table.sortedBy(u => u.score)\nfor u in sorted {\n  print(f"{u.name}: {u.score}")\n}\n`
  },
  {
    task: "Write a Mycel program testing that structs are immutable values and cannot be mutated directly.",
    code: `struct Coord { let x: Int, y: Int }\nlet c1 = Coord(x: 1, y: 2)\nlet c2 = c1.with(x: 10)\nprint(c1.x, c2.x)\n`
  },
  {
    task: "Write a Mycel program with a LineSegment struct made of two Point structs.",
    code: `struct Point { let x: Int, y: Int }\nstruct Line { let start: Point, end: Point }\nlet line = Line(start: Point(x: 0, y: 0), end: Point(x: 10, y: 20))\nprint(line.start.x, line.end.y)\n`
  },
  {
    task: "Write a Mycel program with a struct representing an HTTP Header (name, value).",
    code: `struct Header { let name: String, value: String }\nlet h1 = Header(name: "Content-Type", value: "application/json")\nprint(f"{h1.name}: {h1.value}")\n`
  },
  {
    task: "Write a Mycel program using a struct as a return type for complex calculation results.",
    code: `struct DivResult { let quotient: Int, remainder: Int }\nfn divide(a: Int, b: Int) -> DivResult {\n  return DivResult(quotient: a.div(b), remainder: a % b)\n}\nlet r = divide(25, 4)\nprint(r.quotient, r.remainder)\n`
  },
  {
    task: "Write a Mycel program checking structural equality of nested structs.",
    code: `struct Inner { let val: Int }\nstruct Outer { let inner: Inner }\nlet o1 = Outer(inner: Inner(val: 42))\nlet o2 = Outer(inner: Inner(val: 42))\nprint(o1 == o2)\n`
  },
  {
    task: "Write a Mycel program with a GeoLocation struct (lat, lon) and a string formatter.",
    code: `struct GeoLocation { let lat: Float, lon: Float }\nlet loc = GeoLocation(lat: 35.6762, lon: 139.6503)\nprint(f"Lat: {loc.lat:.2f}, Lon: {loc.lon:.2f}")\n`
  },
  {
    task: "Write a Mycel program that filters a list of structs with a predicate.",
    code: `struct Product { let name: String, inStock: Bool }\nlet catalog = [Product(name: "Hat", inStock: true), Product(name: "Coat", inStock: false), Product(name: "Boots", inStock: true)]\nlet available = catalog.filter(p => p.inStock)\nfor p in available { print(p.name) }\n`
  },

  // 14. Enums & Pattern Matching (236-265)
  {
    task: "Write a Mycel program defining a Direction enum (North, South, East, West) and matching on it.",
    code: `enum Direction { North, South, East, West }\nfn describe(d: Direction) -> String {\n  return match d {\n    .North => "Heading North"\n    .South => "Heading South"\n    .East => "Heading East"\n    .West => "Heading West"\n  }\n}\nprint(describe(Direction.North))\nprint(describe(.East))\n`
  },
  {
    task: "Write a Mycel program defining a Shape enum with payloads: Circle(r: Float) and Rect(w: Float, h: Float).",
    code: `enum Shape {\n  Circle(r: Float)\n  Rect(w: Float, h: Float)\n}\nfn area(s: Shape) -> Float {\n  return match s {\n    .Circle(r) => 3.14159 * r * r\n    .Rect(w, h) => w * h\n  }\n}\nprint(f"{area(.Circle(r: 2.0)):.2f}")\nprint(f"{area(.Rect(w: 3.0, h: 4.0)):.2f}")\n`
  },
  {
    task: "Write a Mycel program with an enum representing Web traffic status codes.",
    code: `enum Status { Ok, NotFound, ServerError }\nfn code(s: Status) -> Int => match s {\n  .Ok => 200\n  .NotFound => 404\n  .ServerError => 500\n}\nprint(code(.Ok), code(.NotFound))\n`
  },
  {
    task: "Write a Mycel program that uses match on an integer with wildcard `_`.",
    code: `fn label(n: Int) -> String => match n {\n  1 => "one"\n  2 => "two"\n  3 => "three"\n  _ => "many"\n}\nprint(label(1), label(2), label(99))\n`
  },
  {
    task: "Write a Mycel program matching on strings with multiple cases.",
    code: `fn roleLevel(role: String) -> Int => match role {\n  "admin" => 10\n  "editor" => 5\n  "viewer" => 1\n  _ => 0\n}\nprint(roleLevel("admin"), roleLevel("guest"))\n`
  },
  {
    task: "Write a Mycel program using match guards (`if condition`) on number ranges.",
    code: `fn categorize(age: Int) -> String => match age {\n  a if a < 13 => "child"\n  a if a < 20 => "teen"\n  a if a < 65 => "adult"\n  _ => "senior"\n}\nprint(categorize(8), categorize(16), categorize(45), categorize(70))\n`
  },
  {
    task: "Write a Mycel program matching on a list pattern `[first, ..rest]`.",
    code: `fn describeList(items: [Int]) -> String => match items {\n  [] => "empty"\n  [single] => f"single: {single}"\n  [first, ..rest] => f"first: {first}, remaining: {rest.length}"\n}\nprint(describeList([]))\nprint(describeList([42]))\nprint(describeList([1, 2, 3]))\n`
  },
  {
    task: "Write a Mycel program with an enum that has methods and properties.",
    code: `enum TrafficLight {\n  Red, Yellow, Green\n  get canGo: Bool => match self {\n    .Green => true\n    _ => false\n  }\n}\nprint(TrafficLight.Red.canGo, TrafficLight.Green.canGo)\n`
  },
  {
    task: "Write a Mycel program matching on a Result enum (.Ok and .Err).",
    code: `fn checkResult(r: Result<Int, Error>) -> String => match r {\n  .Ok(val) => f"Success with {val}"\n  .Err(e) => f"Failed with {e.message}"\n}\nprint(checkResult(.Ok(100)))\nprint(checkResult(.Err(Error("network down"))))\n`
  },
  {
    task: "Write a Mycel program matching on optional values with .Ok and nil.",
    code: `fn formatOpt(x: String?) -> String => match x {\n  nil => "No value"\n  s => f"Value: {s!}"\n}\nprint(formatOpt(nil), formatOpt("Found"))\n`
  },
  {
    task: "Write a Mycel program with a Message enum representing Chat, Join, Leave events.",
    code: `enum Event {\n  Join(user: String)\n  Chat(user: String, text: String)\n  Leave(user: String)\n}\nfn render(e: Event) -> String => match e {\n  .Join(u) => f"--> {u} joined"\n  .Chat(u, msg) => f"<{u}> {msg}"\n  .Leave(u) => f"<-- {u} left"\n}\nprint(render(.Join(user: "Ada")))\nprint(render(.Chat(user: "Ada", text: "Hello!")))\nprint(render(.Leave(user: "Ada")))\n`
  },
  {
    task: "Write a Mycel program matching on a pair tuple with if/else branches.",
    code: `fn comparePair(p: (Int, Int)) -> String => match p {\n  (a, b) => if a == b { "Equal" } else if a > b { "First larger" } else { "Second larger" }\n}\nprint(comparePair((5, 5)), comparePair((10, 2)), comparePair((3, 7)))\n`
  },
  {
    task: "Write a Mycel program matching on a range pattern `1..=5`.",
    code: `fn rank(rating: Int) -> String => match rating {\n  1..=2 => "Poor"\n  3 => "Average"\n  4..=5 => "Excellent"\n  _ => "Invalid"\n}\nprint(rank(1), rank(3), rank(5), rank(10))\n`
  },
  {
    task: "Write a Mycel program that uses match as an expression assigned to a variable.",
    code: `let day = "Sat"\nlet isWeekend = match day {\n  "Sat" => true\n  "Sun" => true\n  _ => false\n}\nprint(isWeekend)\n`
  },
  {
    task: "Write a Mycel program with a recursive enum representing an arithmetic expression tree.",
    code: `enum Expr {\n  Num(Int)\n  Add(Int, Int)\n  Mul(Int, Int)\n}\nfn eval(e: Expr) -> Int => match e {\n  .Num(n) => n\n  .Add(a, b) => a + b\n  .Mul(a, b) => a * b\n}\nprint(eval(.Num(5)), eval(.Add(3, 4)), eval(.Mul(6, 7)))\n`
  },
  {
    task: "Write a Mycel program matching boolean values exhaustively without wildcard.",
    code: `fn boolText(b: Bool) -> String => match b {\n  true => "YES"\n  false => "NO"\n}\nprint(boolText(true), boolText(false))\n`
  },
  {
    task: "Write a Mycel program matching enum with multiple variants using comma separation.",
    code: `enum Season { Spring, Summer, Autumn, Winter }\nfn isWarm(s: Season) -> Bool => match s {\n  .Summer => true\n  .Spring => true\n  _ => false\n}\nprint(isWarm(.Summer), isWarm(.Winter))\n`
  },
  {
    task: "Write a Mycel program matching an optional integer with `nil` and `some` bindings.",
    code: `fn unwrapOrDefault(opt: Int?, def: Int) -> Int => match opt {\n  nil => def\n  x => x!\n}\nprint(unwrapOrDefault(nil, 42), unwrapOrDefault(10, 42))\n`
  },
  {
    task: "Write a Mycel program checking leading dot enum notation when passing to a typed function parameter.",
    code: `enum Priority { Low, Medium, High }\nfn handle(p: Priority) -> String => match p {\n  .Low => "Later"\n  .Medium => "Soon"\n  .High => "Now!"\n}\nprint(handle(.High))\n`
  },
  {
    task: "Write a Mycel program matching on a 3-element list pattern.",
    code: `fn matchTriple(items: [Int]) -> String => match items {\n  [a, b, c] => f"Triplet: {a}+{b}+{c} = {a+b+c}"\n  _ => "Not a triplet"\n}\nprint(matchTriple([1, 2, 3]), matchTriple([1, 2]))\n`
  },
  {
    task: "Write a Mycel program matching on temperature thresholds with pattern guards.",
    code: `fn stateOfWater(temp: Int) -> String => match temp {\n  t if t <= 0 => "Solid (Ice)"\n  t if t >= 100 => "Gas (Steam)"\n  _ => "Liquid (Water)"\n}\nprint(stateOfWater(-5), stateOfWater(25), stateOfWater(105))\n`
  },
  {
    task: "Write a Mycel program defining a Command enum with Quit, Help, and Move(dx: Int, dy: Int).",
    code: `enum Command {\n  Quit\n  Help\n  Move(dx: Int, dy: Int)\n}\nfn execute(cmd: Command) -> String => match cmd {\n  .Quit => "Exiting..."\n  .Help => "Showing help..."\n  .Move(x, y) => f"Moving by ({x}, {y})"\n}\nprint(execute(.Help))\nprint(execute(.Move(dx: 5, dy: -2)))\n`
  },
  {
    task: "Write a Mycel program with a Json-like tree enum matching.",
    code: `enum SimpleVal { Str(String), Num(Int) }\nfn toStr(v: SimpleVal) -> String => match v {\n  .Str(s) => s\n  .Num(n) => f"{n}"\n}\nprint(toStr(.Str("hello")), toStr(.Num(42)))\n`
  },
  {
    task: "Write a Mycel program demonstrating that missing match arms on an enum causes a compile error if not exhaustive.",
    code: `enum Flag { On, Off }\nfn inspect(f: Flag) -> String => match f {\n  .On => "Active"\n  .Off => "Inactive"\n}\nprint(inspect(.On), inspect(.Off))\n`
  },
  {
    task: "Write a Mycel program matching on characters.",
    code: `fn charType(c: Char) -> String => match c {\n  'a' => "first vowel"\n  'z' => "last letter"\n  _ => "other"\n}\nprint(charType('a'), charType('z'), charType('m'))\n`
  },

  // 15. Interfaces & Extensions (266-295)
  {
    task: "Write a Mycel program defining a Describable interface and implementing it in a class.",
    code: `interface Describable {\n  fn describe() -> String\n}\nclass Widget: Describable {\n  let name: String\n  init(name: String) { self.name = name }\n  fn describe() -> String => f"Widget({self.name})"\n}\nlet w: Describable = Widget(name: "Gear")\nprint(w.describe())\n`
  },
  {
    task: "Write a Mycel program with an interface containing a default method.",
    code: `interface Greeter {\n  fn name() -> String\n  fn hello() -> String => f"Hello, {self.name()}!"\n}\nclass Bot: Greeter {\n  fn name() -> String => "MycelBot"\n}\nlet b = Bot()\nprint(b.hello())\n`
  },
  {
    task: "Write a Mycel program where a class implements multiple interfaces.",
    code: `interface Named { fn name() -> String }\ninterface Sized { fn size() -> Int }\nclass BoxItem: Named, Sized {\n  fn name() -> String => "StorageBox"\n  fn size() -> Int => 50\n}\nlet b = BoxItem()\nprint(f"{b.name()}: {b.size()}L")\n`
  },
  {
    task: "Write a Mycel program extending Int with a squared() method.",
    code: `extend Int {\n  fn squared() -> Int => self * self\n}\nprint(7.squared(), 12.squared())\n`
  },
  {
    task: "Write a Mycel program extending String with an isBlank() method.",
    code: `extend String {\n  fn isBlank() -> Bool => self.trim().isEmpty\n}\nprint("   ".isBlank(), "hello".isBlank())\n`
  },
  {
    task: "Write a Mycel program extending String with a wordCount() method.",
    code: `extend String {\n  fn wordCount() -> Int => self.trim().split(" ").filter(w => !w.isEmpty).length\n}\nprint("The quick brown fox".wordCount())\n`
  },
  {
    task: "Write a Mycel program extending Array with a sumInts() method.",
    code: `extend [Int] {\n  fn sumInts() -> Int => sum(self)\n}\nprint([10, 20, 30].sumInts())\n`
  },
  {
    task: "Write a Mycel program extending Float with a toDollars() string formatter.",
    code: `extend Float {\n  fn toDollars() -> String => f"\${self:.2f}"\n}\nprint(19.99.toDollars())\n`
  },
  {
    task: "Write a Mycel program with an interface hierarchy where one interface extends another.",
    code: `interface BaseShape { fn area() -> Float }\ninterface ColoredShape: BaseShape { fn color() -> String }\nclass RedCircle: ColoredShape {\n  fn area() -> Float => 3.14159\n  fn color() -> String => "red"\n}\nlet c = RedCircle()\nprint(f"{c.color()} shape area: {c.area():.2f}")\n`
  },
  {
    task: "Write a Mycel program extending Int with a factorial() method.",
    code: `extend Int {\n  fn factorial() -> Int {\n    var res = 1\n    for i in 1..=self { res *= i }\n    return res\n  }\n}\nprint(5.factorial())\n`
  },
  {
    task: "Write a Mycel program that extends Char with a isVowel() method.",
    code: `extend Char {\n  fn isVowel() -> Bool => self in "aeiouAEIOU"\n}\nprint('e'.isVowel(), 'k'.isVowel())\n`
  },
  {
    task: "Write a Mycel program with a function taking any object conforming to Printable.",
    code: `fn logItem(p: Printable) {\n  print(f"[LOG] {p.toString()}")\n}\nclass Item: Printable {\n  fn toString() -> String => "CustomItem"\n}\nlogItem(Item())\n`
  },
  {
    task: "Write a Mycel program that extends String with a duplicate(n) method.",
    code: `extend String {\n  fn dup(n: Int) -> String => self.repeat(n)\n}\nprint("abc".dup(3))\n`
  },
  {
    task: "Write a Mycel program extending Int with an isPrime() method.",
    code: `extend Int {\n  fn isPrime() -> Bool {\n    if self < 2 { return false }\n    for d in 2..self {\n      if self % d == 0 { return false }\n    }\n    return true\n  }\n}\nprint(7.isPrime(), 10.isPrime(), 13.isPrime())\n`
  },
  {
    task: "Write a Mycel program extending Array with a second element method.",
    code: `extend<T> [T] {\n  fn second() -> T? => if self.length > 1 { self[1] } else { nil }\n}\nprint([10, 20, 30].second(), [10].second() == nil)\n`
  },

  // 16. Error Handling & Result (296-315)
  {
    task: "Write a Mycel program that wraps a success and failure in Result<T, Error> and tests .isOk and .isErr.",
    code: `fn parsePositive(text: String) -> Result<Int, Error> {\n  let n = Int.parse(text)\n  if n == nil { return .Err(Error("invalid number")) }\n  if n! <= 0 { return .Err(Error("must be positive")) }\n  return .Ok(n!)\n}\nprint(parsePositive("42").isOk)\nprint(parsePositive("-5").isErr)\n`
  },
  {
    task: "Write a Mycel program using the `?` operator to propagate Results across multiple function calls.",
    code: `fn step1() -> Result<Int, Error> => .Ok(10)\nfn step2(n: Int) -> Result<Int, Error> => .Ok(n * 2)\nfn workflow() -> Result<Int, Error> {\n  let a = step1()?\n  let b = step2(a)?\n  return .Ok(b + 5)\n}\nprint(workflow().unwrap())\n`
  },
  {
    task: "Write a Mycel program that uses .unwrapOr() on a Result to supply a default fallback.",
    code: `let r1: Result<Int, Error> = .Ok(42)\nlet r2: Result<Int, Error> = .Err(Error("failed"))\nprint(r1.unwrapOr(0), r2.unwrapOr(0))\n`
  },
  {
    task: "Write a Mycel program using try / catch to handle thrown Error exceptions.",
    code: `fn risky(fail: Bool) {\n  if fail { throw Error("Something broke!") }\n  print("All good")\n}\ntry {\n  risky(false)\n  risky(true)\n} catch e {\n  print(f"Caught error: {e.message}")\n}\n`
  },
  {
    task: "Write a Mycel program with a custom Error subclass and typed catch block.",
    code: `class ValidationError: Error {}\nfn validateAge(age: Int) {\n  if age < 0 { throw ValidationError("Negative age") }\n}\ntry {\n  validateAge(-1)\n} catch e: ValidationError {\n  print(f"Validation failed: {e.message}")\n}\n`
  },
  {
    task: "Write a Mycel program demonstrating the finally block in try / catch.",
    code: `var cleanedUp = false\ntry {\n  throw Error("Oops")\n} catch e {\n  print("Handling error")\n} finally {\n  cleanedUp = true\n}\nprint(f"Cleaned up: {cleanedUp}")\n`
  },
  {
    task: "Write a Mycel program that maps a Result value using .map().",
    code: `let r: Result<Int, Error> = .Ok(21)\nlet doubled = r.map(x => x * 2)\nprint(doubled.unwrap())\n`
  },
  {
    task: "Write a Mycel program using try expression to turn a throwing call into a Result.",
    code: `fn thrower() -> Int {\n  throw Error("Kaboom")\n}\nlet res = try thrower()\nprint(res.isErr)\n`
  },
  {
    task: "Write a Mycel program demonstrating unwrap on an Ok Result.",
    code: `let r: Result<String, Error> = .Ok("payload")\nprint(r.unwrap())\n`
  },
  {
    task: "Write a Mycel program handling multiple error types in sequence.",
    code: `class ParseErr: Error {}\nclass RangeErr: Error {}\nfn parseInRange(s: String) {\n  let n = Int.parse(s)\n  if n == nil { throw ParseErr("not an int") }\n  if n! < 0 || n! > 100 { throw RangeErr("out of range") }\n  print(f"Valid: {n!}")\n}\ntry {\n  parseInRange("abc")\n} catch e: ParseErr {\n  print("Parse issue")\n}\ntry {\n  parseInRange("999")\n} catch e: RangeErr {\n  print("Range issue")\n}\n`
  },
  {
    task: "Write a Mycel program that chains Results with .andThen().",
    code: `fn parseNum(s: String) -> Result<Int, Error> {\n  let n = Int.parse(s)\n  if n == nil { return .Err(Error("bad")) }\n  return .Ok(n!)\n}\nfn mustBePositive(n: Int) -> Result<Int, Error> {\n  if n <= 0 { return .Err(Error("negative")) }\n  return .Ok(n)\n}\nlet res = parseNum("50").andThen(n => mustBePositive(n))\nprint(res.isOk, res.unwrap())\n`
  },
  {
    task: "Write a Mycel program that maps an error message with .mapErr().",
    code: `let r: Result<Int, Error> = .Err(Error("low-level error"))\nlet mapped = r.mapErr(e => Error(f"High-level context: {e.message}"))\nprint(mapped.err()?.message)\n`
  },
  {
    task: "Write a Mycel program that catches an error, logs it, and re-throws a wrapped error.",
    code: `fn process() {\n  try {\n    throw Error("disk error")\n  } catch e {\n    throw Error(f"App error caused by {e.message}")\n  }\n}\ntry {\n  process()\n} catch e {\n  print(e.message)\n}\n`
  },
  {
    task: "Write a Mycel program that returns an optional .ok() from a Result.",
    code: `let r: Result<Int, Error> = .Ok(123)\nprint(r.ok())\nlet rErr: Result<Int, Error> = .Err(Error("fail"))\nprint(rErr.ok() == nil)\n`
  },
  {
    task: "Write a Mycel program that returns an optional .err() from a Result.",
    code: `let r: Result<Int, Error> = .Err(Error("boom"))\nprint(r.err()?.message)\n`
  },

  // 17. Standard Library (316-345)
  {
    task: "Write a Mycel program using math to calculate the square root of 144.0.",
    code: `import math\nprint(math.sqrt(144.0))\n`
  },
  {
    task: "Write a Mycel program using math to calculate sine and cosine of math.PI / 2.0.",
    code: `import math\nlet angle = math.PI / 2.0\nprint(f"sin: {math.sin(angle):.1f}")\n`
  },
  {
    task: "Write a Mycel program using math to find the hypotenuse of a right triangle with sides 3.0 and 4.0.",
    code: `import math\nprint(math.hypot(3.0, 4.0))\n`
  },
  {
    task: "Write a Mycel program using math to calculate the greatest common divisor of 54 and 24.",
    code: `import math\nprint(math.gcd(54, 24))\n`
  },
  {
    task: "Write a Mycel program using json to encode an array and map into JSON text.",
    code: `import json\nlet data: {String: Any} = {"name": "Mycel", "version": 1}\nprint(json.encode(data))\n`
  },
  {
    task: "Write a Mycel program using json to parse JSON text and access fields.",
    code: `import json\nlet text = "{\\"score\\": 98, \\"user\\": \\"ada\\"}"\nlet parsed = json.parse(text).unwrap()\nprint(parsed["user"], parsed["score"])\n`
  },
  {
    task: "Write a Mycel program using crypto to compute the sha256 hash of 'mycel'.",
    code: `import crypto\nlet h = crypto.sha256("mycel")\nprint(h.substring(0, 16))\n`
  },
  {
    task: "Write a Mycel program using crypto to generate a UUID string.",
    code: `import crypto\nlet u = crypto.uuid()\nprint(u.length == 36)\n`
  },
  {
    task: "Write a Mycel program using crypto to base64 encode and decode a string.",
    code: `import crypto\nlet original = "Hello Mycel!"\nlet enc = crypto.base64Encode(original)\nprint(enc)\nlet dec = crypto.base64Decode(enc).unwrap()\nprint(dec)\n`
  },
  {
    task: "Write a Mycel program using re to check if an email matches a basic regex pattern.",
    code: `import re\nlet r = re.Regex.compile("^[a-z]+@[a-z]+\\\\.[a-z]+$").unwrap()\nprint(r.isMatch("test@example.com"))\nprint(r.isMatch("bad-email"))\n`
  },
  {
    task: "Write a Mycel program using re to find all numbers in a string.",
    code: `import re\nlet r = re.Regex.compile("\\\\d+").unwrap()\nlet matches = r.findAll("Item 1 costs $25, Item 2 costs $80")\nfor m in matches {\n  write(f"{m.text} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program using re to replace all digits with an 'X'.",
    code: `import re\nlet r = re.Regex.compile("\\\\d").unwrap()\nprint(r.replace("Pin: 1234", "X"))\n`
  },
  {
    task: "Write a Mycel program using time to get current date as YYYY-MM-DD.",
    code: `import time\nlet d = time.today()\nprint(d.length == 10)\n`
  },
  {
    task: "Write a Mycel program using time.Duration to convert 3 minutes to seconds and milliseconds.",
    code: `import time\nlet dur = time.minutes(3)\nprint(dur.toSeconds(), dur.toMs())\n`
  },
  {
    task: "Write a Mycel program using env to check an environment variable or default.",
    code: `import env\nlet p = env.get("NONEXISTENT_VAR").unwrap() ?? "my_default"\nprint(p)\n`
  },
  {
    task: "Write a Mycel program using fs to write and read text from a temporary file.",
    code: `import fs\nfn main() {\n  let tmp = "mycel_instruct_test.txt"\n  fs.writeText(tmp, "Hello from fs!").unwrap()\n  let content = fs.readText(tmp).unwrap()\n  print(content)\n  fs.remove(tmp).unwrap()\n}\n`
  },
  {
    task: "Write a Mycel program using fs to test file existence.",
    code: `import fs\nfn main() {\n  let tmp = "mycel_exists_check.txt"\n  print(fs.exists(tmp).unwrap())\n  fs.writeText(tmp, "exists").unwrap()\n  print(fs.exists(tmp).unwrap())\n  fs.remove(tmp).unwrap()\n}\n`
  },
  {
    task: "Write a Mycel program using json pretty-printing on a nested Json object.",
    code: `import json\nlet doc = json.parse("{\\"a\\": 1, \\"b\\": [2, 3]}").unwrap()\nprint(json.stringify(doc))\n`
  },
  {
    task: "Write a Mycel program using math to convert degrees to radians and back.",
    code: `import math\nlet rad = math.radians(180.0)\nlet deg = math.degrees(rad)\nprint(f"Rad: {rad:.4f}, Deg: {deg:.1f}")\n`
  },
  {
    task: "Write a Mycel program using crypto to generate a random 8-byte hex string.",
    code: `import crypto\nlet hex = crypto.randomHex(8)\nprint(hex.length == 16)\n`
  },

  // 18. Tests, Generators & Pipeline (346-360)
  {
    task: "Write a Mycel program defining a unit test block using test \"...\".",
    code: `test "basic addition" {\n  assert(1 + 1 == 2, "math works")\n}\nprint("tests passed")\n`
  },
  {
    task: "Write a Mycel program defining multiple unit test blocks.",
    code: `test "string length" {\n  assert("abc".length == 3)\n}\ntest "array operations" {\n  var a = [1, 2]\n  a.push(3)\n  assert(a.length == 3)\n}\nprint("all tests verified")\n`
  },
  {
    task: "Write a Mycel program with a generator function that yields numbers 1, 2, 3.",
    code: `gen fn count3() -> Gen<Int> {\n  yield 1\n  yield 2\n  yield 3\n}\nfor n in count3() {\n  write(f"{n} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program with a generator function that yields elements of an array doubled.",
    code: `gen fn doubleEach(items: [Int]) -> Gen<Int> {\n  for item in items {\n    yield item * 2\n  }\n}\nlet res = doubleEach([5, 10, 15]).toArray()\nprint(res)\n`
  },
  {
    task: "Write a Mycel program with a generator yielding Fibonacci sequence up to n terms.",
    code: `gen fn fibGen(count: Int) -> Gen<Int> {\n  var a = 0\n  var b = 1\n  for _ in 0..count {\n    yield a\n    let next = a + b\n    a = b\n    b = next\n  }\n}\nprint(fibGen(6).toArray())\n`
  },
  {
    task: "Write a Mycel program demonstrating the assert() function with condition.",
    code: `assert(2 * 2 == 4)\nassert("mycel".startsWith("my"))\nprint("Assertions passed")\n`
  },
  {
    task: "Write a Mycel program that transforms a list using pipeline operator `|>`.",
    code: `fn doubleAll(xs: [Int]) -> [Int] => xs.map(x => x * 2)\nfn sumAll(xs: [Int]) -> Int => sum(xs)\nlet total = [1, 2, 3, 4] |> doubleAll |> sumAll\nprint(total)\n`
  },
  {
    task: "Write a Mycel program with a generator that filters values.",
    code: `gen fn evensOnly(items: [Int]) -> Gen<Int> {\n  for x in items {\n    if x % 2 == 0 { yield x }\n  }\n}\nprint(evensOnly([1, 2, 3, 4, 5, 6]).toArray())\n`
  },
  {
    task: "Write a Mycel program showing that `test` blocks can assert map and set values.",
    code: `test "set and map" {\n  let s = Set([1, 2])\n  assert(s.has(1))\n  let m = {"k": "v"}\n  assert(m["k"] == "v")\n}\nprint("collection test ok")\n`
  },
  {
    task: "Write a Mycel program chaining generator output into an array and sorting it.",
    code: `gen fn unsortedGen() -> Gen<Int> {\n  yield 40\n  yield 10\n  yield 30\n  yield 20\n}\nprint(unsortedGen().toArray().sorted())\n`
  },

  // 19. Interactive Programs with input() (361-370)
  {
    task: "Write a Mycel program that prompts the user for their name and greets them.",
    code: `let name = input("Enter your name: ")\nprint(f"Hello, {name}!")\n`,
    inputs: ["Alex"]
  },
  {
    task: "Write a Mycel program that reads two numbers from input and prints their sum.",
    code: `let aStr = input("First number: ")\nlet bStr = input("Second number: ")\nlet a = Int.parse(aStr) ?? 0\nlet b = Int.parse(bStr) ?? 0\nprint(f"Sum: {a + b}")\n`,
    inputs: ["15", "25"]
  },
  {
    task: "Write a Mycel program that asks for a temperature in Celsius and displays it in Fahrenheit.",
    code: `let cStr = input("Celsius: ")\nlet c = Float.parse(cStr) ?? 0.0\nlet f = (c * 9.0 / 5.0) + 32.0\nprint(f"Fahrenheit: {f:.1f}")\n`,
    inputs: ["25.0"]
  },
  {
    task: "Write a Mycel program that repeatedly prompts for words until 'done' is entered.",
    code: `var words: [String] = []\nwhile true {\n  let w = input("Word: ")\n  if w == "done" { break }\n  words.push(w)\n}\nlet sep = ", "\nprint(f"Collected: {words.join(sep)}")\n`,
    inputs: ["apple", "banana", "done"]
  },
  {
    task: "Write a Mycel program that asks a quiz question and checks if the answer is correct.",
    code: `let ans = input("What is the capital of France? ")\nif ans.trim().lower() == "paris" {\n  print("Correct!")\n} else {\n  print("Incorrect")\n}\n`,
    inputs: ["Paris"]
  },
  {
    task: "Write a Mycel program that asks for an integer and prints its multiplication table up to 5.",
    code: `let nStr = input("Number: ")\nlet n = Int.parse(nStr) ?? 1\nfor i in 1..=5 {\n  print(f"{n} x {i} = {n * i}")\n}\n`,
    inputs: ["4"]
  },
  {
    task: "Write a Mycel program that asks for a yes/no confirmation and returns a boolean.",
    code: `let resp = input("Proceed? (y/n): ")\nlet ok = resp.lower().startsWith("y")\nprint(f"Confirmed: {ok}")\n`,
    inputs: ["yes"]
  },
  {
    task: "Write a Mycel program that asks for a sentence and prints its word count.",
    code: `let text = input("Enter text: ")\nlet count = text.trim().split(" ").filter(w => !w.isEmpty).length\nprint(f"Words: {count}")\n`,
    inputs: ["Mycel makes coding readable"]
  },
  {
    task: "Write a Mycel program that asks for a secret password and verifies it.",
    code: `let pw = input("Password: ")\nif pw == "secret123" {\n  print("Access granted")\n} else {\n  print("Access denied")\n}\n`,
    inputs: ["secret123"]
  },
  {
    task: "Write a Mycel program that reads a list of comma-separated tags and displays them sorted.",
    code: `let raw = input("Tags: ")\nlet tags = raw.split(",").map(t => t.trim()).sorted()\nlet sep = " | "\nprint(f"Sorted tags: {tags.join(sep)}")\n`,
    inputs: ["rust, python, mycel, go"]
  },

  // 20. Algorithms & Real-World Mini-Apps (371-395)
  {
    task: "Write a Mycel program implementing binary search on a sorted integer list.",
    code: `fn binarySearch(items: [Int], target: Int) -> Int? {\n  var lo = 0\n  var hi = items.length - 1\n  while lo <= hi {\n    let mid = lo + (hi - lo).div(2)\n    if items[mid] == target { return mid }\n    if items[mid] < target { lo = mid + 1 } else { hi = mid - 1 }\n  }\n  return nil\n}\nlet nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]\nprint(binarySearch(nums, 23))\nprint(binarySearch(nums, 99) == nil)\n`
  },
  {
    task: "Write a Mycel program implementing Bubble Sort on an array of integers.",
    code: `fn bubbleSort(items: [Int]) -> [Int] {\n  let arr = items.copy()\n  let n = arr.length\n  for i in 0..n {\n    for j in 0..(n - i - 1) {\n      if arr[j] > arr[j + 1] {\n        let tmp = arr[j]\n        arr[j] = arr[j + 1]\n        arr[j + 1] = tmp\n      }\n    }\n  }\n  return arr\n}\nprint(bubbleSort([64, 34, 25, 12, 22, 11, 90]))\n`
  },
  {
    task: "Write a Mycel program implementing Insertion Sort.",
    code: `fn insertionSort(arr: [Int]) -> [Int] {\n  let res = arr.copy()\n  for i in 1..res.length {\n    let key = res[i]\n    var j = i - 1\n    while j >= 0 && res[j] > key {\n      res[j + 1] = res[j]\n      j -= 1\n    }\n    res[j + 1] = key\n  }\n  return res\n}\nprint(insertionSort([12, 11, 13, 5, 6]))\n`
  },
  {
    task: "Write a Mycel program that computes the Run-Length Encoding (RLE) of a string.",
    code: `fn rle(s: String) -> String {\n  if s.isEmpty { return "" }\n  var encoded: [String] = []\n  var currentChar = s.substring(0, 1)\n  var count = 1\n  for i in 1..s.length {\n    let ch = s.substring(i, i + 1)\n    if ch == currentChar {\n      count += 1\n    } else {\n      encoded.push(f"{count}{currentChar}")\n      currentChar = ch\n      count = 1\n    }\n  }\n  encoded.push(f"{count}{currentChar}")\n  return encoded.join("")\n}\nprint(rle("WWWWWWWWWWWWBWWWWWWWWWWWWBBBWWWWWWWWWWWWWWWWWWWWWWWWB"))\n`
  },
  {
    task: "Write a Mycel program that encodes and decodes text using a Caesar cipher with a shift of 3.",
    code: `fn caesar(text: String, shift: Int) -> String {\n  var res: [String] = []\n  for ch in text {\n    if ch.isLetter {\n      let base = if ch.isUpper { 'A'.code } else { 'a'.code }\n      let offset = (ch.code - base + shift) % 26\n      let newCode = base + (if offset < 0 { offset + 26 } else { offset })\n      res.push(Char.fromCode(newCode).toString())\n    } else {\n      res.push(ch.toString())\n    }\n  }\n  return res.join("")\n}\nlet enc = caesar("Hello, Mycel!", 3)\nprint(enc)\nlet dec = caesar(enc, -3)\nprint(dec)\n`
  },
  {
    task: "Write a Mycel program that checks if two strings are anagrams of each other.",
    code: `fn areAnagrams(s1: String, s2: String) -> Bool {\n  let clean1 = s1.lower().trim().chars().sorted()\n  let clean2 = s2.lower().trim().chars().sorted()\n  return clean1 == clean2\n}\nprint(areAnagrams("listen", "silent"))\nprint(areAnagrams("triangle", "integral"))\nprint(areAnagrams("apple", "pale"))\n`
  },
  {
    task: "Write a Mycel program implementing a simple Todo List manager class.",
    code: `class TodoList {\n  var items: [String] = []\n  fn add(task: String) { self.items.push(task) }\n  fn complete(index: Int) -> String? {\n    if index >= 0 && index < self.items.length {\n      return self.items.removeAt(index)\n    }\n    return nil\n  }\n  fn listAll() {\n    for i, t in self.items {\n      print(f"{i + 1}. {t}")\n    }\n  }\n}\nlet todo = TodoList()\ntodo.add("Learn Mycel")\ntodo.add("Write datasets")\ntodo.listAll()\ntodo.complete(0)\nprint("Remaining:")\ntodo.listAll()\n`
  },
  {
    task: "Write a Mycel program that parses simple key=value pairs into a map.",
    code: `fn parseIni(content: String) -> {String: String} {\n  var conf: {String: String} = {}\n  for line in content.lines() {\n    let trimmed = line.trim()\n    if trimmed.isEmpty || trimmed.startsWith("#") { continue }\n    let parts = trimmed.split("=")\n    if parts.length == 2 {\n      conf[parts[0].trim()] = parts[1].trim()\n    }\n  }\n  return conf\n}\nlet ini = """\n# App config\nhost=0.0.0.0\nport=8080\nmode=production\n"""\nlet c = parseIni(ini)\nprint(c["host"], c["port"], c["mode"])\n`
  },
  {
    task: "Write a Mycel program that finds the longest common prefix among an array of strings.",
    code: `fn longestCommonPrefix(words: [String]) -> String {\n  if words.isEmpty { return "" }\n  var prefix = words[0]\n  for i in 1..words.length {\n    while !words[i].startsWith(prefix) {\n      prefix = prefix.substring(0, prefix.length - 1)\n      if prefix.isEmpty { return "" }\n    }\n  }\n  return prefix\n}\nprint(longestCommonPrefix(["flower", "flow", "flight"]))\nprint(longestCommonPrefix(["dog", "racecar", "car"]))\n`
  },
  {
    task: "Write a Mycel program implementing a Matrix Transpose function.",
    code: `fn transpose(m: [[Int]]) -> [[Int]] {\n  let rows = m.length\n  let cols = m[0].length\n  var res: [[Int]] = []\n  for c in 0..cols {\n    var newRow: [Int] = []\n    for r in 0..rows {\n      newRow.push(m[r][c])\n    }\n    res.push(newRow)\n  }\n  return res\n}\nlet mat = [[1, 2, 3], [4, 5, 6]]\nprint(transpose(mat))\n`
  },
  {
    task: "Write a Mycel program implementing Pascal's Triangle up to 5 rows.",
    code: `fn pascalsTriangle(rows: Int) -> [[Int]] {\n  var triangle: [[Int]] = []\n  for r in 0..rows {\n    var row: [Int] = [1]\n    if r > 0 {\n      let prev = triangle[r - 1]\n      for i in 0..(prev.length - 1) {\n        row.push(prev[i] + prev[i + 1])\n      }\n      row.push(1)\n    }\n    triangle.push(row)\n  }\n  return triangle\n}\nfor row in pascalsTriangle(5) {\n  print(row)\n}\n`
  },
  {
    task: "Write a Mycel program implementing a simple LRU-style cache with max capacity.",
    code: `class SimpleCache {\n  let capacity: Int\n  var keys: [String] = []\n  var store: {String: String} = {}\n  init(capacity: Int) { self.capacity = capacity }\n  fn put(k: String, v: String) {\n    if k in self.store {\n      self.store[k] = v\n      return\n    }\n    if self.keys.length >= self.capacity {\n      let oldest = self.keys.removeAt(0)\n      self.store.remove(oldest)\n    }\n    self.keys.push(k)\n    self.store[k] = v\n  }\n  fn get(k: String) -> String? => self.store.get(k)\n}\nlet c = SimpleCache(capacity: 2)\nc.put("a", "1")\nc.put("b", "2")\nc.put("c", "3")\nprint(c.get("a") == nil, c.get("b"), c.get("c"))\n`
  },
  {
    task: "Write a Mycel program that computes the frequency of characters in a string.",
    code: `fn charFreq(s: String) -> {String: Int} {\n  var counts: {String: Int} = {}\n  for ch in s {\n    let k = ch.toString()\n    counts[k] = counts.get(k, 0) + 1\n  }\n  return counts\n}\nlet f = charFreq("mississippi")\nprint(f["m"], f["i"], f["s"], f["p"])\n`
  },
  {
    task: "Write a Mycel program calculating moving averages of a list of numbers with window size 3.",
    code: `fn movingAverage(nums: [Float], window: Int) -> [Float] {\n  var res: [Float] = []\n  for i in 0..=(nums.length - window) {\n    let slice = nums.slice(i, i + window)\n    res.push(sum(slice) / window.toFloat())\n  }\n  return res\n}\nlet data = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]\nlet ma = movingAverage(data, 3)\nfor m in ma { write(f"{m:.1f} ") }\nprint("")\n`
  },
  {
    task: "Write a Mycel program implementing a simple calculator parser evaluating a list of tokens.",
    code: `fn calc(a: Int, op: String, b: Int) -> Int => match op {\n  "+" => a + b\n  "-" => a - b\n  "*" => a * b\n  "/" => a.div(b)\n  _ => 0\n}\nprint(calc(10, "+", 5), calc(10, "*", 3), calc(10, "/", 2))\n`
  },
  {
    task: "Write a Mycel program calculating the dot product of two integer vectors.",
    code: `fn dotProduct(v1: [Int], v2: [Int]) -> Int {\n  var total = 0\n  for p in v1.zip(v2) {\n    total += p.0 * p.1\n  }\n  return total\n}\nprint(dotProduct([1, 2, 3], [4, 5, 6]))\n`
  },
  {
    task: "Write a Mycel program that computes the Sieve of Eratosthenes to find primes up to 30.",
    code: `fn sieve(limit: Int) -> [Int] {\n  var isP: {Int: Bool} = {}\n  for i in 2..=limit { isP[i] = true }\n  for p in 2..=limit {\n    if isP.get(p, false) {\n      var mult = p * 2\n      while mult <= limit {\n        isP[mult] = false\n        mult += p\n      }\n    }\n  }\n  return [n for n in 2..=limit if isP.get(n, false)]\n}\nprint(sieve(30))\n`
  },
  {
    task: "Write a Mycel program that merges two sorted lists into one sorted list.",
    code: `fn mergeSorted(a: [Int], b: [Int]) -> [Int] {\n  var res: [Int] = []\n  var i = 0\n  var j = 0\n  while i < a.length && j < b.length {\n    if a[i] <= b[j] {\n      res.push(a[i])\n      i += 1\n    } else {\n      res.push(b[j])\n      j += 1\n    }\n  }\n  while i < a.length { res.push(a[i]); i += 1 }\n  while j < b.length { res.push(b[j]); j += 1 }\n  return res\n}\nprint(mergeSorted([1, 3, 5, 7], [2, 4, 6, 8]))\n`
  },
  {
    task: "Write a Mycel program implementing QuickSort on an array of integers.",
    code: `fn quickSort(arr: [Int]) -> [Int] {\n  if arr.length <= 1 { return arr }\n  let pivot = arr[0]\n  let rest = arr.slice(1, arr.length)\n  let less = rest.filter(x => x <= pivot)\n  let greater = rest.filter(x => x > pivot)\n  return quickSort(less).concat([pivot]).concat(quickSort(greater))\n}\nprint(quickSort([38, 27, 43, 3, 9, 82, 10]))\n`
  },
  {
    task: "Write a Mycel program that parses a URL query string into a map.",
    code: `fn parseQuery(query: String) -> {String: String} {\n  var params: {String: String} = {}\n  let pairs = query.split("&")\n  for p in pairs {\n    let parts = p.split("=")\n    if parts.length == 2 {\n      params[parts[0]] = parts[1]\n    }\n  }\n  return params\n}\nlet q = parseQuery("name=Alice&role=admin&active=true")\nprint(q["name"], q["role"], q["active"])\n`
  },
  {
    task: "Write a Mycel program that decodes a Run-Length Encoded string.",
    code: `fn decodeRle(s: String) -> String {\n  var res: [String] = []\n  var countStr = ""\n  for ch in s {\n    if ch.isDigit {\n      countStr += ch.toString()\n    } else {\n      let n = Int.parse(countStr) ?? 1\n      res.push(ch.toString().repeat(n))\n      countStr = ""\n    }\n  }\n  return res.join("")\n}\nprint(decodeRle("3A2B4C"))\n`
  },
  {
    task: "Write a Mycel program converting an integer to Roman numerals (up to 20).",
    code: `fn toRoman(n: Int) -> String {\n  let romans = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]\n  var num = n\n  var res = ""\n  for pair in romans {\n    while num >= pair.0 {\n      res += pair.1\n      num -= pair.0\n    }\n  }\n  return res\n}\nprint(toRoman(4), toRoman(9), toRoman(14), toRoman(19))\n`
  },
  {
    task: "Write a Mycel program that computes the prime factors of an integer.",
    code: `fn primeFactors(n: Int) -> [Int] {\n  var num = n\n  var factors: [Int] = []\n  var d = 2\n  while d * d <= num {\n    while num % d == 0 {\n      factors.push(d)\n      num = num.div(d)\n    }\n    d += 1\n  }\n  if num > 1 { factors.push(num) }\n  return factors\n}\nprint(primeFactors(60), primeFactors(84))\n`
  },
  {
    task: "Write a Mycel program that splits an array into chunks of size n.",
    code: `fn chunkArray<T>(items: [T], size: Int) -> [[T]] {\n  var chunks: [[T]] = []\n  var i = 0\n  while i < items.length {\n    let end = if i + size < items.length { i + size } else { items.length }\n    chunks.push(items.slice(i, end))\n    i += size\n  }\n  return chunks\n}\nprint(chunkArray([1, 2, 3, 4, 5, 6, 7], 3))\n`
  },
  {
    task: "Write a Mycel program that counts lines, words, and characters in a paragraph.",
    code: `fn countStats(text: String) -> (Int, Int, Int) {\n  let lines = text.lines().length\n  let words = text.trim().split(" ").filter(w => !w.isEmpty).length\n  let chars = text.length\n  return (lines, words, chars)\n}\nlet sample = "Line 1\\nLine 2 with words\\nLine 3"\nlet st = countStats(sample)\nprint(f"Lines: {st.0}, Words: {st.1}, Chars: {st.2}")\n`
  },
  {
    task: "Write a Mycel program implementing a Binary Search Tree (BST) insertion and in-order traversal.",
    code: `class Node {\n  let val: Int\n  var left: Node? = nil\n  var right: Node? = nil\n  init(val: Int) { self.val = val }\n}\nfn insert(root: Node?, val: Int) -> Node {\n  if root == nil { return Node(val: val) }\n  let r = root!\n  if val < r.val {\n    r.left = insert(r.left, val)\n  } else {\n    r.right = insert(r.right, val)\n  }\n  return r\n}\nfn inOrder(node: Node?, out: [Int]) {\n  if node == nil { return }\n  let n = node!\n  inOrder(n.left, out)\n  out.push(n.val)\n  inOrder(n.right, out)\n}\nvar tree: Node? = nil\nfor v in [5, 3, 7, 2, 4, 6, 8] {\n  tree = insert(tree, v)\n}\nvar vals: [Int] = []\ninOrder(tree, vals)\nprint(vals)\n`
  },
  {
    task: "Write a Mycel program that parses a comma-separated values (CSV) line handling quotes.",
    code: `fn parseCsvLine(line: String) -> [String] {\n  return line.split(",").map(c => c.trim().replace("\\"", ""))\n}\nlet row = parseCsvLine("\\"Alice\\", 30, \\"Engineer\\"")\nprint(row[0], row[1], row[2])\n`
  },
  {
    task: "Write a Mycel program with a Currency Converter exchanging USD, EUR, and JPY using exchange rates in a map.",
    code: `let rates: {String: Float} = {"USD": 1.0, "EUR": 0.92, "JPY": 150.0}\nfn convert(amount: Float, from: String, to: String) -> Float {\n  let usd = amount / rates.get(from, 1.0)\n  return usd * rates.get(to, 1.0)\n}\nlet eur = convert(100.0, "USD", "EUR")\nlet jpy = convert(100.0, "USD", "JPY")\nprint(f"\${eur:.2f}")\nprint(f"\${jpy:.2f}")\n`
  },
  {
    task: "Write a Mycel program calculating combinations nCr = n! / (r! * (n-r)!).",
    code: `fn nCr(n: Int, r: Int) -> Int {\n  var num = 1\n  for i in 1..=r {\n    num = (num * (n - i + 1)).div(i)\n  }\n  return num\n}\nprint(nCr(5, 2), nCr(6, 3))\n`
  },
  {
    task: "Write a Mycel program converting seconds into hh:mm:ss format.",
    code: `fn formatSeconds(total: Int) -> String {\n  let h = total.div(3600)\n  let m = (total % 3600).div(60)\n  let s = total % 60\n  return f"{h:02d}:{m:02d}:{s:02d}"\n}\nprint(formatSeconds(3665), formatSeconds(72))\n`
  },
  {
    task: "Write a Mycel program implementing a state machine with Idle, Processing, and Done states.",
    code: `enum State { Idle, Processing(step: Int), Done }\nclass Worker {\n  var state: State = .Idle\n  fn step() {\n    self.state = match self.state {\n      .Idle => .Processing(step: 1)\n      .Processing(s) => if s >= 2 { .Done } else { .Processing(step: s + 1) }\n      .Done => .Done\n    }\n  }\n}\nlet w = Worker()\nw.step()\nprint(match w.state { .Processing(s) => f"Step {s}", _ => "Other" })\nw.step()\nprint(match w.state { .Done => "Finished!", _ => "Running" })\n`
  },
  {
    task: "Write a Mycel program rotating a list to the left by k positions.",
    code: `fn rotateLeft<T>(items: [T], k: Int) -> [T] {\n  let shift = k % items.length\n  return items.slice(shift, items.length).concat(items.slice(0, shift))\n}\nprint(rotateLeft([1, 2, 3, 4, 5], 2))\n`
  },
  {
    task: "Write a Mycel program that generates an ASCII bar chart for a list of values.",
    code: `let data = [("Apples", 5), ("Oranges", 8), ("Bananas", 3)]\nfor item in data {\n  let bar = "#".repeat(item.1)\n  print(f"{item.0.padRight(8)} | {bar} ({item.1})")\n}\n`
  },
  {
    task: "Write a Mycel program finding the mode (most frequent element) of an integer array.",
    code: `fn findMode(nums: [Int]) -> Int {\n  var freq: {Int: Int} = {}\n  for n in nums { freq[n] = freq.get(n, 0) + 1 }\n  var bestNum = nums[0]\n  var maxCount = 0\n  for n, count in freq {\n    if count > maxCount {\n      maxCount = count\n      bestNum = n\n    }\n  }\n  return bestNum\n}\nprint(findMode([1, 3, 2, 3, 4, 3, 2, 1]))\n`
  },
  {
    task: "Write a Mycel program that checks if a string contains balanced parentheses.",
    code: `fn isBalanced(s: String) -> Bool {\n  var count = 0\n  for ch in s {\n    if ch == '(' { count += 1 }\n    else if ch == ')' {\n      count -= 1\n      if count < 0 { return false }\n    }\n  }\n  return count == 0\n}\nprint(isBalanced("((1+2)*3)"), isBalanced("(()"), isBalanced(")("))\n`
  },
  {
    task: "Write a Mycel program calculating cumulative sum of an integer array.",
    code: `fn cumSum(nums: [Int]) -> [Int] {\n  var res: [Int] = []\n  var running = 0\n  for n in nums {\n    running += n\n    res.push(running)\n  }\n  return res\n}\nprint(cumSum([1, 2, 3, 4, 5]))\n`
  },
  {
    task: "Write a Mycel program implementing Matrix Addition.",
    code: `fn matrixAdd(m1: [[Int]], m2: [[Int]]) -> [[Int]] {\n  var res: [[Int]] = []\n  for r in 0..m1.length {\n    var row: [Int] = []\n    for c in 0..m1[r].length {\n      row.push(m1[r][c] + m2[r][c])\n    }\n    res.push(row)\n  }\n  return res\n}\nprint(matrixAdd([[1, 2], [3, 4]], [[5, 6], [7, 8]]))\n`
  },
  {
    task: "Write a Mycel program testing bitwise AND, OR, XOR, and shifts on integers.",
    code: `let a = 12 # 0b1100\nlet b = 10 # 0b1010\nprint(a & b, a | b, a ^ b, 1 << 3, 16 >> 2)\n`
  },
  {
    task: "Write a Mycel program that safely retrieves an array item with index out-of-bounds protection.",
    code: `fn safeGet<T>(arr: [T], idx: Int, fallback: T) -> T {\n  return arr.at(idx) ?? fallback\n}\nprint(safeGet(["a", "b"], 1, "none"), safeGet(["a", "b"], 5, "none"))\n`
  }
];

