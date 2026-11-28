// Switching-to-Mycel 5-part lessons for 8 languages.
// Every snippet lives under lang/learn/samples/switch/<lang>/.
// check-switch.mjs runs every .myc snippet with lang/bin/mycel, checks every habit snippet with `mycel check`,
// runs other-language snippets on installed toolchains (marking missing ones unrun), and verifies build-switch.mjs output.

export const SWITCH_LANGS = [
  {
    slug: "python",
    name: "Python",
    titleName: "Python developers",
    ext: "py",
    toolchain: "python3",
    pkgManager: "pip / uv",
    foreignFlag: "--python",
    summary: "Keep f-strings, # comments, // floor division, %, comprehensions, and plain imports; gain inferred static types and brace closures.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to Python",
        same: "Top-level statements run with no <code>main()</code> boilerplate, comments use <code>#</code>, strings use <code>f\"...\"</code>, <code>//</code> is Python-style floor division (<code>-7 // 2 == -4</code>), <code>%</code> is floor modulo (<code>-7 % 3 == 2</code>), and <code>from math import sqrt</code> needs no <code>std.</code> prefix.",
        simpler: "<code>7 / 2</code> is exact <code>3.5</code>, just like Python 3. Unlike Python, types are checked before the program runs, and blocks use <code>{ ... }</code> instead of indentation.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.py",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, neg_div=-4, neg_mod=2",
        otherOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, neg_div=-4, neg_mod=2"
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Variables, types, and functions",
        same: "Plain assignment (<code>x = 1</code>) works, parameter defaults and named arguments work, and <code>-&gt; Type</code> annotates return types.",
        simpler: "<code>let</code> locks a binding and <code>var</code> allows reassignment; <code>fn</code> replaces <code>def</code>, one-line functions use <code>=&gt;</code> instead of <code>lambda</code>, and types are capitalised (<code>Int</code>, <code>Float</code>, <code>String</code>, <code>Bool</code>).",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.py",
        mycOut: "Mycel 3\nhi Ada x2\n36",
        otherOut: "Python 3\nhi Ada x2\n36"
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Collections, loops, and brace closures",
        same: "List and map literals, <code>for i, x in items</code>, <code>in</code> membership, <code>d.get(k, default)</code>, and comprehensions all carry over.",
        simpler: "Chained transforms use brace closures with implicit <code>it</code> (<code>nums.filter { it &gt; 5 }</code>) or explicit params (<code>{ (acc, x) =&gt; acc + x }</code>). Pulling numbers or words from text uses <code>.extract(Int) { it &gt; 5 }</code> instead of <code>re.findall</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.py",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\n0: tea\n1: cake\n0 true\n[9, 6]",
        otherOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\n0: tea\n1: cake\n0 True\n[9, 6]"
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Errors, optionals, and imports / ply",
        same: "Plain module names (<code>import json</code>, <code>import http</code>) work like Python imports without a prefix.",
        simpler: "Missing values are <code>T?</code> with <code>if let</code> and <code>??</code>, and recoverable errors return <code>Result&lt;T, E&gt;</code> propagated with <code>?</code> instead of uncaught exceptions. Native Mycel packages like <code>tensor</code> install with <code>ply install tensor</code> (no flag); Python packages use <code>ply install requests --python</code> and <code>import requests --python</code> in code.",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.py",
        mycOut: "Ok(42)\nErr(\"not an integer: oops\")\n200 {\"sum\":6}",
        otherOut: "42\nerr: invalid literal for int() with base 10: 'oops'\n{\"sum\": 6.0}"
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "Python habits to watch + mini CLI project",
        habits: [
          {
            label: "def instead of fn",
            file: "05_habit_1.myc",
            diag: "error [E0101]: `def` is Python — Mycel writes `fn name(args) { ... }`\n  --> 05_habit_1.myc:1:1\n  |\n1 | def double(x):\n  | ^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "elif instead of else if",
            file: "05_habit_2.myc",
            diag: "error [E0101]: `elif` is Python — Mycel writes `else if`\n  --> 05_habit_2.myc:5:1\n  |\n5 | elif score >= 70 {\n  | ^^^^\n  why: this word comes from another language\n  fix: write `else if`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "None instead of nil",
            file: "05_habit_3.myc",
            diag: "error [E0352]: `None` is Python — Mycel writes `nil`\n  --> 05_habit_3.myc:1:13\n  |\n1 | let value = None\n  |             ^^^^\n  why: `None` is not defined in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0352` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI expense line analyzer",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI arguments via <code>import env</code> (falling back to sample text), extracts integers over 5 with <code>.extract(Int) { it &gt; 5 }</code>, returns a <code>Result</code> if none match, and prints a JSON summary with <code>json.encode</code>.",
        starterFile: "05_project_starter.myc",
        starterOut: "raw: coffee 4 lunch 14 snack 3 book 22",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"count\":2,\"over5\":[14,22],\"total\":36,\"max\":22}",
        cliTestArgs: ["a 10 b 2 c 25"],
        cliTestOut: "{\"count\":2,\"over5\":[10,25],\"total\":35,\"max\":25}"
      }
    ]
  },
  {
    slug: "javascript-typescript",
    name: "JavaScript / TypeScript",
    titleName: "JavaScript and TypeScript developers",
    ext: "ts",
    toolchain: "node",
    pkgManager: "npm / pnpm",
    foreignFlag: "--npm",
    summary: "Carry over let, =>, ?., ?? and TypeScript-style interfaces; swap // comments for #, === for ==, and backticks for f-strings.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to JS / TS",
        same: "<code>let</code> bindings, <code>/</code> floating-point division (<code>7 / 2 == 3.5</code>), and no build-config ceremony before running a single file.",
        simpler: "Comments start with <code>#</code> because <code>//</code> is whole-number floor division (<code>7 // 2 == 3</code>, <code>-7 // 2 == -4</code>) and <code>%</code> is floor modulo. Interpolation uses <code>f\"...\"</code> instead of backticks, and <code>from math import sqrt</code> imports directly.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.ts",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: "Hello, Ada! sqrt(25)=5\nexact=3.5, whole=3, negDiv=-4, negMod=2"
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Variables, types, and functions",
        same: "Types follow a colon (<code>var counter: Int = 0</code>), arrow lambdas work (<code>(n: Int) =&gt; n * n</code>), and local types are inferred.",
        simpler: "<code>let</code> is immutable (replaces <code>const</code>) and <code>var</code> is mutable (replaces JS <code>let</code>). TypeScript's <code>number</code> splits into <code>Int</code> and <code>Float</code>, <code>fn</code> replaces <code>function</code>, and named parameters work at call sites.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.ts",
        mycOut: "Mycel 3\nhi Ada x2\n36",
        otherOut: "TypeScript 3\nhi Ada x2\n36"
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Arrays, maps, brace closures, and .extract()",
        same: "<code>.filter</code>, <code>.map</code>, <code>.reduce</code>, array literals, and <code>for (k, v) in map</code> feel immediate.",
        simpler: "Brace closures let you write <code>nums.filter { it &gt; 5 }</code> without repeating a parameter name, maps use <code>{\"ana\": 91}</code> instead of <code>new Map()</code>, and <code>.extract(Int) { it &gt; 5 }</code> replaces <code>text.match(/\\d+/g)</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.ts",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\nana: 91\nbo: 78\n0 true\n[42, 8080]",
        otherOut: "big=[6,9,8], doubled=[12,18,16], total=23\nana: 91\nbo: 78\n0 true\n[ 42, 8080 ]"
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "<code>?.</code> and <code>??</code> behave like JavaScript, and <code>json</code> literals work where <code>json.Json</code> is expected.",
        simpler: "<code>nil</code> replaces both <code>null</code> and <code>undefined</code>, and typed <code>Result&lt;T, E&gt;</code> with <code>?</code> replaces untyped <code>throw</code>. Native packages install with <code>ply install tensor</code> (no flag); npm packages use <code>ply install lodash --npm</code> and <code>import lodash --npm</code>.",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.ts",
        mycOut: "8080\nOk(3000)\nErr(\"bad port: nope\")\n{\"ok\":true,\"status\":200} 200 12.0",
        otherOut: "8080\n3000\nerr: bad port: nope\n{\"ok\":true,\"status\":200} 12"
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "JS / TS habits to watch + mini CLI project",
        habits: [
          {
            label: "// comment instead of #",
            file: "05_habit_1.myc",
            diag: "error [E0001]: comments start with # in Mycel\n  --> 05_habit_1.myc:1:1\n  |\n1 | // comment from JS\n  | ^^^^^^^^^^^^^^^^^^\n  why: `//` is whole-number division in Mycel (`7 // 2` is 3), so it cannot start a comment\n  fix: write `# comment from JS` (or run `mycel fmt --fix` to rewrite old files)\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0001` explains this error with an example"
          },
          {
            label: "function / console.log",
            file: "05_habit_2.myc",
            diag: "error [E0101]: `function` is JavaScript — Mycel writes `fn name(args) { ... }`\n  --> 05_habit_2.myc:1:1\n  |\n1 | function greet(name) {\n  | ^^^^^^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "number type from TypeScript",
            file: "05_habit_3.myc",
            diag: "error [E0211]: `number` is TypeScript — Mycel has `Int` (whole) and `Float` (decimal)\n  --> 05_habit_3.myc:1:11\n  |\n1 | let port: number = 3000\n  |           ^^^^^^\n  why: no type named `number` exists in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0211` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI high-port checker",
        projectPrompt: "Finish <code>05_project_starter.myc</code> to extract valid high ports (<code>1001..65535</code>) using <code>.extract(Int) { it &gt; 1000 &amp;&amp; it &lt;= 65535 }</code>, return <code>Result&lt;[Int], String&gt;</code>, and print JSON via <code>import json</code>.",
        starterFile: "05_project_starter.myc",
        starterOut: "web:80 admin:8080 ssh:22 db:5432",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"count\":2,\"ports\":[8080,5432],\"max\":8080}",
        cliTestArgs: ["api:9000 health:80"],
        cliTestOut: "{\"count\":1,\"ports\":[9000],\"max\":9000}"
      }
    ]
  },
  {
    slug: "java",
    name: "Java",
    titleName: "Java developers",
    ext: "java",
    toolchain: "javac",
    pkgManager: "Maven / Gradle",
    foreignFlag: "--java",
    summary: "Keep classes and typed code without public static void main, new, semicolons, or checked-exception boilerplate.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to Java",
        same: "Static types catch mismatches before execution, and curly braces structure blocks.",
        simpler: "No class wrapper or <code>public static void main</code> is needed for scripts, comments start with <code>#</code>, <code>7 / 2</code> is exact <code>3.5</code> while <code>7 // 2</code> is floor division, and <code>from math import sqrt</code> replaces <code>Math.sqrt</code>.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.java",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2"
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Classes, variables, and methods",
        same: "<code>class</code> definitions, fields, methods, and <code>return</code> statements keep the familiar object-oriented shape.",
        simpler: "Drop <code>new</code> (call <code>Counter()</code> directly), use <code>self</code> instead of <code>this</code>, omit <code>void</code> when nothing is returned, and use default arguments instead of writing telescoping overloads.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.java",
        mycOut: "1 3\ncount=3",
        otherOut: "1 3\ncount=3"
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Collections, streams, and .extract()",
        same: "Transforming collections with <code>filter</code>, <code>map</code>, and <code>reduce</code> mirrors Java Streams.",
        simpler: "Call <code>nums.filter { it &gt; 5 }</code> directly on lists without <code>.stream()</code> or <code>.toList()</code>, iterate maps with <code>for (name, age) in ages</code>, and replace <code>Pattern.compile</code> + <code>Matcher</code> loops with <code>.extract(Int) { it &gt; 5 }</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.java",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\nana: 31\nbo: 25\n0 true\n[12, 84]",
        otherOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\nana: 31\nbo: 25\n0 true\n[12, 84]"
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "Explicit optionality and typed errors keep null bugs out of production.",
        simpler: "<code>String?</code> with <code>??</code> is built into the syntax instead of <code>Optional&lt;String&gt;.orElse</code>, and <code>Result&lt;T, E&gt;</code> with <code>?</code> replaces checked exceptions. Built-ins import plainly (<code>import http</code>, <code>import json</code>), and <code>ply install tensor</code> adds Mycel packages with no XML/Gradle files (Maven bridge <code>--java</code> is recognised as planned).",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.java",
        mycOut: "Ada\nguest\nOk(28) Err(\"bad age: x\")\n200 {\"mean\":15}",
        otherOut: "Ada\nguest\n28\nbad age: x"
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "Java habits to watch + mini CLI project",
        habits: [
          {
            label: "public static void main",
            file: "05_habit_1.myc",
            diag: "error [E0101]: `public` is Java — Mycel writes `pub` (and no `static void main` is needed: just write statements)\n  --> 05_habit_1.myc:1:1\n  |\n1 | public static void main(String[] args) {\n  | ^^^^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "type before variable name (int count = 5)",
            file: "05_habit_2.myc",
            diag: "error [E0101]: `int` is Java/C — Mycel writes `let x: Int = 5` (or just `let x = 5`)\n  --> 05_habit_2.myc:1:1\n  |\n1 | int count = 5;\n  | ^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "new Box()",
            file: "05_habit_3.myc",
            diag: "error [E0101]: `new` is JavaScript/Java — Mycel writes `Box(...)` without `new`\n  --> 05_habit_3.myc:2:9\n  |\n2 | let b = new Box()\n  |         ^^^\n  fix: call the class like a function\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI log latency analyzer",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI args via <code>import env</code>, extracts latencies over 10ms with <code>.extract(Int) { it &gt; 10 }</code>, filters slow ones (<code>&gt; 50</code>), and prints a JSON report or error.",
        starterFile: "05_project_starter.myc",
        starterOut: "GET 12ms POST 140ms ping 4ms search 65ms",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"count\":3,\"avgMs\":72.33333333333333,\"slow\":[140,65]}",
        cliTestArgs: ["auth 180ms ping 2ms"],
        cliTestOut: "{\"count\":1,\"avgMs\":180,\"slow\":[180]}"
      }
    ]
  },
  {
    slug: "go",
    name: "Go",
    titleName: "Go developers",
    ext: "go",
    toolchain: "go",
    pkgManager: "go mod",
    foreignFlag: "--go",
    summary: "Keep plain control flow, nil, and structs; swap := for let/var, func for fn, and if err != nil for Result + ?.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to Go",
        same: "One clear way to write common tasks, fast single-binary CLI runs, and unparenthesized <code>if</code>/<code>for</code> conditions.",
        simpler: "No <code>package main</code> or <code>func main()</code> required for small scripts, comments start with <code>#</code> (since <code>//</code> is floor division), <code>7 / 2</code> is exact <code>3.5</code>, and <code>f\"...\"</code> replaces <code>fmt.Printf</code>.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.go",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: null
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Structs, variables, and functions",
        same: "<code>struct</code> groups fields cleanly as an immutable value type.",
        simpler: "<code>let</code> / <code>var</code> (or <code>p = ...</code>) replaces <code>:=</code>, types come after a colon (<code>dx: Int = 1</code>), and default/named arguments avoid wrapper functions.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.go",
        mycOut: "(3, 7)",
        otherOut: null
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Slices, maps, brace closures, and .extract()",
        same: "<code>for (k, v) in counts</code> mirrors <code>for k, v := range counts</code>, and <code>nil</code> is spelled the same.",
        simpler: "<code>nums.filter { it &gt; 5 }</code> and <code>.map { it * 2 }</code> replace multi-line <code>append</code> loops, <code>\"ok\" in counts</code> checks membership, and <code>.extract(Int) { it &gt; 5 }</code> replaces <code>regexp.MustCompile</code> + <code>strconv.Atoi</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.go",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\nok=3\nerr=1\n0 true\n[72, 91]",
        otherOut: null
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "Errors are explicit values, not hidden control flow, and <code>task.select</code> mirrors Go's <code>select</code>.",
        simpler: "<code>parseTimeout(raw)?</code> propagates errors in one character instead of repeating <code>if err != nil { return 0, err }</code>. Built-in modules use plain names (<code>import http</code>, <code>import json</code>), and <code>ply install tensor</code> installs Mycel packages with no flag (<code>--go</code> is recognised as planned).",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.go",
        mycOut: "500\nOk(500) Err(\"bad timeout: abc\")\n200 {\"sum\":6}",
        otherOut: null
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "Go habits to watch + mini CLI project",
        habits: [
          {
            label: ":= short declaration",
            file: "05_habit_1.myc",
            diag: "error [E0100]: `:=` is Go — Mycel writes `let x = value` (or `x = value` to change a `var`)\n  --> 05_habit_1.myc:1:3\n  |\n1 | x := 5\n  |   ^\n  why: statements are separated by a newline or `;`\n  fix: put the next statement on its own line\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0100` explains this error with an example"
          },
          {
            label: "func instead of fn",
            file: "05_habit_2.myc",
            diag: "error [E0101]: `func` is Go/Swift — Mycel writes `fn name(args) { ... }`\n  --> 05_habit_2.myc:1:1\n  |\n1 | func greet() {\n  | ^^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "fmt.Println instead of print",
            file: "05_habit_3.myc",
            diag: "error [E0101]: `fmt.Println` is Go — Mycel writes `print(...)`\n  --> 05_habit_3.myc:1:1\n  |\n1 | fmt.Println(\"ready\")\n  | ^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI metric threshold checker",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI args with <code>import env</code>, extracts all metric integers with <code>.extract(Int)</code>, filters alerts <code>{ it &gt; 50 }</code>, and returns a JSON report or <code>Err</code>.",
        starterFile: "05_project_starter.myc",
        starterOut: "cpu=14 mem=82 disk=91 swap=3",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"total\":4,\"alerts\":[82,91],\"peak\":91}",
        cliTestArgs: ["cpu=12 mem=64"],
        cliTestOut: "{\"total\":2,\"alerts\":[64],\"peak\":64}"
      }
    ]
  },
  {
    slug: "rust",
    name: "Rust",
    titleName: "Rust developers",
    ext: "rs",
    toolchain: "rustc",
    pkgManager: "Cargo",
    foreignFlag: "--cargo",
    summary: "Keep fn, immutable let, match, enums, Result, and ?; drop lifetimes, let mut, :: paths, and String/&str splits.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to Rust",
        same: "<code>let</code> is immutable by default, expressions are everywhere, and types are checked ahead of execution.",
        simpler: "No <code>fn main()</code> required for scripts, comments start with <code>#</code> (since <code>//</code> is Python-style floor division), <code>7 / 2</code> is <code>3.5</code> without casting, and <code>f\"...\"</code> replaces <code>println!(\"{}\", ...)</code>.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.rs",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: null
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Variables, structs, and functions",
        same: "<code>fn</code>, <code>-&gt;</code> return types, <code>struct</code>, and immutable <code>let</code> match Rust's core instincts.",
        simpler: "Write <code>var</code> instead of <code>let mut</code>, <code>Int</code> instead of <code>i64</code>/<code>usize</code>, pass objects without <code>&amp;</code> borrows, and use default/named arguments on <code>fn</code>.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.rs",
        mycOut: "2 4 9",
        otherOut: null
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Collections, brace closures, and .extract()",
        same: "Chained iterator-style <code>filter</code>, <code>map</code>, and <code>reduce</code> feel natural right away.",
        simpler: "Write <code>[1, 2]</code> instead of <code>vec![1, 2]</code>, skip <code>.iter().copied()</code> and <code>.collect()</code>, use <code>nums.filter { it &gt; 5 }</code>, and replace <code>.split(...).filter_map(...)</code> with <code>.extract(Int) { it &gt; 5 }</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.rs",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\nok: 3\nerr: 1\n0 true\n[22, 443, 8080]",
        otherOut: null
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "<code>Result&lt;T, E&gt;</code>, <code>Ok</code>, <code>Err</code>, and <code>?</code> propagation work the exact same way, alongside exhaustive <code>match</code>.",
        simpler: "Optionals use <code>Int?</code> and <code>nil</code> (with <code>if let v = maybe</code> and <code>??</code>) instead of <code>Option&lt;i64&gt;</code>/<code>Some</code>/<code>None</code>. Imports are plain (<code>import http</code>, <code>import json</code>), and <code>ply install tensor</code> works without a Cargo.toml (<code>--cargo</code> is recognised as planned).",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.rs",
        mycOut: "got 42\nOk(2) Err(\"3 is odd\")\n200 {\"sum\":6}",
        otherOut: null
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "Rust habits to watch + mini CLI project",
        habits: [
          {
            label: "let mut instead of var",
            file: "05_habit_1.myc",
            diag: "error [E0101]: `let mut` is Rust — Mycel writes `var`\n  --> 05_habit_1.myc:1:5\n  |\n1 | let mut total = 0\n  |     ^^^\n  why: `let` is fixed once set; `var` can change\n  fix: write `var total = ...`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "println! macro",
            file: "05_habit_2.myc",
            diag: "error [E0352]: `println` — Mycel writes `print(...)`\n  --> 05_habit_2.myc:1:1\n  |\n1 | println!(\"hello {}\", 42)\n  | ^^^^^^^\n  why: `println` is not defined in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0352` explains this error with an example"
          },
          {
            label: "i32 instead of Int",
            file: "05_habit_3.myc",
            diag: "error [E0211]: `i32` is Rust — Mycel's whole-number type is `Int`\n  --> 05_habit_3.myc:1:8\n  |\n1 | let n: i32 = 10\n  |        ^^^\n  why: no type named `i32` exists in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0211` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI safe int extractor",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI args via <code>import env</code>, extracts integers <code>&gt; 5</code> with <code>.extract(Int) { it &gt; 5 }</code>, computes sum and product using <code>.reduce(...)</code>, and returns <code>Result&lt;String, String&gt;</code>.",
        starterFile: "05_project_starter.myc",
        starterOut: "batch 12, 45, 3, 19, 8",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"nums\":[12,45,19,8],\"sum\":84,\"product\":82080}",
        cliTestArgs: ["2 10 3 4"],
        cliTestOut: "{\"nums\":[10],\"sum\":10,\"product\":10}"
      }
    ]
  },
  {
    slug: "swift",
    name: "Swift",
    titleName: "Swift developers",
    ext: "swift",
    toolchain: "swiftc",
    pkgManager: "SwiftPM",
    foreignFlag: "--swift",
    summary: "Keep let/var, T?, if let, ??, struct/enum, and trailing closures; swap func for fn, \\(x) for f-strings, and ..< for ..",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to Swift",
        same: "<code>let</code> constants, <code>nil</code>, and clean top-level script execution match Swift's ergonomics.",
        simpler: "Comments start with <code>#</code> (since <code>//</code> is whole-number division), <code>7 / 2</code> mixes cleanly into <code>Float</code> (<code>3.5</code>), interpolation uses <code>f\"...\"</code> instead of <code>\\(...)</code>, and <code>from math import sqrt</code> needs no <code>Foundation</code> import.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.swift",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3"
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Variables, structs, and functions",
        same: "<code>let</code> / <code>var</code>, immutable <code>struct</code> value types, named arguments, and <code>-&gt;</code> return types feel native.",
        simpler: "Write <code>fn</code> instead of <code>func</code>, use <code>Float</code> instead of <code>Double</code>, format floats right inside f-strings (<code>{minsPerUnit:.2f}</code>), and enjoy automatic <code>Int</code>/<code>Float</code> mixing.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.swift",
        mycOut: "2 4.80 min/km",
        otherOut: "2 4.80 min/km"
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Arrays, dictionaries, brace closures, and .extract()",
        same: "Trailing brace closures feel right at home: <code>nums.filter { it &gt; 5 }</code> replaces <code>nums.filter { $0 &gt; 5 }</code>.",
        simpler: "Maps use <code>{\"1k\": 285}</code> instead of <code>[:]</code>, half-open ranges are already <code>0..3</code> (no <code>..&lt;</code>), and <code>.extract(Int) { it &gt; 5 }</code> replaces <code>split</code> + <code>compactMap</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.swift",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\n1k: 285s\n2k: 292s\n0 1 2 \n[24, 10, 51, 13]",
        otherOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\n1k: 285s\n2k: 292s\n0 1 2 \n[24, 10, 51, 13]"
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "<code>Int?</code>, <code>if let n = maybe</code>, <code>??</code>, and leading-dot enum cases (<code>.Ok</code>, <code>.Err</code>) carry straight over.",
        simpler: "<code>Result&lt;T, E&gt;</code> with <code>?</code> replaces <code>do/try/catch</code> boilerplate for value-level errors. Built-in modules import plainly (<code>import http</code>, <code>import json</code>), and <code>ply install tensor</code> adds Mycel packages without a <code>Package.swift</code> manifest (<code>--swift</code> is recognised as planned).",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.swift",
        mycOut: "got 24\n24\nOk(24) Err(\"bad number: bad\")\n200 {\"mean\":5}",
        otherOut: "got 24\n24\nOptional(24) nil"
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "Swift habits to watch + mini CLI project",
        habits: [
          {
            label: "\\(x) string interpolation",
            file: "05_habit_1.myc",
            diag: "error [E0001]: `\\(x)` is Swift — Mycel writes f\"...{x}...\" (an f before the quote)\n  --> 05_habit_1.myc:2:14\n  |\n2 |   return \"hi \\(name)\"\n  |              ^^\n  why: string interpolation uses an f-string\n  fix: write f\"v {x}\"\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0001` explains this error with an example"
          },
          {
            label: "..< half-open range",
            file: "05_habit_2.myc",
            diag: "error [E0100]: `..<` is Swift — Mycel's `0..n` already excludes the end (`0..=n` includes it)\n  --> 05_habit_2.myc:1:13\n  |\n1 | for i in 0..<3 {\n  |             ^\n  why: a value (number, string, name, call, ...) is needed at this point\n  fix: check for a missing operand or a stray symbol\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0100` explains this error with an example"
          },
          {
            label: "Double instead of Float",
            file: "05_habit_3.myc",
            diag: "error [E0211]: `Double` is Swift — Mycel's decimal type is `Float`\n  --> 05_habit_3.myc:1:9\n  |\n1 | let pi: Double = 3.14\n  |         ^^^^^^\n  why: no type named `Double` exists in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0211` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI split-time analyzer",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI args via <code>import env</code>, extracts split times <code>&gt; 60</code> with <code>.extract(Int) { it &gt; 60 }</code>, computes fastest and average, and encodes JSON.",
        starterFile: "05_project_starter.myc",
        starterOut: "lap1 285s lap2 310s lap3 268s",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"laps\":3,\"fastest\":268,\"avgSec\":287.6666666666667}",
        cliTestArgs: ["a 240s b 260s"],
        cliTestOut: "{\"laps\":2,\"fastest\":240,\"avgSec\":250}"
      }
    ]
  },
  {
    slug: "csharp",
    name: "C#",
    titleName: "C# developers",
    ext: "cs",
    toolchain: "dotnet",
    pkgManager: "NuGet",
    foreignFlag: null,
    summary: "Keep static types, ??, ?., and LINQ-like pipelines; drop Console.WriteLine, foreach, var-everywhere, and .csproj ceremony.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to C#",
        same: "Top-level statements, static type checking, and interpolated strings feel familiar right away.",
        simpler: "Comments start with <code>#</code> (since <code>//</code> is whole-number floor division), f-strings omit <code>$</code> in favor of <code>f\"...\"</code>, <code>7 / 2</code> is exact <code>3.5</code>, and <code>from math import sqrt</code> imports directly.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.cs",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: null
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Classes, types, and functions",
        same: "Classes, expression-bodied functions (<code>=&gt;</code>), and default parameters map cleanly.",
        simpler: "Types follow a colon in PascalCase (<code>Int</code>, <code>Float</code>, <code>String</code>), <code>let</code> vs <code>var</code> distinguishes immutable vs mutable bindings, and classes get an automatic memberwise initializer without writing a constructor.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.cs",
        mycOut: "Notebook: 13.50\nafter discount: 12.15",
        otherOut: null
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Lists, dictionaries, brace closures, and .extract()",
        same: "<code>.filter</code>, <code>.map</code>, and <code>.reduce</code> mirror LINQ's <code>.Where</code>, <code>.Select</code>, and <code>.Aggregate</code>.",
        simpler: "Brace closures need no <code>.ToList()</code> materialization (<code>nums.filter { it &gt; 5 }</code>), loops use <code>for (k, v) in stock</code> instead of <code>foreach</code>, and <code>.extract(Int) { it &gt; 5 }</code> replaces <code>Regex.Matches</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.cs",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\npens: 12\npads: 4\n0 true\n[12, 8]",
        otherOut: null
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "Nullable <code>Int?</code> and <code>??</code> work like C#'s nullable value types.",
        simpler: "<code>if let</code> unwraps optionals cleanly, <code>Result&lt;T, E&gt;</code> with <code>?</code> replaces <code>out</code>-parameter <code>TryParse</code> patterns, imports use plain names (<code>import http</code>, <code>import json</code>), and <code>ply install tensor</code> adds Mycel packages with <code>ply.json</code> instead of NuGet/<code>.csproj</code>.",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.cs",
        mycOut: "0\nOk(12) Err(\"not a number: abc\")\n200 {\"total\":18}",
        otherOut: null
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "C# habits to watch + mini CLI project",
        habits: [
          {
            label: "foreach instead of for",
            file: "05_habit_1.myc",
            diag: "error [E0101]: `foreach` — Mycel writes `for item in items { ... }`\n  --> 05_habit_1.myc:1:1\n  |\n1 | foreach x in [1, 2, 3] {\n  | ^^^^^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "lowercase string type",
            file: "05_habit_2.myc",
            diag: "error [E0211]: `string` — Mycel writes `String`\n  --> 05_habit_2.myc:1:11\n  |\n1 | let name: string = \"Ada\"\n  |           ^^^^^^\n  why: no type named `string` exists in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0211` explains this error with an example"
          },
          {
            label: "null instead of nil",
            file: "05_habit_3.myc",
            diag: "error [E0352]: `null` is JavaScript/Java — Mycel writes `nil`\n  --> 05_habit_3.myc:1:9\n  |\n1 | let x = null\n  |         ^^^^\n  why: `null` is not defined in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0352` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI invoice quantity parser",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI args via <code>import env</code>, extracts bulk quantities <code>&gt; 5</code> with <code>.extract(Int) { it &gt; 5 }</code>, sums total units with <code>.reduce</code>, and prints JSON.",
        starterFile: "05_project_starter.myc",
        starterOut: "pens:12 notebooks:4 erasers:15",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"items\":2,\"qtys\":[12,15],\"units\":27}",
        cliTestArgs: ["clips:20 tape:10"],
        cliTestOut: "{\"items\":2,\"qtys\":[20,10],\"units\":30}"
      }
    ]
  },
  {
    slug: "cpp",
    name: "C++",
    titleName: "C++ developers",
    ext: "cpp",
    toolchain: "clang++",
    pkgManager: "vcpkg / CMake",
    foreignFlag: null,
    summary: "Keep value-semantic structs and static types; leave behind headers, ::, manual memory/iterators, and CMake boilerplate.",
    parts: [
      {
        num: 1,
        id: "part-1-hello",
        title: "Hello and how Mycel feels compared to C++",
        same: "Static types, deterministic value-type structs, and fast standalone CLI runs.",
        simpler: "No <code>#include</code> headers, <code>int main()</code>, or <code>std::cout &lt;&lt;</code> chains; comments start with <code>#</code> (since <code>//</code> is floor division), <code>7 / 2</code> is exact <code>3.5</code>, and <code>from math import sqrt</code> imports directly.",
        mycFile: "01_hello.myc",
        otherFile: "01_hello.cpp",
        mycOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3, negDiv=-4, negMod=2",
        otherOut: "Hello, Ada! sqrt(25)=5.0\nexact=3.5, whole=3"
      },
      {
        num: 2,
        id: "part-2-basics",
        title: "Structs, variables, and functions",
        same: "<code>struct</code> gives clean value semantics and methods without pointer indirection.",
        simpler: "<code>let</code> (immutable) replaces <code>const</code>, <code>var</code> marks mutable values, types use <code>Int</code> and <code>Float</code> after a colon, and there are no header/source splits or raw pointers.",
        mycFile: "02_basics.myc",
        otherFile: "02_basics.cpp",
        mycOut: "1 5.0",
        otherOut: "1 5.0"
      },
      {
        num: 3,
        id: "part-3-collections",
        title: "Vectors, maps, brace closures, and .extract()",
        same: "Structured bindings in loops (<code>for (k, v) in sensors</code>) match C++17 range-based <code>for</code>.",
        simpler: "Write <code>nums.filter { it &gt; 5 }</code> and <code>.reduce(0) { (a, b) =&gt; a + b }</code> instead of <code>begin()/end()</code> iterator pairs, and use <code>.extract(Int) { it &gt; 5 }</code> instead of <code>std::regex</code> + <code>std::sregex_iterator</code>.",
        mycFile: "03_collections.myc",
        otherFile: "03_collections.cpp",
        mycOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\ntemp=24\nvolt=12\n0 true\n[12, 88]",
        otherOut: "total=23\ntemp=24\nvolt=12\nreadings=2"
      },
      {
        num: 4,
        id: "part-4-errors-packages",
        title: "Optionals, Result/?, and imports / ply",
        same: "<code>Int?</code> with <code>??</code> gives the safety of <code>std::optional</code> without verbose <code>.value_or(...)</code> calls.",
        simpler: "<code>Result&lt;T, E&gt;</code> with <code>?</code> handles errors without exceptions or <code>std::stoi</code> partial-parse traps. Standard modules use plain names (<code>import http</code>, <code>import json</code>), and <code>ply install tensor</code> adds libraries in one command instead of CMake + vcpkg.",
        mycFile: "04_errors_imports.myc",
        otherFile: "04_errors_imports.cpp",
        mycOut: "-1\nOk(42) Err(\"bad reading: err\")\n200 {\"sum\":6}",
        otherOut: "-1\n42\nerr: stoi: no conversion"
      },
      {
        num: 5,
        id: "part-5-habits-project",
        title: "C++ habits to watch + mini CLI project",
        habits: [
          {
            label: ":: scope resolution",
            file: "05_habit_1.myc",
            diag: "error [E0100]: `::` is Rust/C++ — Mycel writes `.` (`String.from`, `Color.Red`)\n  --> 05_habit_1.myc:1:4\n  |\n1 | std::cout << \"hi\"\n  |    ^\n  why: statements are separated by a newline or `;`\n  fix: put the next statement on its own line\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0100` explains this error with an example"
          },
          {
            label: "C-style int declaration",
            file: "05_habit_2.myc",
            diag: "error [E0101]: `int` is Java/C — Mycel writes `let x: Int = 5` (or just `let x = 5`)\n  --> 05_habit_2.myc:1:1\n  |\n1 | int x = 5;\n  | ^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example"
          },
          {
            label: "NULL instead of nil",
            file: "05_habit_3.myc",
            diag: "error [E0352]: `NULL` is C — Mycel writes `nil`\n  --> 05_habit_3.myc:1:9\n  |\n1 | let x = NULL\n  |         ^^^^\n  why: `NULL` is not defined in Mycel\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0352` explains this error with an example"
          }
        ],
        projectTitle: "Mini project: CLI sensor reading filter",
        projectPrompt: "Finish <code>05_project_starter.myc</code> so it reads CLI args via <code>import env</code>, extracts sensor readings <code>&gt; 5</code> with <code>.extract(Int) { it &gt; 5 }</code>, computes average and peak, and outputs JSON.",
        starterFile: "05_project_starter.myc",
        starterOut: "s1:4 s2:18 s3:74 s4:29",
        solutionFile: "05_project_solution.myc",
        solutionOut: "{\"count\":3,\"values\":[18,74,29],\"avg\":40.333333333333336,\"peak\":74}",
        cliTestArgs: ["a:2 b:50 c:100"],
        cliTestOut: "{\"count\":2,\"values\":[50,100],\"avg\":75,\"peak\":100}"
      }
    ]
  }
];
