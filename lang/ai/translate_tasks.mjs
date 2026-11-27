// lang/ai/translate_tasks.mjs — Python to Mycel translation pairs.
// Both are executed with python3 and lang/bin/mycel, and their stdout outputs must match exactly.

export const TRANSLATE_PAIRS = [
  // 1. Hello
  {
    py: `print("hello, world")\n`,
    myc: `print("hello, world")\n`
  },
  // 2. Greet
  {
    py: `def greet(name: str) -> str:\n    return f"hello, {name}"\n\nprint(greet("world"))\n`,
    myc: `fn greet(name: String) -> String {\n  return f"hello, {name}"\n}\n\nprint(greet("world"))\n`
  },
  // 3. Sum list
  {
    py: `def total(xs: list[int]) -> int:\n    return sum(xs)\n\nprint(total([1, 2, 3, 4, 5]))\n`,
    myc: `fn total(xs: [Int]) -> Int {\n  return sum(xs)\n}\n\nprint(total([1, 2, 3, 4, 5]))\n`
  },
  // 4. Fizzbuzz
  {
    py: `for i in range(1, 16):\n    if i % 15 == 0:\n        print("fizzbuzz")\n    elif i % 3 == 0:\n        print("fizz")\n    elif i % 5 == 0:\n        print("buzz")\n    else:\n        print(i)\n`,
    myc: `for i in 1..=15 {\n  if i % 15 == 0 {\n    print("fizzbuzz")\n  } else if i % 3 == 0 {\n    print("fizz")\n  } else if i % 5 == 0 {\n    print("buzz")\n  } else {\n    print(i)\n  }\n}\n`
  },
  // 5. Word count
  {
    py: `def word_count(text: str) -> int:\n    return len([w for w in text.split(" ") if w])\n\nprint(word_count("the quick brown fox jumps over the lazy dog"))\n`,
    myc: `fn word_count(text: String) -> Int {\n  return len([w for w in text.split(" ") if !w.isEmpty])\n}\n\nprint(word_count("the quick brown fox jumps over the lazy dog"))\n`
  },
  // 6. Reverse
  {
    py: `def rev(s: str) -> str:\n    return s[::-1]\n\nprint(rev("stressed"))\n`,
    myc: `fn rev(s: String) -> String {\n  return s.reversed()\n}\n\nprint(rev("stressed"))\n`
  },
  // 7. Max min
  {
    py: `xs = [42, 17, 99, 3, 55]\nprint(f"max: {max(xs)}, min: {min(xs)}")\n`,
    myc: `xs = [42, 17, 99, 3, 55]\nprint(f"max: {max(xs)}, min: {min(xs)}")\n`
  },
  // 8. Factorial
  {
    py: `def fact(n: int) -> int:\n    return 1 if n <= 1 else n * fact(n - 1)\n\nprint(fact(6))\n`,
    myc: `fn fact(n: Int) -> Int {\n  return 1 if n <= 1 else n * fact(n - 1)\n}\n\nprint(fact(6))\n`
  },
  // 9. Fibonacci
  {
    py: `def fib(n: int) -> int:\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint(fib(10))\n`,
    myc: `fn fib(n: Int) -> Int {\n  a, b = 0, 1\n  for _ in 0..n {\n    a, b = b, a + b\n  }\n  return a\n}\n\nprint(fib(10))\n`
  },
  // 10. Class Point
  {
    py: `class Point:\n    def __init__(self, x: int, y: int):\n        self.x = x\n        self.y = y\n\n    def dist2(self) -> int:\n        return self.x * self.x + self.y * self.y\n\np = Point(3, 4)\nprint(p.dist2())\n`,
    myc: `class Point {\n  let x: Int\n  let y: Int\n  init(x: Int, y: Int) {\n    self.x = x\n    self.y = y\n  }\n  fn dist2() -> Int {\n    return self.x * self.x + self.y * self.y\n  }\n}\n\nlet p = Point(x: 3, y: 4)\nprint(p.dist2())\n`
  },
  // 11. Dict scores
  {
    py: `scores = {"ana": 95, "bob": 80, "chen": 88}\ntotal = sum(scores.values())\navg = total / len(scores)\nprint(f"avg: {avg:.1f}")\n`,
    myc: `scores = {"ana": 95, "bob": 80, "chen": 88}\ntotal = sum(scores.values)\navg = total / len(scores)\nprint(f"avg: {avg:.1f}")\n`
  },
  // 12. Comprehension
  {
    py: `xs = [1, 2, 3, 4, 5, 6]\nevens = [x * 2 for x in xs if x % 2 == 0]\nprint(evens)\n`,
    myc: `xs = [1, 2, 3, 4, 5, 6]\nevens = [x * 2 for x in xs if x % 2 == 0]\nprint(evens)\n`
  },
  // 13. Enumerate
  {
    py: `items = ["a", "b", "c"]\nfor i, x in enumerate(items):\n    print(f"{i}: {x}")\n`,
    myc: `items = ["a", "b", "c"]\nfor i, x in items {\n  print(f"{i}: {x}")\n}\n`
  },
  // 14. Average
  {
    py: `def avg(xs: list[float]) -> float:\n    return sum(xs) / len(xs)\n\nprint(f"{avg([10.0, 20.0, 30.0]):.2f}")\n`,
    myc: `fn avg(xs: [Float]) -> Float {\n  return sum(xs) / xs.length.toFloat()\n}\n\nprint(f"{avg([10.0, 20.0, 30.0]):.2f}")\n`
  },
  // 15. Sort tuples
  {
    py: `pairs = [(1, "b"), (2, "a"), (3, "c")]\nfor p in sorted(pairs, key=lambda x: x[0]):\n    print(f"{p[0]}-{p[1]}")\n`,
    myc: `pairs = [(1, "b"), (2, "a"), (3, "c")]\nfor p in pairs.sortedBy(x => x.0) {\n  print(f"{p.0}-{p.1}")\n}\n`
  },
  // 16. Vowels
  {
    py: `vowels = set("aeiou")\nword = "encyclopedia"\ncount = sum(1 for c in word if c in vowels)\nprint(count)\n`,
    myc: `vowels = Set(['a', 'e', 'i', 'o', 'u'])\nword = "encyclopedia"\nvar count = 0\nfor c in word {\n  if c in vowels { count += 1 }\n}\nprint(count)\n`
  },
  // 17. Primes
  {
    py: `def is_prime(n: int) -> bool:\n    if n < 2:\n        return False\n    for d in range(2, int(n ** 0.5) + 1):\n        if n % d == 0:\n            return False\n    return True\n\nprimes = [x for x in range(2, 30) if is_prime(x)]\nprint(primes)\n`,
    myc: `fn is_prime(n: Int) -> Bool {\n  if n < 2 { return false }\n  for d in 2..n {\n    if d * d > n { break }\n    if n % d == 0 { return false }\n  }\n  return true\n}\n\nprimes = [x for x in 2..30 if is_prime(x)]\nprint(primes)\n`
  },
  // 18. Temperature
  {
    py: `def c_to_f(c: float) -> float:\n    return c * 9.0 / 5.0 + 32.0\n\nprint(f"{c_to_f(100.0):.1f}")\nprint(f"{c_to_f(0.0):.1f}")\n`,
    myc: `fn c_to_f(c: Float) -> Float {\n  return c * 9.0 / 5.0 + 32.0\n}\n\nprint(f"{c_to_f(100.0):.1f}")\nprint(f"{c_to_f(0.0):.1f}")\n`
  },
  // 19. Swap
  {
    py: `a, b = 1, 2\na, b = b, a\nprint(a, b)\n`,
    myc: `a, b = 1, 2\na, b = b, a\nprint(a, b)\n`
  },
  // 20. Sets
  {
    py: `a = set([1, 2, 3])\nb = set([2, 3, 4])\nprint(sorted(list(a & b)))\nprint(sorted(list(a | b)))\nprint(sorted(list(a - b)))\n`,
    myc: `a = Set([1, 2, 3])\nb = Set([2, 3, 4])\nprint((a & b).sorted())\nprint((a | b).sorted())\nprint((a - b).sorted())\n`
  },
  // 21. Args
  {
    py: `def show(tag: str, *vals: int) -> str:\n    return f"{tag}: {', '.join(str(v) for v in vals)}"\n\nprint(show("scores", 1, 2, 3))\n`,
    myc: `fn show(tag: String, ...vals: Int) -> String {\n  let sep = ", "\n  return f"{tag}: {vals.map(v => str(v)).join(sep)}"\n}\n\nprint(show("scores", 1, 2, 3))\n`
  },
  // 22. Binary Search
  {
    py: `def binary_search(arr, target):\n    lo, hi = 0, len(arr) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\nnums = [1, 3, 5, 7, 9, 11, 13]\nprint(binary_search(nums, 7))\nprint(binary_search(nums, 4))\n`,
    myc: `fn binary_search(arr: [Int], target: Int) -> Int {\n  var lo = 0\n  var hi = arr.length - 1\n  while lo <= hi {\n    let mid = lo + (hi - lo).div(2)\n    if arr[mid] == target { return mid }\n    else if arr[mid] < target { lo = mid + 1 }\n    else { hi = mid - 1 }\n  }\n  return -1\n}\n\nlet nums = [1, 3, 5, 7, 9, 11, 13]\nprint(binary_search(nums, 7))\nprint(binary_search(nums, 4))\n`
  },
  // 23. Bubble Sort
  {
    py: `def bubble_sort(arr):\n    a = list(arr)\n    n = len(a)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if a[j] > a[j + 1]:\n                a[j], a[j + 1] = a[j + 1], a[j]\n    return a\n\nprint(bubble_sort([5, 1, 4, 2, 8]))\n`,
    myc: `fn bubble_sort(arr: [Int]) -> [Int] {\n  var a = arr.copy()\n  let n = a.length\n  for i in 0..n {\n    for j in 0..(n - i - 1) {\n      if a[j] > a[j + 1] {\n        let tmp = a[j]\n        a[j] = a[j + 1]\n        a[j + 1] = tmp\n      }\n    }\n  }\n  return a\n}\n\nprint(bubble_sort([5, 1, 4, 2, 8]))\n`
  },
  // 24. Greatest Common Divisor
  {
    py: `def gcd(a: int, b: int) -> int:\n    while b != 0:\n        a, b = b, a % b\n    return a\n\nprint(gcd(48, 18))\nprint(gcd(101, 10))\n`,
    myc: `fn gcd(a: Int, b: Int) -> Int {\n  var x = a\n  var y = b\n  while y != 0 {\n    let tmp = y\n    y = x % y\n    x = tmp\n  }\n  return x\n}\n\nprint(gcd(48, 18))\nprint(gcd(101, 10))\n`
  },
  // 25. Run Length Encoding
  {
    py: `def rle(s: str) -> str:\n    if not s: return ""\n    res = []\n    cur = s[0]\n    count = 1\n    for c in s[1:]:\n        if c == cur:\n            count += 1\n        else:\n            res.append(f"{count}{cur}")\n            cur = c\n            count = 1\n    res.append(f"{count}{cur}")\n    return "".join(res)\n\nprint(rle("AAABBBCCDAA"))\n`,
    myc: `fn rle(s: String) -> String {\n  if s.isEmpty { return "" }\n  var res: [String] = []\n  var cur = s.substring(0, 1)\n  var count = 1\n  for i in 1..s.length {\n    let c = s.substring(i, i + 1)\n    if c == cur {\n      count += 1\n    } else {\n      res.push(f"{count}{cur}")\n      cur = c\n      count = 1\n    }\n  }\n  res.push(f"{count}{cur}")\n  return res.join("")\n}\n\nprint(rle("AAABBBCCDAA"))\n`
  },
  // 26. Palindrome
  {
    py: `def is_pal(s: str) -> bool:\n    clean = s.lower().replace(" ", "")\n    return clean == clean[::-1]\n\nprint(str(is_pal("Race car")).lower())\nprint(str(is_pal("hello")).lower())\n`,
    myc: `fn is_pal(s: String) -> Bool {\n  let clean = s.lower().replace(" ", "")\n  return clean == clean.reversed()\n}\n\nprint(is_pal("Race car"))\nprint(is_pal("hello"))\n`
  },
  // 27. Anagram
  {
    py: `def are_anagrams(s1: str, s2: str) -> bool:\n    return sorted(s1.lower()) == sorted(s2.lower())\n\nprint(str(are_anagrams("cinema", "iceman")).lower())\nprint(str(are_anagrams("cat", "dog")).lower())\n`,
    myc: `fn are_anagrams(s1: String, s2: String) -> Bool {\n  return s1.lower().chars().sorted() == s2.lower().chars().sorted()\n}\n\nprint(are_anagrams("cinema", "iceman"))\nprint(are_anagrams("cat", "dog"))\n`
  },
  // 28. Pascal Triangle
  {
    py: `def pascal(n):\n    rows = []\n    for i in range(n):\n        row = [1]\n        if rows:\n            last = rows[-1]\n            for j in range(len(last) - 1):\n                row.append(last[j] + last[j + 1])\n            row.append(1)\n        rows.append(row)\n    return rows\n\nfor r in pascal(4):\n    print(r)\n`,
    myc: `fn pascal(n: Int) -> [[Int]] {\n  var rows: [[Int]] = []\n  for i in 0..n {\n    var row: [Int] = [1]\n    if !rows.isEmpty {\n      let last = rows[-1]\n      for j in 0..(last.length - 1) {\n        row.push(last[j] + last[j + 1])\n      }\n      row.push(1)\n    }\n    rows.push(row)\n  }\n  return rows\n}\n\nfor r in pascal(4) {\n  print(r)\n}\n`
  },
  // 29. Matrix Transpose
  {
    py: `def transpose(m):\n    return [[m[r][c] for r in range(len(m))] for c in range(len(m[0]))]\n\nprint(transpose([[1, 2], [3, 4], [5, 6]]))\n`,
    myc: `fn transpose(m: [[Int]]) -> [[Int]] {\n  var res: [[Int]] = []\n  for c in 0..m[0].length {\n    var col: [Int] = []\n    for r in 0..m.length {\n      col.push(m[r][c])\n    }\n    res.push(col)\n  }\n  return res\n}\n\nprint(transpose([[1, 2], [3, 4], [5, 6]]))\n`
  },
  // 30. Cumulative Sum
  {
    py: `def cumsum(xs):\n    res = []\n    cur = 0\n    for x in xs:\n        cur += x\n        res.append(cur)\n    return res\n\nprint(cumsum([1, 2, 3, 4, 5]))\n`,
    myc: `fn cumsum(xs: [Int]) -> [Int] {\n  var res: [Int] = []\n  var cur = 0\n  for x in xs {\n    cur += x\n    res.push(cur)\n  }\n  return res\n}\n\nprint(cumsum([1, 2, 3, 4, 5]))\n`
  },
  // 31. Chunk Array
  {
    py: `def chunk(xs, size):\n    return [xs[i:i + size] for i in range(0, len(xs), size)]\n\nprint(chunk([1, 2, 3, 4, 5, 6, 7], 3))\n`,
    myc: `fn chunk(xs: [Int], size: Int) -> [[Int]] {\n  var res: [[Int]] = []\n  var i = 0\n  while i < xs.length {\n    let end = if i + size < xs.length { i + size } else { xs.length }\n    res.push(xs.slice(i, end))\n    i += size\n  }\n  return res\n}\n\nprint(chunk([1, 2, 3, 4, 5, 6, 7], 3))\n`
  },
  // 32. Caesar Cipher
  {
    py: `def caesar(s: str, k: int) -> str:\n    res = []\n    for c in s:\n        if c.isalpha():\n            base = ord('A') if c.isupper() else ord('a')\n            res.append(chr((ord(c) - base + k) % 26 + base))\n        else:\n            res.append(c)\n    return "".join(res)\n\nprint(caesar("Hello, World!", 3))\n`,
    myc: `fn caesar(s: String, k: Int) -> String {\n  var res: [String] = []\n  for ch in s {\n    if ch.isLetter {\n      let base = if ch.isUpper { 'A'.code } else { 'a'.code }\n      let offset = (ch.code - base + k) % 26\n      let code = base + (if offset < 0 { offset + 26 } else { offset })\n      res.push(Char.fromCode(code).toString())\n    } else {\n      res.push(ch.toString())\n    }\n  }\n  return res.join("")\n}\n\nprint(caesar("Hello, World!", 3))\n`
  },
  // 33. Prime Factors
  {
    py: `def factors(n: int):\n    res = []\n    d = 2\n    while d * d <= n:\n        while n % d == 0:\n            res.append(d)\n            n //= d\n        d += 1\n    if n > 1:\n        res.append(n)\n    return res\n\nprint(factors(84))\n`,
    myc: `fn factors(n: Int) -> [Int] {\n  var num = n\n  var res: [Int] = []\n  var d = 2\n  while d * d <= num {\n    while num % d == 0 {\n      res.push(d)\n      num = num.div(d)\n    }\n    d += 1\n  }\n  if num > 1 { res.push(num) }\n  return res\n}\n\nprint(factors(84))\n`
  },
  // 34. Power Function
  {
    py: `def power(base: int, exp: int) -> int:\n    return base ** exp\n\nprint(power(3, 4))\nprint(power(2, 8))\n`,
    myc: `fn power(base: Int, exp: Int) -> Int {\n  return base ** exp\n}\n\nprint(power(3, 4))\nprint(power(2, 8))\n`
  },
  // 35. Count Vowels
  {
    py: `def count_vowels(s: str) -> int:\n    return sum(1 for c in s.lower() if c in "aeiou")\n\nprint(count_vowels("Antigravity Mycel"))\n`,
    myc: `fn count_vowels(s: String) -> Int {\n  var c = 0\n  for ch in s.lower() {\n    if ch in "aeiou" { c += 1 }\n  }\n  return c\n}\n\nprint(count_vowels("Antigravity Mycel"))\n`
  },
  // 36. Remove Duplicates
  {
    py: `def remove_dups(xs):\n    seen = set()\n    res = []\n    for x in xs:\n        if x not in seen:\n            seen.add(x)\n            res.append(x)\n    return res\n\nprint(remove_dups([1, 2, 3, 2, 1, 4, 5, 4]))\n`,
    myc: `fn remove_dups(xs: [Int]) -> [Int] {\n  var seen = Set<Int>()\n  var res: [Int] = []\n  for x in xs {\n    if x not in seen {\n      seen.add(x)\n      res.push(x)\n    }\n  }\n  return res\n}\n\nprint(remove_dups([1, 2, 3, 2, 1, 4, 5, 4]))\n`
  },
  // 37. Flatten 2D
  {
    py: `def flatten(matrix):\n    return [x for row in matrix for x in row]\n\nprint(flatten([[1, 2], [3, 4], [5]]))\n`,
    myc: `fn flatten(matrix: [[Int]]) -> [Int] {\n  return matrix.flatMap(row => row)\n}\n\nprint(flatten([[1, 2], [3, 4], [5]]))\n`
  },
  // 38. Bank Account
  {
    py: `class Bank:\n    def __init__(self, bal: int):\n        self.bal = bal\n    def deposit(self, amt: int):\n        self.bal += amt\n    def withdraw(self, amt: int) -> bool:\n        if amt <= self.bal:\n            self.bal -= amt\n            return True\n        return False\n\nb = Bank(100)\nb.deposit(50)\nok = b.withdraw(70)\nprint(str(ok).lower(), b.bal)\n`,
    myc: `class Bank {\n  var bal: Int\n  init(bal: Int) { self.bal = bal }\n  fn deposit(amt: Int) { self.bal += amt }\n  fn withdraw(amt: Int) -> Bool {\n    if amt <= self.bal {\n      self.bal -= amt\n      return true\n    }\n    return false\n  }\n}\n\nlet b = Bank(bal: 100)\nb.deposit(50)\nlet ok = b.withdraw(70)\nprint(ok, b.bal)\n`
  },
  // 39. Clamp
  {
    py: `def clamp(val: int, lo: int, hi: int) -> int:\n    return max(lo, min(hi, val))\n\nprint(clamp(5, 10, 20), clamp(15, 10, 20), clamp(25, 10, 20))\n`,
    myc: `fn clamp(val: Int, lo: Int, hi: Int) -> Int {\n  return val.clamp(lo, hi)\n}\n\nprint(clamp(5, 10, 20), clamp(15, 10, 20), clamp(25, 10, 20))\n`
  },
  // 40. Levenshtein Distance
  {
    py: `def lev(s1: str, s2: str) -> int:\n    if not s1: return len(s2)\n    if not s2: return len(s1)\n    if s1[0] == s2[0]:\n        return lev(s1[1:], s2[1:])\n    return 1 + min(lev(s1[1:], s2), lev(s1, s2[1:]), lev(s1[1:], s2[1:]))\n\nprint(lev("kitten", "sitting"))\n`,
    myc: `fn lev(s1: String, s2: String) -> Int {\n  if s1.isEmpty { return s2.length }\n  if s2.isEmpty { return s1.length }\n  if s1.substring(0, 1) == s2.substring(0, 1) {\n    return lev(s1.substring(1, s1.length), s2.substring(1, s2.length))\n  }\n  let d1 = lev(s1.substring(1, s1.length), s2)\n  let d2 = lev(s1, s2.substring(1, s2.length))\n  let d3 = lev(s1.substring(1, s1.length), s2.substring(1, s2.length))\n  return 1 + min([d1, d2, d3])\n}\n\nprint(lev("kitten", "sitting"))\n`
  }
];
