// lang/ai/instruct_tasks.mjs — Task definitions for mycel-instruct.jsonl
// Each entry has: task (string), code (string), inputs (optional string[])

export const INSTRUCT_TASKS = [
  // 1. Hello & Basic Output (1-10)
  {
    task: "Write a Mycel program that prints 'Hello, World!'.",
    code: `print("Hello, World!")\n`
  },
  {
    task: "Write a Mycel program that prints three separate words separated by spaces using a single print statement.",
    code: `print("Mycel", "is", "friendly")\n`
  },
  {
    task: "Write a Mycel program that outputs text without a trailing newline using write(), then finishes with a print().",
    code: `write("Loading...")\nprint(" Done!")\n`
  },
  {
    task: "Write a Mycel program that defines a greeting message in a variable and prints it.",
    code: `greeting = "Welcome to Mycel"\nprint(greeting)\n`
  },
  {
    task: "Write a Mycel program that prints the results of basic integer arithmetic: addition, subtraction, multiplication, and remainder of 20 and 6.",
    code: `let a = 20\nlet b = 6\nprint(a + b, a - b, a * b, a % b)\n`
  },
  {
    task: "Write a Mycel program that demonstrates whole-number division and floating-point division of 7 by 2.",
    code: `print(7 / 2)\nprint(7.div(2))\n`
  },
  {
    task: "Write a Mycel program that prints the powers of 2 from 2^0 to 2^4 using the exponentiation operator **.",
    code: `for i in 0..5 {\n  print(2 ** i)\n}\n`
  },
  {
    task: "Write a Mycel program that prints a multi-line string using triple quotes.",
    code: `let text = """\nLine 1\nLine 2\nLine 3\n"""\nprint(text.trim())\n`
  },
  {
    task: "Write a Mycel program that prints an integer, a float, a boolean, and a string on a single line.",
    code: `print(42, 3.14, true, "hello")\n`
  },
  {
    task: "Write a Mycel program that displays the typeName of various primitive literals.",
    code: `print(typeName(1), typeName(2.5), typeName(true), typeName("abc"), typeName([1]))\n`
  },

  // 2. Variables & Type Inference (11-25)
  {
    task: "Write a Mycel program demonstrating an immutable variable declared with let and a mutable variable declared with var.",
    code: `let constantVal = 100\nvar counter = 0\ncounter += 1\ncounter += constantVal\nprint(counter)\n`
  },
  {
    task: "Write a Mycel program showing that the first assignment to a name without let or var creates the variable.",
    code: `total = 50\ntotal += 25\nprint(total)\n`
  },
  {
    task: "Write a Mycel program that explicitly annotates variables with Int, Float, Bool, and String types.",
    code: `let count: Int = 10\nlet ratio: Float = 0.75\nlet active: Bool = false\nlet label: String = "Item"\nprint(count, ratio, active, label)\n`
  },
  {
    task: "Write a Mycel program that parses a string into an integer and checks if it succeeded.",
    code: `let val = Int.parse("1234")\nif let n = val {\n  print(f"Parsed: {n * 2}")\n}\n`
  },
  {
    task: "Write a Mycel program that parses a string into a Float and prints the rounded value.",
    code: `let f = Float.parse("19.85")\nif let num = f {\n  print(num.round())\n}\n`
  },
  {
    task: "Write a Mycel program that checks whether an integer is even or odd using the .isEven and .isOdd properties.",
    code: `let n = 14\nprint(n.isEven, n.isOdd)\nlet m = 7\nprint(m.isEven, m.isOdd)\n`
  },
  {
    task: "Write a Mycel program that computes the absolute value and sign of both positive and negative numbers.",
    code: `let a = -42\nlet b = 15\nprint(a.abs, a.sign, b.abs, b.sign)\n`
  },
  {
    task: "Write a Mycel program that clamps an integer between a minimum of 10 and maximum of 50.",
    code: `let x = 5\nlet y = 35\nlet z = 100\nprint(x.clamp(10, 50), y.clamp(10, 50), z.clamp(10, 50))\n`
  },
  {
    task: "Write a Mycel program that converts an integer to binary and hexadecimal strings using .toRadix().",
    code: `let num = 255\nprint(num.toRadix(2))\nprint(num.toRadix(16))\n`
  },
  {
    task: "Write a Mycel program that tests Float floor, ceil, round, and trunc on positive and negative decimals.",
    code: `let f1 = 3.7\nlet f2 = -3.7\nprint(f1.floor(), f1.ceil(), f1.round(), f1.trunc())\nprint(f2.floor(), f2.ceil(), f2.round(), f2.trunc())\n`
  },
  {
    task: "Write a Mycel program that formats a float to two decimal places using .fixed(2).",
    code: `let pi = 3.14159265\nprint(pi.fixed(2))\nprint(pi.fixed(4))\n`
  },
  {
    task: "Write a Mycel program that checks character properties (isDigit, isLetter, isUpper, isLower) on 'A' and '9'.",
    code: `let c1: Char = 'A'\nlet c2: Char = '9'\nprint(c1.isLetter, c1.isUpper, c1.isDigit)\nprint(c2.isDigit, c2.isLetter)\n`
  },
  {
    task: "Write a Mycel program that converts a character to its ASCII code and back from code to character.",
    code: `let c: Char = 'Z'\nlet code = c.code\nprint(code)\nprint(Char.fromCode(code))\n`
  },
  {
    task: "Write a Mycel program that demonstrates that Char can be converted to upper and lower case.",
    code: `let c: Char = 'x'\nprint(c.upper(), c.upper().lower())\n`
  },
  {
    task: "Write a Mycel program that swaps two variables using Python-style tuple assignment `a, b = b, a`.",
    code: `var a = "first"\nvar b = "second"\na, b = b, a\nprint(a, b)\n`
  },

  // 3. Strings & Formatting (26-45)
  {
    task: "Write a Mycel program that measures string length and checks if it is empty.",
    code: `let s = "Mycelium"\nprint(s.length, s.isEmpty, "".isEmpty)\n`
  },
  {
    task: "Write a Mycel program that trims whitespace from the start, end, and both sides of a string.",
    code: `let raw = "   hello world   "\nprint(f"'{raw.trim()}'")\nprint(f"'{raw.trimStart()}'")\nprint(f"'{raw.trimEnd()}'")\n`
  },
  {
    task: "Write a Mycel program that transforms a string to upper case and lower case.",
    code: `let title = "Hello Mycel Language"\nprint(title.upper())\nprint(title.lower())\n`
  },
  {
    task: "Write a Mycel program that splits a comma-separated string into a list of items.",
    code: `let csv = "apple,banana,orange,grape"\nlet fruits = csv.split(",")\nfor f in fruits {\n  print(f)\n}\n`
  },
  {
    task: "Write a Mycel program that splits a multi-line string into lines using .lines().",
    code: `let multi = "alpha\\nbeta\\ngamma"\nlet rows = multi.lines()\nprint(rows.length, rows[0], rows[1], rows[2])\n`
  },
  {
    task: "Write a Mycel program that checks if a string contains, starts with, or ends with a given substring.",
    code: `let text = "package-manager-ply"\nprint(text.contains("manager"))\nprint(text.startsWith("package"))\nprint(text.endsWith("ply"))\nprint(text.contains("cargo"))\n`
  },
  {
    task: "Write a Mycel program that finds the index of a substring and replaces occurrences of a word.",
    code: `let sentence = "the cat sat on the mat"\nprint(sentence.indexOf("cat"))\nprint(sentence.replace("cat", "dog"))\n`
  },
  {
    task: "Write a Mycel program that repeats a string 4 times and reverses a string.",
    code: `print("ha".repeat(4))\nprint("stressed".reversed())\n`
  },
  {
    task: "Write a Mycel program that pads a string on the left and right with spaces or custom characters.",
    code: `print("42".padLeft(5, "0"))\nprint("test".padRight(8, "."))\n`
  },
  {
    task: "Write a Mycel program that extracts a substring from index 2 to 7 of 'Programming'.",
    code: `let word = "Programming"\nprint(word.substring(0, 7))\nprint(word.substring(3, word.length))\n`
  },
  {
    task: "Write a Mycel program that prints characters of a string by iterating over it with a for loop.",
    code: `let letters = "Mycel"\nfor ch in letters {\n  write(f"{ch} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program using an f-string to format floats with 2 decimal places and integers padded with zeroes.",
    code: `let price = 12.5\nlet id = 7\nprint(f"ID: {id:04d}, Price: \${price:.2f}")\n`
  },
  {
    task: "Write a Mycel program demonstrating debug f-string expressions using `{x=}`.",
    code: `let a = 15\nlet b = 3\nprint(f"{a=} {b=} {a+b=}")\n`
  },
  {
    task: "Write a Mycel program that escapes curly braces in an f-string using `{{` and `}}`.",
    code: `let user = "admin"\nprint(f"User: {{ {user} }}")\n`
  },
  {
    task: "Write a Mycel program that converts a string to integer and float with .toInt() and .toFloat().",
    code: `print("100".toInt() ?? 0 + 5)\nprint("3.14".toFloat() ?? 0.0 * 2.0)\nprint("not_a_num".toInt() == nil)\n`
  },
  {
    task: "Write a Mycel program that counts the number of occurrences of a vowel in a word.",
    code: `let word = "supercalifragilisticexpialidocious"\nvar count = 0\nfor c in word {\n  if c in "aeiou" {\n    count += 1\n  }\n}\nprint(f"Vowels: {count}")\n`
  },
  {
    task: "Write a Mycel program that checks if a word is a palindrome.",
    code: `fn isPalindrome(s: String) -> Bool {\n  let clean = s.lower().trim()\n  return clean == clean.reversed()\n}\nprint(isPalindrome("racecar"), isPalindrome("hello"), isPalindrome("Madam"))\n`
  },
  {
    task: "Write a Mycel program that capitalizes each word in a space-separated sentence.",
    code: `let text = "hello mycel world"\nlet words = text.split(" ")\nvar capped: [String] = []\nfor w in words {\n  if w.length > 0 {\n    let first = w.substring(0, 1).upper()\n    let rest = w.substring(1, w.length)\n    capped.push(first + rest)\n  }\n}\nprint(capped.join(" "))\n`
  },
  {
    task: "Write a Mycel program that joins a list of strings with a hyphen delimiter.",
    code: `let parts = ["2026", "11", "07"]\nprint(parts.join("-"))\n`
  },
  {
    task: "Write a Mycel program that extracts the first 3 characters and the last 3 characters of a string using slicing or substring.",
    code: `let s = "Federation"\nlet head = s.substring(0, 3)\nlet tail = s.substring(s.length - 3, s.length)\nprint(f"{head}...{tail}")\n`
  },

  // 4. Conditionals & Logic (46-60)
  {
    task: "Write a Mycel program showing an if / else if / else chain.",
    code: `let score = 85\nif score >= 90 {\n  print("A")\n} else if score >= 80 {\n  print("B")\n} else if score >= 70 {\n  print("C")\n} else {\n  print("F")\n}\n`
  },
  {
    task: "Write a Mycel program that uses if as an expression to assign a grade label.",
    code: `let temp = 28\nlet weather = if temp > 25 { "warm" } else { "cool" }\nprint(f"Weather is {weather}")\n`
  },
  {
    task: "Write a Mycel program that uses Python-style inline if `value if condition else fallback`.",
    code: `let count = 0\nlet label = "items" if count != 1 else "item"\nprint(f"{count} {label}")\n`
  },
  {
    task: "Write a Mycel program using Python-style boolean operators `and`, `or`, and `not`.",
    code: `let ready = true\nlet hasKey = false\nif ready and not hasKey {\n  print("Need key!")\n}\nif ready or hasKey {\n  print("Can proceed")\n}\n`
  },
  {
    task: "Write a Mycel program that checks multiple conditions using `&&`, `||`, and `!`.",
    code: `let x = 15\nif x >= 10 && x <= 20 && !(x == 13) {\n  print("Valid range and not 13")\n}\n`
  },
  {
    task: "Write a Mycel program testing equality and inequality on strings, integers, and lists.",
    code: `print("abc" == "abc", 10 != 20, [1, 2] == [1, 2], [1] == [2])\n`
  },
  {
    task: "Write a Mycel program checking whether a number is in a range or list using `in` and `not in`.",
    code: `let items = [10, 20, 30, 40]\nprint(20 in items)\nprint(50 in items)\nprint(99 not in items)\n`
  },
  {
    task: "Write a Mycel program that finds the maximum of three numbers without using max().",
    code: `let a = 12\nlet b = 45\nlet c = 32\nvar highest = a\nif b > highest { highest = b }\nif c > highest { highest = c }\nprint(f"Highest is {highest}")\n`
  },
  {
    task: "Write a Mycel program that checks if a given year is a leap year.",
    code: `fn isLeapYear(year: Int) -> Bool {\n  if year % 400 == 0 { return true }\n  if year % 100 == 0 { return false }\n  return year % 4 == 0\n}\nprint(isLeapYear(2000), isLeapYear(2024), isLeapYear(2100), isLeapYear(2023))\n`
  },
  {
    task: "Write a Mycel program that classifies a triangle by side lengths: Equilateral, Isosceles, or Scalene.",
    code: `fn classifyTriangle(a: Int, b: Int, c: Int) -> String {\n  if a == b && b == c {\n    return "Equilateral"\n  } else if a == b || b == c || a == c {\n    return "Isosceles"\n  } else {\n    return "Scalene"\n  }\n}\nprint(classifyTriangle(3, 3, 3))\nprint(classifyTriangle(5, 5, 8))\nprint(classifyTriangle(4, 5, 6))\n`
  },
  {
    task: "Write a Mycel program that checks if an optional integer is nil or contains a value using != nil.",
    code: `let opt: Int? = 42\nif opt != nil {\n  print(f"Value exists: {opt!}")\n}\nlet missing: Int? = nil\nprint(missing == nil)\n`
  },
  {
    task: "Write a Mycel program that safely unwraps an optional using `if let`.",
    code: `let username: String? = "drky"\nif let name = username {\n  print(f"Logged in as {name}")\n} else {\n  print("Guest")\n}\n`
  },
  {
    task: "Write a Mycel program using the null-coalescing operator `??` to provide a fallback value.",
    code: `let port: Int? = nil\nlet activePort = port ?? 8080\nprint(f"Server on {activePort}")\n`
  },
  {
    task: "Write a Mycel program using optional chaining `?.` on an object property.",
    code: `class Profile { let bio: String? = "coder" }\nclass User { let profile: Profile? = Profile() }\nlet u = User()\nprint(u.profile?.bio ?? "no bio")\n`
  },
  {
    task: "Write a Mycel program testing short-circuiting in optional chaining when the receiver is nil.",
    code: `class Profile { let bio: String = "coder" }\nclass User { let profile: Profile? = nil }\nlet u = User()\nprint(u.profile?.bio == nil)\n`
  },

  // 5. Loops & Ranges (61-75)
  {
    task: "Write a Mycel program that iterates from 0 to 4 using a half-open range `0..5`.",
    code: `for i in 0..5 {\n  write(f"{i} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program that iterates from 1 to 5 inclusive using a closed range `1..=5`.",
    code: `for i in 1..=5 {\n  write(f"{i} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program that computes the sum of numbers from 1 to 100 using a range.",
    code: `let r = 1..=100\nprint(r.sum())\n`
  },
  {
    task: "Write a Mycel program that counts down from 5 to 1 using a while loop.",
    code: `var n = 5\nwhile n > 0 {\n  write(f"{n} ")\n  n -= 1\n}\nprint("Liftoff!")\n`
  },
  {
    task: "Write a Mycel program that breaks out of a loop when finding the first multiple of 7 greater than 20.",
    code: `var found = 0\nfor i in 21..100 {\n  if i % 7 == 0 {\n    found = i\n    break\n  }\n}\nprint(f"Found: {found}")\n`
  },
  {
    task: "Write a Mycel program that skips even numbers using continue and prints only odd numbers from 1 to 9.",
    code: `for i in 1..=9 {\n  if i % 2 == 0 { continue }\n  write(f"{i} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program using .step(by:) on a range to print numbers stepping by 3.",
    code: `let r = 0..15\nlet stepped = r.step(by: 3)\nfor n in stepped {\n  write(f"{n} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program that prints a 4x4 multiplication table using nested for loops.",
    code: `for r in 1..=4 {\n  for c in 1..=4 {\n    write(f"{r * c:02d} ")\n  }\n  print("")\n}\n`
  },
  {
    task: "Write a Mycel program that calculates the factorial of 6 using a while loop.",
    code: `var n = 6\nvar fact = 1\nwhile n > 1 {\n  fact *= n\n  n -= 1\n}\nprint(f"6! = {fact}")\n`
  },
  {
    task: "Write a Mycel program that prints the first 8 Fibonacci numbers using a loop.",
    code: `var a = 0\nvar b = 1\nfor _ in 0..8 {\n  write(f"{a} ")\n  let next = a + b\n  a = b\n  b = next\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program that iterates over a list with index and value using `for i, item in list`.",
    code: `let colors = ["red", "green", "blue"]\nfor i, col in colors {\n  print(f"{i}: {col}")\n}\n`
  },
  {
    task: "Write a Mycel program that checks if a range contains specific integers.",
    code: `let r = 10..20\nprint(r.contains(10), r.contains(15), r.contains(20))\n`
  },
  {
    task: "Write a Mycel program that converts a range to an Array and prints its length.",
    code: `let arr = (5..10).toArray()\nprint(arr, arr.length)\n`
  },
  {
    task: "Write a Mycel program that filters a range with a predicate and sums the results.",
    code: `let evens = (1..=10).filter(x => x % 2 == 0)\nprint(evens)\n`
  },
  {
    task: "Write a Mycel program that repeats an action n times using a loop over range `0..n`.",
    code: `for _ in 0..3 {\n  print("Echo")\n}\n`
  },

  // 6. Lists & Arrays (76-105)
  {
    task: "Write a Mycel program that creates an array of integers, appends items with push, and prints the length.",
    code: `var nums: [Int] = [1, 2, 3]\nnums.push(4)\nnums.push(5)\nprint(nums, nums.length)\n`
  },
  {
    task: "Write a Mycel program that pops elements from an array and prints the popped value.",
    code: `var stack = ["a", "b", "c"]\nlet top = stack.pop()\nprint(top, stack)\n`
  },
  {
    task: "Write a Mycel program that inserts an element at index 1 and removes an element at index 0.",
    code: `var items = [10, 30, 40]\nitems.insert(20, at: 1)\nprint(items)\nlet removed = items.removeAt(0)\nprint(removed, items)\n`
  },
  {
    task: "Write a Mycel program demonstrating negative indexing on an array, like `xs[-1]` and `xs[-2]`.",
    code: `let vals = [100, 200, 300, 400]\nprint(vals[-1], vals[-2])\n`
  },
  {
    task: "Write a Mycel program that accesses first and last elements safely with .first and .last.",
    code: `let letters = ["x", "y", "z"]\nprint(letters.first, letters.last)\nlet empty: [Int] = []\nprint(empty.first == nil, empty.last == nil)\n`
  },
  {
    task: "Write a Mycel program that uses .at(index) to safely retrieve elements without panicking on out-of-bounds.",
    code: `let names = ["Alice", "Bob"]\nprint(names.at(0), names.at(1), names.at(5) == nil)\n`
  },
  {
    task: "Write a Mycel program that maps numbers to their cubes using .map().",
    code: `let nums = [1, 2, 3, 4]\nlet cubes = nums.map(x => x * x * x)\nprint(cubes)\n`
  },
  {
    task: "Write a Mycel program that filters a list of numbers to find all values greater than 10.",
    code: `let nums = [4, 15, 8, 23, 42, 3]\nlet big = nums.filter(n => n > 10)\nprint(big)\n`
  },
  {
    task: "Write a Mycel program that reduces a list of numbers into their product using .reduce().",
    code: `let nums = [1, 2, 3, 4, 5]\nlet product = nums.reduce(1, (acc, n) => acc * n)\nprint(product)\n`
  },
  {
    task: "Write a Mycel program that checks if any number is negative and if all numbers are positive using .any() and .all().",
    code: `let nums = [2, 4, 6, -1, 8]\nprint(nums.any(n => n < 0))\nprint(nums.all(n => n > 0))\n`
  },
  {
    task: "Write a Mycel program that finds the first even number in a list using .find().",
    code: `let nums = [3, 7, 10, 15, 18]\nlet firstEven = nums.find(n => n % 2 == 0)\nprint(firstEven)\n`
  },
  {
    task: "Write a Mycel program that counts how many numbers in a list are divisible by 3 using .count().",
    code: `let nums = [3, 4, 6, 9, 10, 12, 15]\nprint(nums.count(n => n % 3 == 0))\n`
  },
  {
    task: "Write a Mycel program that sorts an array of integers in ascending order using .sorted().",
    code: `let unsorted = [42, 10, 5, 23, 1]\nprint(unsorted.sorted())\n`
  },
  {
    task: "Write a Mycel program that sorts a list of strings by their length using .sortedBy().",
    code: `let words = ["elephant", "cat", "hippopotamus", "dog"]\nlet sorted = words.sortedBy(w => w.length)\nprint(sorted)\n`
  },
  {
    task: "Write a Mycel program that reverses an array using .reversed().",
    code: `let nums = [1, 2, 3, 4, 5]\nprint(nums.reversed())\n`
  },
  {
    task: "Write a Mycel program that slices an array from index 1 to 4 using .slice(from:to:).",
    code: `let letters = ["a", "b", "c", "d", "e", "f"]\nprint(letters.slice(1, 4))\n`
  },
  {
    task: "Write a Mycel program that takes the first 3 elements and drops the first 2 elements using .take() and .drop().",
    code: `let items = [10, 20, 30, 40, 50]\nprint(items.take(3))\nprint(items.drop(2))\n`
  },
  {
    task: "Write a Mycel program that concatenates two lists using .concat().",
    code: `let a = [1, 2]\nlet b = [3, 4]\nprint(a.concat(b))\n`
  },
  {
    task: "Write a Mycel program that removes duplicate elements from an array using .unique().",
    code: `let duplicates = [1, 2, 2, 3, 4, 4, 4, 5, 1]\nprint(duplicates.unique().sorted())\n`
  },
  {
    task: "Write a Mycel program that pairs two lists together using .zip().",
    code: `let keys = ["x", "y", "z"]\nlet vals = [10, 20, 30]\nlet pairs = keys.zip(vals)\nfor p in pairs {\n  print(f"{p.0}: {p.1}")\n}\n`
  },
  {
    task: "Write a Mycel program that enumerates items with their index using .enumerate().",
    code: `let tasks = ["Wake up", "Code", "Sleep"]\nfor entry in tasks.enumerate() {\n  print(f"{entry.0 + 1}. {entry.1}")\n}\n`
  },
  {
    task: "Write a Mycel program that flattens a list of lists using .flatMap().",
    code: `let matrix = [[1, 2], [3, 4], [5, 6]]\nlet flat = matrix.flatMap(row => row)\nprint(flat)\n`
  },
  {
    task: "Write a Mycel program that calculates the sum, max, and min of an integer list using built-in prelude functions.",
    code: `let scores = [88, 92, 79, 95, 84]\nprint(f"Sum: {sum(scores)}, Max: {max(scores)}, Min: {min(scores)}")\n`
  },
  {
    task: "Write a Mycel program that calculates the average of a list of floats.",
    code: `let readings: [Float] = [21.5, 23.0, 20.5, 22.0]\nlet avg = sum(readings) / readings.length.toFloat()\nprint(f"Avg: {avg:.2f}")\n`
  },
  {
    task: "Write a Mycel program demonstrating that collections are mutable reference types and .copy() creates an independent copy.",
    code: `var orig = [1, 2, 3]\nvar cloned = orig.copy()\ncloned.push(4)\nprint(orig.length, cloned.length)\n`
  },

  // 7. List Comprehensions (106-120)
  {
    task: "Write a Mycel program that squares each number in a list using a list comprehension.",
    code: `let nums = [1, 2, 3, 4, 5]\nlet squares = [n * n for n in nums]\nprint(squares)\n`
  },
  {
    task: "Write a Mycel program that filters even numbers and doubles them using a list comprehension with an if condition.",
    code: `let nums = [1, 2, 3, 4, 5, 6, 7, 8]\nlet result = [n * 2 for n in nums if n % 2 == 0]\nprint(result)\n`
  },
  {
    task: "Write a Mycel program that extracts the lengths of a list of words using a list comprehension.",
    code: `let words = ["apple", "pie", "banana", "kiwi"]\nlet lengths = [w.length for w in words]\nprint(lengths)\n`
  },
  {
    task: "Write a Mycel program that filters strings starting with 'A' using a list comprehension.",
    code: `let names = ["Alice", "Bob", "Anna", "Charlie", "Alex"]\nlet aNames = [n for n in names if n.startsWith("A")]\nprint(aNames)\n`
  },
  {
    task: "Write a Mycel program that generates diagonal coordinates (x, x) for a 3x3 grid using a comprehension.",
    code: `let coords = [(x, x) for x in 0..3]\nprint(coords)\n`
  },
  {
    task: "Write a Mycel program that turns a list of temperatures in Celsius to Fahrenheit using a comprehension.",
    code: `let cTemps = [0.0, 20.0, 37.0, 100.0]\nlet fTemps = [(c * 9.0 / 5.0) + 32.0 for c in cTemps]\nfor f in fTemps {\n  write(f"{f:.1f} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program that flattens a nested list using .flatMap().",
    code: `let grid = [[1, 2], [3, 4], [5]]\nlet flat = grid.flatMap(row => row)\nprint(flat)\n`
  },
  {
    task: "Write a Mycel program that strips whitespace from words using a list comprehension.",
    code: `let raw = ["  hello ", " world  ", " mycel "]\nlet clean = [s.trim() for s in raw]\nprint(clean)\n`
  },
  {
    task: "Write a Mycel program that creates a list of boolean values indicating whether numbers are prime (up to 10).",
    code: `fn isPrime(n: Int) -> Bool {\n  if n < 2 { return false }\n  for d in 2..n {\n    if n % d == 0 { return false }\n  }\n  return true\n}\nlet primes = [n for n in 1..=10 if isPrime(n)]\nprint(primes)\n`
  },
  {
    task: "Write a Mycel program that formats a list of prices into currency strings using an f-string in a list comprehension.",
    code: `let prices = [5.5, 12.0, 99.99]\nlet formatted = [f"\${p:.2f}" for p in prices]\nprint(formatted)\n`
  },
  {
    task: "Write a Mycel program that filters words with length >= 4 and transforms them to uppercase using a comprehension.",
    code: `let words = ["to", "be", "or", "not", "to", "be", "that", "is"]\nlet longCaps = [w.upper() for w in words if w.length >= 4]\nprint(longCaps.unique())\n`
  },
  {
    task: "Write a Mycel program that computes the cumulative lengths of words in a sentence.",
    code: `let words = ["The", "quick", "brown", "fox"]\nlet lens = [w.length for w in words]\nprint(lens, sum(lens))\n`
  },
  {
    task: "Write a Mycel program that extracts initials from a list of full names.",
    code: `let names = ["Grace Hopper", "Ada Lovelace", "Alan Turing"]\nlet initials = [n.split(" ").map(w => w.substring(0, 1)).join("") for n in names]\nprint(initials)\n`
  },
  {
    task: "Write a Mycel program that inverts a boolean list using a comprehension.",
    code: `let flags = [true, false, true, true, false]\nlet inverted = [!f for f in flags]\nprint(inverted)\n`
  },
  {
    task: "Write a Mycel program that computes x^2 - 1 for numbers 1 to 5 using a comprehension.",
    code: `let res = [x * x - 1 for x in 1..=5]\nprint(res)\n`
  },

  // 8. Maps & Dictionaries (121-140)
  {
    task: "Write a Mycel program that creates a map of string keys to integer values and looks up a key.",
    code: `let inventory = {"apples": 10, "bananas": 5, "oranges": 8}\nprint(inventory["apples"])\nprint(inventory.length)\n`
  },
  {
    task: "Write a Mycel program that uses .get(key, default) to provide a fallback value for missing keys.",
    code: `let scores = {"math": 95, "english": 88}\nprint(scores.get("math", 0))\nprint(scores.get("history", 70))\n`
  },
  {
    task: "Write a Mycel program that modifies a map by setting a new key and updating an existing key.",
    code: `var config = {"theme": "light", "fontSize": "14"}\nconfig["theme"] = "dark"\nconfig["showSidebar"] = "true"\nprint(config["theme"], config["showSidebar"])\n`
  },
  {
    task: "Write a Mycel program that checks if a key exists in a map using `in` and `.has(key)`.",
    code: `let users = {"admin": 1, "guest": 2}\nprint("admin" in users)\nprint("root" in users)\nprint(users.has("guest"))\n`
  },
  {
    task: "Write a Mycel program that iterates over keys and values of a map using `for k, v in map`.",
    code: `let capitals = {"France": "Paris", "Japan": "Tokyo", "Italy": "Rome"}\nfor k, v in capitals {\n  print(f"{k} -> {v}")\n}\n`
  },
  {
    task: "Write a Mycel program that extracts the keys and values of a map as lists.",
    code: `let d = {"a": 1, "b": 2, "c": 3}\nlet kList = d.keys.sorted()\nprint(kList)\n`
  },
  {
    task: "Write a Mycel program that removes a key from a map and checks its new length.",
    code: `var user = {"name": "Bob", "role": "editor", "temp": "yes"}\nlet removed = user.remove("temp")\nprint(removed, user.length)\n`
  },
  {
    task: "Write a Mycel program that merges two maps together using .merge().",
    code: `let base = {"a": 1, "b": 2}\nlet overrides = {"b": 20, "c": 30}\nlet combined = base.merge(overrides)\nprint(combined["a"], combined["b"], combined["c"])\n`
  },
  {
    task: "Write a Mycel program that counts word frequencies in a sentence using a map.",
    code: `let text = "apple orange banana apple orange apple"\nlet words = text.split(" ")\nvar freq: {String: Int} = {}\nfor w in words {\n  freq[w] = freq.get(w, 0) + 1\n}\nprint(freq["apple"], freq["orange"], freq["banana"])\n`
  },
  {
    task: "Write a Mycel program that maps student IDs to student names and looks up an optional entry.",
    code: `let students = {101: "Alice", 102: "Bob", 103: "Charlie"}\nprint(students[101])\nprint(students.get(999, "Unknown"))\n`
  },
  {
    task: "Write a Mycel program that inverts a dictionary of unique keys and values.",
    code: `let original = {"one": 1, "two": 2, "three": 3}\nvar inverted: {Int: String} = {}\nfor k, v in original {\n  inverted[v] = k\n}\nprint(inverted[1], inverted[2], inverted[3])\n`
  },
  {
    task: "Write a Mycel program that clears a map using .clear() and checks .isEmpty.",
    code: `var cache = {"x": 10, "y": 20}\ncache.clear()\nprint(cache.isEmpty, cache.length)\n`
  },
  {
    task: "Write a Mycel program that creates a map from pairs of a zipped array.",
    code: `let keys = ["name", "city", "country"]\nlet vals = ["Kyoto", "Kyoto", "Japan"]\nvar d: {String: String} = {}\nfor p in keys.zip(vals) {\n  d[p.0] = p.1\n}\nprint(d["city"], d["country"])\n`
  },
  {
    task: "Write a Mycel program that finds the key with the highest value in a score map.",
    code: `let scores = {"Alice": 85, "Bob": 92, "Charlie": 78}\nvar topStudent = ""\nvar topScore = -1\nfor name, s in scores {\n  if s > topScore {\n    topScore = s\n    topStudent = name\n  }\n}\nprint(f"Top: {topStudent} ({topScore})")\n`
  },
  {
    task: "Write a Mycel program that checks if a map contains a value by searching .values.",
    code: `let roles = {"u1": "admin", "u2": "viewer", "u3": "editor"}\nprint("admin" in roles.values)\nprint("guest" in roles.values)\n`
  },
  {
    task: "Write a Mycel program demonstrating that maps support Float keys.",
    code: `var rates: {Float: String} = {}\nrates[1.5] = "Standard"\nrates[2.0] = "Double"\nprint(rates[1.5], rates[2.0])\n`
  },
  {
    task: "Write a Mycel program that groups numbers into even and odd lists inside a map.",
    code: `let numbers = [1, 2, 3, 4, 5, 6, 7]\nvar groups: {String: [Int]} = {"even": [], "odd": []}\nfor n in numbers {\n  if n % 2 == 0 {\n    groups["even"]!.push(n)\n  } else {\n    groups["odd"]!.push(n)\n  }\n}\nprint(groups["even"]!, groups["odd"]!)\n`
  },
  {
    task: "Write a Mycel program that iterates over map entries with .entries.",
    code: `let fruits = {"lemon": "yellow", "lime": "green"}\nfor e in fruits.entries {\n  print(f"{e.0} is {e.1}")\n}\n`
  },
  {
    task: "Write a Mycel program that copies a map and verifies modifications do not affect the original.",
    code: `var m1 = {"a": 1}\nvar m2 = m1.copy()\nm2["b"] = 2\nprint(m1.length, m2.length)\n`
  },
  {
    task: "Write a Mycel program that calculates the total value of items in a shopping cart map.",
    code: `let prices = {"book": 15, "pen": 3, "notebook": 7}\nvar total = 0\nfor _, p in prices {\n  total += p\n}\nprint(f"Total: \${total}")\n`
  },

  // 9. Sets (141-155)
  {
    task: "Write a Mycel program that creates a Set of integers from a list and prints its length.",
    code: `let s = Set([1, 2, 3, 3, 2, 1])\nprint(s.length, s.sorted())\n`
  },
  {
    task: "Write a Mycel program that adds and removes items in a Set.",
    code: `var tags = Set(["fast", "safe"])\ntags.add("modern")\ntags.remove("fast")\nprint(tags.sorted())\n`
  },
  {
    task: "Write a Mycel program demonstrating set union using the `|` operator.",
    code: `let s1 = Set([1, 2, 3])\nlet s2 = Set([3, 4, 5])\nlet union = s1 | s2\nprint(union.sorted())\n`
  },
  {
    task: "Write a Mycel program demonstrating set intersection using the `&` operator.",
    code: `let a = Set(["red", "green", "blue"])\nlet b = Set(["yellow", "green", "red"])\nlet common = a & b\nprint(common.sorted())\n`
  },
  {
    task: "Write a Mycel program demonstrating set difference using the `-` operator.",
    code: `let allUsers = Set(["alice", "bob", "charlie"])\nlet activeUsers = Set(["bob"])\nlet inactive = allUsers - activeUsers\nprint(inactive.sorted())\n`
  },
  {
    task: "Write a Mycel program that tests membership in a Set using `in` and `.has()`.",
    code: `let allowed = Set([80, 443, 8080])\nprint(80 in allowed, 22 in allowed, allowed.has(443))\n`
  },
  {
    task: "Write a Mycel program that finds unique characters in a string using a Set.",
    code: `let word = "banana"\nvar chars: [Char] = []\nfor c in word { chars.push(c) }\nlet uniqueChars = Set(chars)\nprint(uniqueChars.length)\n`
  },
  {
    task: "Write a Mycel program that converts a Set to an array using .toArray() and sorts it.",
    code: `let s = Set([50, 10, 30, 20])\nlet arr = s.toArray().sorted()\nprint(arr)\n`
  },
  {
    task: "Write a Mycel program that clears a set using .clear().",
    code: `var s = Set([1, 2, 3])\ns.clear()\nprint(s.isEmpty)\n`
  },
  {
    task: "Write a Mycel program that checks if two sets are disjoint (have no common elements).",
    code: `fn areDisjoint(a: Set<Int>, b: Set<Int>) -> Bool {\n  return (a & b).isEmpty\n}\nprint(areDisjoint(Set([1, 2]), Set([3, 4])))\nprint(areDisjoint(Set([1, 2]), Set([2, 3])))\n`
  },
  {
    task: "Write a Mycel program that checks if set A is a subset of set B.",
    code: `fn isSubset(sub: Set<Int>, superSet: Set<Int>) -> Bool {\n  for item in sub {\n    if item not in superSet { return false }\n  }\n  return true\n}\nprint(isSubset(Set([1, 2]), Set([1, 2, 3, 4])))\nprint(isSubset(Set([1, 5]), Set([1, 2, 3, 4])))\n`
  },
  {
    task: "Write a Mycel program that finds the symmetric difference between two sets.",
    code: `let a = Set([1, 2, 3])\nlet b = Set([3, 4, 5])\nlet symDiff = (a - b) | (b - a)\nprint(symDiff.sorted())\n`
  },
  {
    task: "Write a Mycel program that iterates over elements of a Set with a for loop.",
    code: `let tags = Set(["alpha", "beta"])\nfor t in tags.sorted() {\n  write(f"{t} ")\n}\nprint("")\n`
  },
  {
    task: "Write a Mycel program that removes all vowels from a word using a set difference.",
    code: `let vowels = Set(['a', 'e', 'i', 'o', 'u'])\nlet word = "mycelium"\nvar consonants: [Char] = []\nfor c in word {\n  if c not in vowels { consonants.push(c) }\n}\nprint(consonants.join(""))\n`
  },
  {
    task: "Write a Mycel program demonstrating set union and intersection methods (.union and .intersect).",
    code: `let s1 = Set([10, 20])\nlet s2 = Set([20, 30])\nprint(s1.union(s2).sorted())\nprint(s1.intersect(s2).sorted())\n`
  },

  // 10. Tuples (156-170)
  {
    task: "Write a Mycel program that creates a pair tuple (Int, String) and accesses its elements by index.",
    code: `let pair = (1, "one")\nprint(pair.0, pair.1)\n`
  },
  {
    task: "Write a Mycel program that unpacks a 3-element tuple into three variables.",
    code: `let coords = (10, 20, 30)\nlet (x, y, z) = coords\nprint(f"X={x}, Y={y}, Z={z}")\n`
  },
  {
    task: "Write a Mycel program with a function that returns a tuple of (min, max) from an array.",
    code: `fn minMax(items: [Int]) -> (Int, Int) {\n  return (min(items), max(items))\n}\nlet res = minMax([4, 1, 9, -2, 7])\nprint(f"Min: {res.0}, Max: {res.1}")\n`
  },
  {
    task: "Write a Mycel program with a function that returns a quotient and remainder tuple.",
    code: `fn divMod(a: Int, b: Int) -> (Int, Int) {\n  return (a.div(b), a % b)\n}\nlet dm = divMod(17, 5)\nprint(f"Quotient: {dm.0}, Remainder: {dm.1}")\n`
  },
  {
    task: "Write a Mycel program that compares two tuples for equality.",
    code: `let t1 = (1, "a")\nlet t2 = (1, "a")\nlet t3 = (2, "a")\nprint(t1 == t2, t1 == t3)\n`
  },
  {
    task: "Write a Mycel program that uses match on a tuple of booleans to implement logical XOR.",
    code: `fn xor(a: Bool, b: Bool) -> Bool {\n  return match (a, b) {\n    (true, false) => true\n    (false, true) => true\n    _ => false\n  }\n}\nprint(xor(true, true), xor(true, false), xor(false, false))\n`
  },
  {
    task: "Write a Mycel program that matches on a 2D coordinate tuple to classify quadrant.",
    code: `fn quadrant(pt: (Int, Int)) -> String {\n  return match pt {\n    (0, 0) => "Origin"\n    (x, y) if x > 0 && y > 0 => "Q1"\n    (x, y) if x < 0 && y > 0 => "Q2"\n    (x, y) if x < 0 && y < 0 => "Q3"\n    _ => "Other"\n  }\n}\nprint(quadrant((0, 0)), quadrant((2, 3)), quadrant((-1, -1)))\n`
  },
  {
    task: "Write a Mycel program that stores a list of key-value tuples and iterates through them.",
    code: `let pairs: [(String, Int)] = [("alpha", 1), ("beta", 2), ("gamma", 3)]\nfor p in pairs {\n  print(f"{p.0}={p.1}")\n}\n`
  },
  {
    task: "Write a Mycel program that swaps two variables in place using tuple assignment.",
    code: `var x = 100\nvar y = 200\nx, y = y, x\nprint(f"x={x}, y={y}")\n`
  },
  {
    task: "Write a Mycel program that sorts a list of tuples by their second element.",
    code: `let players = [("Bo", 85), ("Ada", 95), ("Chen", 90)]\nlet ranked = players.sortedBy(p => p.1)\nfor p in ranked {\n  print(f"{p.0}: {p.1}")\n}\n`
  },
  {
    task: "Write a Mycel program that splits a full name into a (first, last) tuple.",
    code: `fn splitName(full: String) -> (String, String) {\n  let parts = full.split(" ")\n  return (parts[0], parts[1])\n}\nlet res = splitName("Ada Lovelace")\nprint(res.0, res.1)\n`
  },
  {
    task: "Write a Mycel program that calculates the distance between two 2D point tuples.",
    code: `import std.math\nfn dist(p1: (Float, Float), p2: (Float, Float)) -> Float {\n  let dx = p1.0 - p2.0\n  let dy = p1.1 - p2.1\n  return math.sqrt(dx * dx + dy * dy)\n}\nprint(dist((0.0, 0.0), (3.0, 4.0)))\n`
  },
  {
    task: "Write a Mycel program that returns multiple statistics (count, sum, average) as a 3-element tuple.",
    code: `fn stats(nums: [Int]) -> (Int, Int, Float) {\n  let c = nums.length\n  let s = sum(nums)\n  let avg = s.toFloat() / c.toFloat()\n  return (c, s, avg)\n}\nlet res = stats([10, 20, 30])\nprint(res.0, res.1, res.2)\n`
  },
  {
    task: "Write a Mycel program that swaps the elements of a pair tuple.",
    code: `fn swapPair<A, B>(p: (A, B)) -> (B, A) {\n  return (p.1, p.0)\n}\nlet swapped = swapPair((42, "answer"))\nprint(swapped.0, swapped.1)\n`
  },
  {
    task: "Write a Mycel program that matches a pair of optional ints.",
    code: `fn describe(pair: (Int?, Int?)) -> String {\n  return match pair {\n    (nil, nil) => "Both nil"\n    (x, nil) => f"First is {x!}"\n    (nil, y) => f"Second is {y!}"\n    (x, y) => f"Both: {x!}, {y!}"\n  }\n}\nprint(describe((nil, nil)), describe((1, nil)), describe((2, 3)))\n`
  }
];
