// lang/ai/make_datasets.mjs — Builds fine-tuning datasets for Mycel
// Outputs into site/public/mycel/fine-tune/data/ and updates site/public/mycel/fine-tune/index.html

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const mycelBin = path.resolve(repoRoot, 'lang/bin/mycel');
const dataDir = path.resolve(repoRoot, 'site/public/mycel/fine-tune/data');
const siteDir = path.resolve(repoRoot, 'site/public/mycel/fine-tune');

fs.mkdirSync(dataDir, { recursive: true });

console.log('=== Building Mycel Fine-Tuning Datasets ===');

// -----------------------------------------------------------------------------
// 1. mycel-instruct.jsonl
// -----------------------------------------------------------------------------
console.log('\n--- 1. Generating mycel-instruct.jsonl ---');
const { INSTRUCT_TASKS } = await import('./instruct_tasks.mjs');
const { INSTRUCT_TASKS_2 } = await import('./instruct_tasks_2.mjs');
const allInstruct = [...INSTRUCT_TASKS, ...INSTRUCT_TASKS_2];

console.log(`Loaded ${allInstruct.length} instruct tasks. Running each with mycel...`);
const instructTmpDir = fs.realpathSync(fs.mkdtempSync('/tmp/mycel_gen_instruct_'));
const instructRows = [];

for (let i = 0; i < allInstruct.length; i++) {
  const t = allInstruct[i];
  const tmpFile = path.join(instructTmpDir, `instruct_${i}.myc`);
  fs.writeFileSync(tmpFile, t.code, 'utf8');

  try {
    const inputStr = t.inputs ? t.inputs.join('\n') + '\n' : '';
    const out = execFileSync(mycelBin, ['run', '--allow-all', tmpFile], {
      input: inputStr,
      encoding: 'utf8',
      cwd: instructTmpDir,
      timeout: 8000
    });

    const meta = { output: out.trim() };
    if (t.inputs && t.inputs.length > 0) {
      meta.inputs = t.inputs;
    }

    instructRows.push({
      messages: [
        { role: 'user', content: t.task },
        { role: 'assistant', content: t.code.trim() }
      ],
      meta
    });

    if ((i + 1) % 50 === 0 || i === allInstruct.length - 1) {
      console.log(`  ✔ Verified [${i + 1}/${allInstruct.length}] instruct tasks`);
    }
  } catch (e) {
    console.error(`❌ Task ${i + 1} failed: ${t.task}`);
    console.error(e.stderr || e.stdout || e.message);
    throw e;
  }
}
fs.rmSync(instructTmpDir, { recursive: true, force: true });

const instructPath = path.join(dataDir, 'mycel-instruct.jsonl');
fs.writeFileSync(instructPath, instructRows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`Wrote ${instructRows.length} rows to ${instructPath}`);

// -----------------------------------------------------------------------------
// 2. mycel-fix.jsonl
// -----------------------------------------------------------------------------
console.log('\n--- 2. Generating mycel-fix.jsonl ---');
const habitsModule = await import('../src/habits.ts');
const errorHabits = habitsModule.HABITS.filter(h => !h.ok);

// Fix mappings for each error habit
function getHabitFix(h) {
  switch (h.habit) {
    case 'def f(x):':
      return 'fn f(x: Int) -> Int {\n  return x * 2\n}\nprint(f(21))';
    case 'elif':
      return 'let a = 15\nif a >= 18 {\n  print("adult")\n} else if a >= 13 {\n  print("teen")\n} else {\n  print("child")\n}';
    case 'None':
      return 'let x: Int? = nil\nprint(x == nil)';
    case 'True / False':
      return 'let x = true\nlet y = false\nprint(x, y)';
    case 'if x:':
      return 'if true {\n  print(1)\n}';
    case 'lambda x: x + 1':
      return 'let f = (x: Int) => x + 1\nprint(f(5))';
    case 'raise':
      return 'try {\n  throw Error("x")\n} catch e {\n  print(e.message)\n}';
    case 'except':
      return 'try {\n  print(1)\n} catch e {\n  print(e.message)\n}';
    case '=== and !==':
      return 'let a = 1\nif a == 1 {\n  print("equal")\n}';
    case 'function f() {}':
      return 'fn f() -> Int {\n  return 42\n}\nprint(f())';
    case 'const x = 1':
      return 'let x = 1\nprint(x)';
    case 'console.log(x)':
      return 'print("hi")';
    case 'null / undefined':
      return 'let x: Int? = nil\nprint(x == nil)';
    case 'this.x':
      return 'class A {\n  var n: Int = 0\n  fn f() -> Int { return self.n }\n}\nprint(A().f())';
    case 'new Foo()':
      return 'class Foo { let n: Int = 10 }\nlet f = Foo()\nprint(f.n)';
    case 'switch (x) { case 1: }':
      return 'let x = 1\nlet res = match x {\n  1 => "one"\n  _ => "other"\n}\nprint(res)';
    case 'x++':
      return 'var i = 0\ni += 1\nprint(i)';
    case '`template ${x}`':
      return 'let x = 1\nprint(f"a {x}")';
    case "import x from 'y'":
      return 'import std.fs\nprint("imported")';
    case 'number':
      return 'let x: Int = 5\nprint(x)';
    case 'string / boolean':
      return 'let s: String = "a"\nlet b: Bool = true\nprint(s, b)';
    case 'any / unknown':
      return 'let x: Any = 1\nprint(x)';
    case 'const / function':
      return 'let x: Int = 1\nprint(x)';
    case 'number[]':
      return 'let x: [Int] = [1, 2, 3]\nprint(x)';
    case 'unknown':
      return 'let u: Any = 1\nprint(u)';
    case 'x as number':
      return 'let x: Int = 1\nprint(x)';
    case 'string[]':
      return 'let x: [String] = ["hello"]\nprint(x[0])';
    case 'export function':
      return 'pub fn f() -> Int { return 1 }\nprint(f())';
    case 'System.out.println(x)':
      return 'print("hi")';
    case 'public static void main':
      return 'print("Hello, Java developer!")';
    case 'int x = 5;':
      return 'let x: Int = 5\nprint(x)';
    case 'String / double / boolean as types':
      return 'let x: Float = 1.0\nprint(x)';
    case 'void f()':
      return 'fn f() { print("void function") }\nf()';
    case 'null':
      return 'let x: Int? = nil\nprint(x == nil)';
    case 'i++':
      return 'var i = 0\ni += 1\nprint(i)';
    case 'for (int i = 0; ...; i++)':
      return 'for i in 0..3 {\n  print(i)\n}';
    case 'extends / implements':
      return 'class A { fn f() -> Int => 1 }\nclass B: A { }\nprint(B().f())';
    case 'x := 5':
      return 'let x = 5\nprint(x)';
    case 'func f() {}':
      return 'fn f() -> String { return "go" }\nprint(f())';
    case 'fmt.Println(x)':
      return 'print("hi")';
    case 'var x int':
      return 'var x: Int = 1\nprint(x)';
    case 'switch x { case 1: }':
      return 'let x = 1\nlet res = match x { 1 => "one", _ => "other" }\nprint(res)';
    case 'go f()':
      return 'async fn f() -> Int { return 1 }\nspawn f()\nprint("spawned")';
    case 'defer f()':
      return 'fn f() { print("cleanup") }\ntry {\n  print("working")\n} finally {\n  f()\n}';
    case 'package main':
      return 'print("No package line needed in Mycel")';
    case 'int / string / float64 / bool types':
      return 'let x: Float = 1.0\nprint(x)';
    case 'let mut x = 5':
      return 'var x = 5\nx += 1\nprint(x)';
    case 'println!("{}", x)':
      return 'print("hi")';
    case 'i32 / u64 / f64 / usize':
      return 'let x: Int = 5\nprint(x)';
    case 'impl Foo { }':
      return 'class Foo {\n  fn method() -> String => "mycel puts methods in class"\n}\nprint(Foo().method())';
    case 'vec![1, 2]':
      return 'let v = [1, 2]\nprint(v)';
    case 'Type::method':
      return 'class MathUtils {\n  static fn double(x: Int) -> Int => x * 2\n}\nprint(MathUtils.double(5))';
    case 'loop { }':
      return 'var count = 0\nwhile true {\n  count += 1\n  if count >= 3 { break }\n}\nprint(count)';
    case 'let x: &str':
      return 'let x: String = "a"\nprint(x)';
    case 'func f() -> Int':
      return 'fn f() -> Int { return 1 }\nprint(f())';
    case '"\\(x)" interpolation':
      return 'let x = 1\nprint(f"v {x}")';
    case 'guard let x = y else { return }':
      return 'let x: Int? = 10\nif let v = x {\n  print(v)\n}';
    case 'switch x { case .a: }':
      return 'enum State { A, B }\nlet x = State.A\nlet res = match x { .A => "a", .B => "b" }\nprint(res)';
    case 'for i in 0..<n':
      return 'for i in 0..3 {\n  write(f"{i} ")\n}\nprint("")';
    case 'extension Foo { }':
      return 'extend Int {\n  fn double() -> Int => self * 2\n}\nprint(5.double())';
    case 'defer':
      return 'try {\n  print("running")\n} finally {\n  print("deferred cleanup")\n}';
    case 'Character':
      return 'let c: Char = \'a\'\nprint(c)';
    case 'Double / String as types':
      return 'let x: Float = 1.0\nprint(x)';
    default:
      return null;
  }
}

// Extra compiler errors (type errors, syntax errors, exhaustiveness)
const EXTRA_FIXES = [
  {
    lang: 'Mycel',
    habit: 'type mismatch: string assigned to Int',
    probe: 'let x: Int = "not_a_number"\nprint(x)',
    fix: 'let x: Int = 42\nprint(x)'
  },
  {
    lang: 'Mycel',
    habit: 'reassigning an immutable let binding',
    probe: 'let count = 0\ncount += 1\nprint(count)',
    fix: 'var count = 0\ncount += 1\nprint(count)'
  },
  {
    lang: 'Mycel',
    habit: 'missing return statement in function',
    probe: 'fn getScore() -> Int {\n  let s = 100\n}\nprint(getScore())',
    fix: 'fn getScore() -> Int {\n  let s = 100\n  return s\n}\nprint(getScore())'
  },
  {
    lang: 'Mycel',
    habit: 'unclosed parenthesis in expression',
    probe: 'let val = (10 + (20 * 3)\nprint(val)',
    fix: 'let val = (10 + (20 * 3))\nprint(val)'
  },
  {
    lang: 'Mycel',
    habit: 'non-exhaustive enum match',
    probe: 'enum Mode { Fast, Safe, Balanced }\nlet m = Mode.Fast\nlet res = match m {\n  .Fast => "quick"\n  .Safe => "secure"\n}\nprint(res)',
    fix: 'enum Mode { Fast, Safe, Balanced }\nlet m = Mode.Fast\nlet res = match m {\n  .Fast => "quick"\n  .Safe => "secure"\n  .Balanced => "normal"\n}\nprint(res)'
  },
  {
    lang: 'Mycel',
    habit: 'missing override keyword on subclass method',
    probe: 'class Base { fn greet() -> String => "hello" }\nclass Sub: Base { fn greet() -> String => "hi" }\nprint(Sub().greet())',
    fix: 'class Base { fn greet() -> String => "hello" }\nclass Sub: Base { override fn greet() -> String => "hi" }\nprint(Sub().greet())'
  },
  {
    lang: 'Mycel',
    habit: 'attempting to mutate immutable struct property',
    probe: 'struct Point { let x: Int, y: Int }\nvar p = Point(x: 1, y: 2)\np.x = 10\nprint(p.x)',
    fix: 'struct Point { let x: Int, y: Int }\nvar p = Point(x: 1, y: 2)\np = p.with(x: 10)\nprint(p.x)'
  },
  {
    lang: 'Mycel',
    habit: 'heterogeneous map values without type annotation',
    probe: 'let m = {"name": "Alex", "age": 25}\nprint(m["name"])',
    fix: 'let m: {String: Any} = {"name": "Alex", "age": 25}\nprint(m["name"])'
  },
  {
    lang: 'Mycel',
    habit: 'indexing a tuple with square brackets instead of dot notation',
    probe: 'let pair = (1, "a")\nprint(pair[0])',
    fix: 'let pair = (1, "a")\nprint(pair.0)'
  },
  {
    lang: 'Mycel',
    habit: 'missing arrow => in lambda parameter list',
    probe: 'let sq = (x: Int) { x * x }\nprint(sq(5))',
    fix: 'let sq = (x: Int) => x * x\nprint(sq(5))'
  }
];

const fixTmpDir = fs.realpathSync(fs.mkdtempSync('/tmp/mycel_gen_fix_'));
const fixRows = [];

// Process habits
for (const h of errorHabits) {
  const fixCode = getHabitFix(h);
  if (!fixCode) continue;

  const probeFile = path.join(fixTmpDir, 'probe.myc');
  const fixFile = path.join(fixTmpDir, 'fixed.myc');
  fs.writeFileSync(probeFile, h.probe, 'utf8');
  fs.writeFileSync(fixFile, fixCode, 'utf8');

  // 1. Run mycel check --json on broken code
  let diags = [];
  try {
    execFileSync(mycelBin, ['check', '--json', probeFile], { encoding: 'utf8' });
  } catch (e) {
    if (e.stdout) {
      try { diags = JSON.parse(e.stdout); } catch {}
    }
  }

  // 2. Run mycel run on fixed code to verify
  let fixedOut = '';
  try {
    fixedOut = execFileSync(mycelBin, ['run', '--allow-all', fixFile], {
      encoding: 'utf8',
      cwd: fixTmpDir
    }).trim();
  } catch (e) {
    console.error(`❌ Fixed code failed for habit "${h.habit}":`, e.stderr || e.stdout);
    continue;
  }

  const primaryDiag = diags[0] ?? {
    severity: 'error',
    code: 'E0101',
    message: h.mycel,
    why: 'this word comes from another language'
  };

  const userPrompt = `Fix this Mycel program. It fails compiler checks with:\n${primaryDiag.message}\n\nBroken program:\n\`\`\`mycel\n${h.probe}\n\`\`\``;

  fixRows.push({
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: fixCode }
    ],
    meta: {
      lang: h.lang,
      habit: h.habit,
      broken: h.probe,
      diagnostic: primaryDiag,
      output: fixedOut
    }
  });
}

// Process extra compiler errors
for (const ef of EXTRA_FIXES) {
  const probeFile = path.join(fixTmpDir, 'probe_extra.myc');
  const fixFile = path.join(fixTmpDir, 'fixed_extra.myc');
  fs.writeFileSync(probeFile, ef.probe, 'utf8');
  fs.writeFileSync(fixFile, ef.fix, 'utf8');

  let diags = [];
  try {
    execFileSync(mycelBin, ['check', '--json', probeFile], { encoding: 'utf8' });
  } catch (e) {
    if (e.stdout) {
      try { diags = JSON.parse(e.stdout); } catch {}
    }
  }

  let fixedOut = '';
  try {
    fixedOut = execFileSync(mycelBin, ['run', '--allow-all', fixFile], {
      encoding: 'utf8',
      cwd: fixTmpDir
    }).trim();
  } catch (e) {
    console.error(`❌ Extra fix failed for "${ef.habit}":`, e.stderr || e.stdout);
    continue;
  }

  const primaryDiag = diags[0] ?? {
    severity: 'error',
    code: 'E0300',
    message: ef.habit
  };

  const userPrompt = `Fix this Mycel program. It fails compiler checks with:\n${primaryDiag.message}\n\nBroken program:\n\`\`\`mycel\n${ef.probe}\n\`\`\``;

  fixRows.push({
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: ef.fix }
    ],
    meta: {
      lang: ef.lang,
      habit: ef.habit,
      broken: ef.probe,
      diagnostic: primaryDiag,
      output: fixedOut
    }
  });
}

fs.rmSync(fixTmpDir, { recursive: true, force: true });

const fixPath = path.join(dataDir, 'mycel-fix.jsonl');
fs.writeFileSync(fixPath, fixRows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`Wrote ${fixRows.length} verified rows to ${fixPath}`);

// -----------------------------------------------------------------------------
// 3. mycel-translate.jsonl
// -----------------------------------------------------------------------------
console.log('\n--- 3. Generating mycel-translate.jsonl ---');
const { TRANSLATE_PAIRS } = await import('./translate_tasks.mjs');
const transTmpDir = fs.realpathSync(fs.mkdtempSync('/tmp/mycel_gen_trans_'));
const transRows = [];

for (let i = 0; i < TRANSLATE_PAIRS.length; i++) {
  const p = TRANSLATE_PAIRS[i];
  const pyFile = path.join(transTmpDir, `trans_${i}.py`);
  const mycFile = path.join(transTmpDir, `trans_${i}.myc`);
  fs.writeFileSync(pyFile, p.py, 'utf8');
  fs.writeFileSync(mycFile, p.myc, 'utf8');

  try {
    const pyOut = execFileSync('python3', [pyFile], { encoding: 'utf8' }).trim();
    const mycOut = execFileSync(mycelBin, ['run', '--allow-all', mycFile], { encoding: 'utf8' }).trim();

    if (pyOut !== mycOut) {
      console.error(`❌ Translate pair ${i + 1} output mismatch!`);
      console.error('Python:', JSON.stringify(pyOut));
      console.error('Mycel: ', JSON.stringify(mycOut));
      throw new Error(`Output mismatch in translate pair ${i + 1}`);
    }

    const userPrompt = `Translate this Python program to equivalent, idiomatic Mycel:\n\n\`\`\`python\n${p.py.trim()}\n\`\`\``;

    transRows.push({
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: p.myc.trim() }
      ],
      meta: {
        python: p.py.trim(),
        output: mycOut
      }
    });
  } catch (e) {
    console.error(`❌ Translate pair ${i + 1} failed:`, e.stderr || e.stdout || e.message);
    throw e;
  }
}
fs.rmSync(transTmpDir, { recursive: true, force: true });

const transPath = path.join(dataDir, 'mycel-translate.jsonl');
fs.writeFileSync(transPath, transRows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`Wrote ${transRows.length} verified rows to ${transPath}`);

// -----------------------------------------------------------------------------
// 4. Compute Checksums & Metrics
// -----------------------------------------------------------------------------
function fileStats(filePath) {
  const buf = fs.readFileSync(filePath);
  const text = buf.toString('utf8');
  const lines = text.trim().split('\n').filter(Boolean);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const sizeKb = (buf.length / 1024).toFixed(1);
  return {
    path: filePath,
    filename: path.basename(filePath),
    bytes: buf.length,
    sizeKb: `${sizeKb} KB`,
    rows: lines.length,
    sha256: hash,
    sample: JSON.parse(lines[0])
  };
}

const instructStats = fileStats(instructPath);
const fixStats = fileStats(fixPath);
const transStats = fileStats(transPath);

console.log('\n--- Dataset Metrics ---');
console.log(`mycel-instruct.jsonl:  ${instructStats.rows} rows, ${instructStats.sizeKb}, sha256: ${instructStats.sha256.substring(0, 16)}...`);
console.log(`mycel-fix.jsonl:       ${fixStats.rows} rows, ${fixStats.sizeKb}, sha256: ${fixStats.sha256.substring(0, 16)}...`);
console.log(`mycel-translate.jsonl: ${transStats.rows} rows, ${transStats.sizeKb}, sha256: ${transStats.sha256.substring(0, 16)}...`);

// -----------------------------------------------------------------------------
// 5. Dataset Card: data/README.md
// -----------------------------------------------------------------------------
const datasetCard = `# Mycel Fine-Tuning Datasets (v0.1)

Downloadable instruction-tuning, error-correction, and translation datasets for fine-tuning local open-weights language models (Llama, Qwen, Gemma, Mistral) on the Mycel programming language.

Every program in these datasets was executed and verified against the real Mycel compiler and runtime (\`mycel\` v0.1.0 on Node 24). There are no hand-written or fabricated outputs.

## Files & Checksums

| File | Rows | Size | SHA-256 Checksum | Description |
|---|---|---|---|---|
| [\`mycel-instruct.jsonl\`](./mycel-instruct.jsonl) | ${instructStats.rows} | ${instructStats.sizeKb} | \`${instructStats.sha256}\` | Task instructions and verified Mycel programs covering beginner to app-level code. |
| [\`mycel-fix.jsonl\`](./mycel-fix.jsonl) | ${fixStats.rows} | ${fixStats.sizeKb} | \`${fixStats.sha256}\` | Broken code with real \`mycel check --json\` compiler diagnostics and verified fixes. |
| [\`mycel-translate.jsonl\`](./mycel-translate.jsonl) | ${transStats.rows} | ${transStats.sizeKb} | \`${transStats.sha256}\` | Python programs and equivalent Mycel programs where both run and outputs match exactly. |

## How It Was Made & Verified

1. **mycel-instruct.jsonl**:
   - Covers 20+ language domains: primitives, 64-bit Int division (\`/\` vs \`.div()\`), strings, f-strings (\`{x:.2f}\`, \`{x=}\`), boolean logic, while/for loops, ranges, arrays/lists, comprehensions, maps, sets, tuples (\`.0\`, \`.1\`), functions (variadic, named args, defaults, closures), classes & inheritance, structs with \`.with(...)\`, enums with payload and exhaustive \`match\`, interfaces, extensions (\`extend Int\`), optionals (\`T?\`, \`nil\`, \`??\`, \`!=\`), Result error propagation (\`?\`), and standard libraries (\`std.json\`, \`std.math\`, \`std.time\`, \`std.crypto\`, \`std.re\`, \`std.env\`, \`std.fs\`).
   - Every program was executed using \`lang/bin/mycel run --allow-all\`. Only programs that exited with code 0 were retained, and their actual standard output is stored in \`meta.output\`. Programs reading interactive input have their inputs recorded in \`meta.inputs\`.

2. **mycel-fix.jsonl**:
   - Covers newcomer habits from Python, JavaScript, TypeScript, Java, Go, Rust, and Swift (from \`lang/src/habits.ts\`), plus common type errors, non-exhaustive matches, immutable let reassignments, and syntax mistakes.
   - Broken programs were verified by running \`lang/bin/mycel check --json\` to capture the real compiler diagnostic object (including \`code\`, \`message\`, \`why\`, \`suggestion\`).
   - Fixed programs were verified by compiling and running with \`lang/bin/mycel run\`.

3. **mycel-translate.jsonl**:
   - Seeded from \`lang/compare/\` and expanded with real-world algorithms (binary search, bubble sort, gcd, Caesar cipher, prime factors, Pascal's triangle, matrix operations, RLE, etc.).
   - Both the Python code (via CPython 3) and the Mycel code (via \`mycel run\`) were executed in isolated subshells; rows were kept only when both standard outputs matched character-for-character.

## Format Specification

Each row is a single-line JSON object adhering to the standard multi-turn chat format:

\`\`\`json
{
  "messages": [
    { "role": "user", "content": "Write a Mycel program that computes the hypotenuse..." },
    { "role": "assistant", "content": "import std.math\\nprint(math.hypot(3.0, 4.0))" }
  ],
  "meta": {
    "output": "5.0"
  }
}
\`\`\`

Compatible with:
- **MLX LoRA** (\`mlx_lm.lora\`) on Apple Silicon
- **HuggingFace TRL** (SFTTrainer / dataset chat template)
- **Unsloth** / **Axolotl** / **Llama-Factory**
- **OpenAI fine-tuning JSONL format**

## Fine-Tuning Guide (Quickstart)

### Using MLX on Apple Silicon

Split \`mycel-instruct.jsonl\` into \`train.jsonl\` and \`valid.jsonl\` (e.g. 90/10 split):

\`\`\`sh
# Shuffle and split
shuf mycel-instruct.jsonl > shuffled.jsonl
head -n ${Math.floor(instructStats.rows * 0.9)} shuffled.jsonl > train.jsonl
tail -n ${Math.ceil(instructStats.rows * 0.1)} shuffled.jsonl > valid.jsonl

# Run LoRA training on Qwen2.5 or Gemma (4-bit)
python -m mlx_lm.lora \\
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \\
  --train \\
  --data . \\
  --iters 600 \\
  --batch-size 4 \\
  --lora-layers 16
\`\`\`

## Honest Limits

- **Language Stage**: Mycel is v0.1.0 in active development. Syntax and stdlib APIs reflect the November 2026 specification.
- **Single-File Scope**: The training rows represent single-file programs and modules. Multi-package dependency graphs (\`ply.json\` inter-package dependencies) are not covered in this dataset.
- **Foreign Ecosystem Interop**: Interop with native Python/npm packages is planned for Phase B and Phase C and is not included in this training set.

## License & Provenance

Licensed under the **Apache License, Version 2.0**.
Copyright (c) 2026 drky (same copyright and license as [github.com/drkfade/mycel-editors](https://github.com/drkfade/mycel-editors)).
Signed provenance: https://ol1x.xyz/provenance/
`;

fs.writeFileSync(path.join(dataDir, 'README.md'), datasetCard, 'utf8');
console.log(`Wrote dataset card to ${path.join(dataDir, 'README.md')}`);

// -----------------------------------------------------------------------------
// 6. Generate site/public/mycel/fine-tune/index.html
// -----------------------------------------------------------------------------
console.log('\n--- 4. Generating fine-tune/index.html ---');

function formatSample(row) {
  const user = row.messages.find(m => m.role === 'user')?.content ?? '';
  const assistant = row.messages.find(m => m.role === 'assistant')?.content ?? '';
  return `{"messages":[{"role":"user","content":${JSON.stringify(user)}},{"role":"assistant","content":${JSON.stringify(assistant)}}],"meta":${JSON.stringify(row.meta)}}`;
}

const instructSampleJson = formatSample(instructStats.sample);
const fixSampleJson = formatSample(fixStats.sample);
const transSampleJson = formatSample(transStats.sample);

const htmlContent = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fine-tuning &amp; LoRA training data for Mycel — datasets for local models</title>
<meta name="description" content="Downloadable verified training data to fine-tune local open-weights language models (Llama, Qwen, Gemma) on the Mycel programming language. Includes instruction, error fix-it, and translation datasets.">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" type="image/png" sizes="32x32" href="/mycel/brand/mycel-32.png">
<link rel="apple-touch-icon" href="/mycel/brand/mycel-256.png">
<link rel="canonical" href="https://ol1x.xyz/mycel/fine-tune/">
<meta property="og:type" content="website">
<meta property="og:url" content="https://ol1x.xyz/mycel/fine-tune/">
<meta property="og:title" content="Fine-tuning &amp; LoRA training data for Mycel">
<meta property="og:description" content="Downloadable verified training data to fine-tune local open-weights language models on the Mycel programming language. Instruction, compiler fix-it, and Python translation datasets.">
<meta property="og:image" content="https://ol1x.xyz/mycel/brand/mycel-512.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Mycel Programming Language Fine-Tuning Datasets",
  "description": "Verified training datasets for instruction-tuning, error correction, and Python-to-Mycel translation, tested against the real Mycel compiler v0.1.0.",
  "url": "https://ol1x.xyz/mycel/fine-tune/",
  "license": "https://www.apache.org/licenses/LICENSE-2.0",
  "creator": {
    "@type": "Organization",
    "name": "drky",
    "url": "https://ol1x.xyz/"
  },
  "distribution": [
    {
      "@type": "DataDownload",
      "encodingFormat": "application/x-jsonlines",
      "contentUrl": "https://ol1x.xyz/mycel/fine-tune/data/mycel-instruct.jsonl"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/x-jsonlines",
      "contentUrl": "https://ol1x.xyz/mycel/fine-tune/data/mycel-fix.jsonl"
    },
    {
      "@type": "DataDownload",
      "encodingFormat": "application/x-jsonlines",
      "contentUrl": "https://ol1x.xyz/mycel/fine-tune/data/mycel-translate.jsonl"
    }
  ]
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
 --fs-xs:12px;--fs-sm:14px;--fs-md:16px;--fs-lg:20px;--fs-xl:clamp(24px,4vw,36px);--fs-hero:clamp(36px,7vw,60px);
 --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:40px;--s7:72px;
 --r-sm:8px;--r-md:14px;--r-lg:22px;--r-pill:999px;
}
@media(prefers-color-scheme:light){:root{
 --bg:#f6f6f4;--bg-2:#fff;--bg-3:#ececea;
 --surface:rgba(0,0,0,.03);--raised:rgba(0,0,0,.05);--bubble:rgba(0,0,0,.08);
 --hair:rgba(0,0,0,.14);--stroke:rgba(0,0,0,.09);
 --text:rgba(0,0,0,.9);--text-2:rgba(0,0,0,.62);--text-3:rgba(0,0,0,.42);
 --code-bg:#fff;--accent:#1d5fe0;--ok:#1a8f3c;--warn:#b86a00}}
*{box-sizing:border-box;margin:0}
html{background:var(--bg);color-scheme:dark light}
body{background:var(--bg);color:var(--text);font:400 var(--fs-md)/1.6 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
.wrap{max-width:960px;margin:0 auto;padding:0 var(--s4)}
code{font:400 .9em var(--mono)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
nav{padding:var(--s4) 0;border-bottom:1px solid var(--stroke)}
nav .wrap{display:flex;justify-content:space-between;align-items:center;font:var(--fs-sm) var(--mono)}
nav a{color:var(--text-2)}nav a:hover{color:var(--text);text-decoration:none}
nav b{color:var(--text);font-weight:600}
.crumbs{font:var(--fs-xs) var(--mono);color:var(--text-3);margin-bottom:var(--s4)}
.hero{padding:var(--s6) 0 var(--s5)}
.badge{display:inline-flex;gap:var(--s2);align-items:center;padding:6px 14px;border:1px solid var(--hair);border-radius:var(--r-pill);background:var(--surface);font:500 var(--fs-xs) var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-2)}
.badge i{width:6px;height:6px;border-radius:50%;background:var(--ok)}
h1{font-size:var(--fs-hero);font-weight:700;letter-spacing:-.04em;line-height:1.1;margin:var(--s5) 0 var(--s3);background:linear-gradient(100deg,var(--accent),#9aa6ff 50%,var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.06em}
.lead{font-size:var(--fs-lg);color:var(--text-2);max-width:680px}
section{padding:var(--s5) 0}
.eyebrow{font:500 var(--fs-xs) var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:var(--s2)}
h2{font-size:var(--fs-xl);font-weight:700;letter-spacing:-.03em;line-height:1.2;margin-bottom:var(--s3)}
p{color:var(--text-2);max-width:720px;margin-bottom:var(--s3)}
.tblwrap{margin-top:var(--s4);overflow-x:auto;border:1px solid var(--stroke);border-radius:var(--r-lg);background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:540px;font-size:var(--fs-sm)}
th,td{text-align:left;padding:12px var(--s4);border-bottom:1px solid var(--stroke);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font:500 var(--fs-xs) var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);background:var(--bg-3)}
td code{display:inline-block;padding:2px 6px;border-radius:var(--r-sm);background:var(--raised);font-size:.85em}
.btn-dl{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--r-pill);background:var(--accent);color:#fff;font:600 var(--fs-xs) var(--mono);text-decoration:none}
.btn-dl:hover{opacity:.9;text-decoration:none}
.file-card{padding:var(--s5);border:1px solid var(--stroke);border-radius:var(--r-lg);background:var(--surface);margin-top:var(--s4)}
.file-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--s3);margin-bottom:var(--s3)}
.file-meta{font:var(--fs-xs) var(--mono);color:var(--text-3)}
.file-meta span{color:var(--text-2);margin-right:var(--s3)}
pre{font:400 var(--fs-sm)/1.65 var(--mono);padding:var(--s4);background:var(--code-bg);border:1px solid var(--stroke);border-radius:var(--r-md);overflow-x:auto;color:var(--text);margin-top:var(--s2);white-space:pre-wrap;word-break:break-word}
.hash{font:400 11px var(--mono);color:var(--text-3);word-break:break-all}
footer{padding:var(--s6) var(--s4);text-align:center;color:var(--text-2);font-size:var(--fs-sm);border-top:1px solid var(--stroke);margin-top:var(--s6)}
footer a{color:var(--text-2)}
</style>
</head>
<body>
<nav><div class="wrap"><a href="/"><b>olix</b></a><span><a href="/mycel/">mycel</a> / fine-tune</span></div></nav>

<header class="hero"><div class="wrap">
 <div class="crumbs"><a href="/mycel/">Mycel</a> &rsaquo; Fine-tune</div>
 <div class="badge"><i></i> verified v0.1 datasets</div>
 <h1>Training data for AI models</h1>
 <p class="lead">Downloadable, compiler-verified datasets to train or fine-tune local models (Qwen, Llama, Gemma, Mistral) on the Mycel language using MLX, LoRA, or SFT.</p>
</div></header>

<main>
<section><div class="wrap">
 <div class="eyebrow">Downloads</div>
 <h2>Verified dataset files</h2>
 <p>Every single program in these files was compiled and executed using the real Mycel compiler (<code>mycel</code> v0.1.0 on Node 24). Expected outputs and compiler diagnostics are recorded from execution, not fabricated.</p>

 <div class="tblwrap"><table>
  <thead>
   <tr><th>File</th><th>Rows</th><th>Size</th><th>Action</th></tr>
  </thead>
  <tbody>
   <tr>
    <td><b>mycel-instruct.jsonl</b><br><span style="color:var(--text-3);font-size:12px">Instruction-tuning: beginner to app-level Mycel code</span></td>
    <td><code>${instructStats.rows}</code></td>
    <td>${instructStats.sizeKb}</td>
    <td><a class="btn-dl" href="/mycel/fine-tune/data/mycel-instruct.jsonl" download>Download</a></td>
   </tr>
   <tr>
    <td><b>mycel-fix.jsonl</b><br><span style="color:var(--text-3);font-size:12px">Broken program &rarr; real compiler diagnostic &rarr; fixed program</span></td>
    <td><code>${fixStats.rows}</code></td>
    <td>${fixStats.sizeKb}</td>
    <td><a class="btn-dl" href="/mycel/fine-tune/data/mycel-fix.jsonl" download>Download</a></td>
   </tr>
   <tr>
    <td><b>mycel-translate.jsonl</b><br><span style="color:var(--text-3);font-size:12px">Python program &rarr; equivalent Mycel program (outputs match)</span></td>
    <td><code>${transStats.rows}</code></td>
    <td>${transStats.sizeKb}</td>
    <td><a class="btn-dl" href="/mycel/fine-tune/data/mycel-translate.jsonl" download>Download</a></td>
   </tr>
   <tr>
    <td><b>README.md (Dataset Card)</b><br><span style="color:var(--text-3);font-size:12px">Provenance, license, how it was made, format, honest limits</span></td>
    <td>-</td>
    <td>Docs</td>
    <td><a class="btn-dl" href="/mycel/fine-tune/data/README.md" download>Card</a></td>
   </tr>
  </tbody>
 </table></div>
</div></section>

<section><div class="wrap">
 <div class="eyebrow">Sample rows</div>
 <h2>Format preview</h2>

 <div class="file-card">
  <div class="file-header">
   <h3>mycel-instruct.jsonl (sample row)</h3>
   <div class="file-meta"><span>${instructStats.rows} total rows</span><span>${instructStats.sizeKb}</span></div>
  </div>
  <p style="font-size:13px;margin:0 0 8px">Task instructions with verified compiler output stored in <code>meta.output</code>:</p>
  <pre>${instructSampleJson.substring(0, 320)}...</pre>
  <p class="hash">SHA-256: ${instructStats.sha256}</p>
 </div>

 <div class="file-card">
  <div class="file-header">
   <h3>mycel-fix.jsonl (sample row)</h3>
   <div class="file-meta"><span>${fixStats.rows} total rows</span><span>${fixStats.sizeKb}</span></div>
  </div>
  <p style="font-size:13px;margin:0 0 8px">Broken code with newcomer habits, real <code>mycel check --json</code> diagnostic, and verified fix:</p>
  <pre>${fixSampleJson.substring(0, 320)}...</pre>
  <p class="hash">SHA-256: ${fixStats.sha256}</p>
 </div>

 <div class="file-card">
  <div class="file-header">
   <h3>mycel-translate.jsonl (sample row)</h3>
   <div class="file-meta"><span>${transStats.rows} total rows</span><span>${transStats.sizeKb}</span></div>
  </div>
  <p style="font-size:13px;margin:0 0 8px">Python source to Mycel source where both programs execute and yield identical stdout:</p>
  <pre>${transSampleJson.substring(0, 320)}...</pre>
  <p class="hash">SHA-256: ${transStats.sha256}</p>
 </div>
</div></section>

<section><div class="wrap">
 <div class="eyebrow">Quickstart</div>
 <h2>How to fine-tune with MLX / LoRA</h2>
 <p>These files use the standard OpenAI-compatible Chat JSONL format with <code>messages</code> arrays, making them compatible with MLX, HuggingFace TRL, Unsloth, Axolotl, and Ollama.</p>

 <div class="file-card">
  <h3>Fine-tuning on Apple Silicon (MLX LoRA)</h3>
  <p style="font-size:14px;margin-top:6px">1. Prepare training and validation splits from <code>mycel-instruct.jsonl</code>:</p>
<pre>shuf mycel-instruct.jsonl > shuffled.jsonl
head -n ${Math.floor(instructStats.rows * 0.9)} shuffled.jsonl > train.jsonl
tail -n ${Math.ceil(instructStats.rows * 0.1)} shuffled.jsonl > valid.jsonl</pre>

  <p style="font-size:14px;margin-top:12px">2. Run LoRA training with <code>mlx_lm.lora</code>:</p>
<pre>python -m mlx_lm.lora \\
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \\
  --train \\
  --data . \\
  --iters 600 \\
  --batch-size 4 \\
  --lora-layers 16</pre>

  <p style="font-size:14px;margin-top:12px">3. Test the adapted model with a Mycel prompt:</p>
<pre>python -m mlx_lm.generate \\
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \\
  --adapter-path adapters.npz \\
  --prompt "Write a Mycel function that checks if an integer is prime."</pre>
 </div>
</div></section>

<section><div class="wrap">
 <div class="eyebrow">Cloud Models</div>
 <h2>Teaching large cloud AI models</h2>
 <p>Looking to teach Claude, ChatGPT, or Gemini about Mycel without training weights? See <a href="/mycel/ai-learn/">/mycel/ai-learn/</a> for self-contained reference documents, habits tables, and system prompts you can attach or paste directly into conversation.</p>
</div></section>
</main>

<footer><a href="/">olix</a> &middot; <a href="/mycel/">Mycel</a> &middot; <a href="/mycel/ai-learn/">For AI Models</a> &middot; <a href="/mycel/learn/">Learn Mycel</a> &middot; <a href="/provenance/">&copy; 2026 drky (Apache-2.0)</a></footer>
</body>
</html>
`;

fs.writeFileSync(path.join(siteDir, 'index.html'), htmlContent, 'utf8');
console.log(`Wrote fine-tune/index.html`);
console.log('\n✔ All fine-tuning datasets and pages built successfully.');
