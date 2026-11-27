import { Rand } from "./prng";
import { check, run } from "../src/host";
import { format } from "../src/fmt";

export interface GrammarFuzzResult {
  iterations: number;
  programsGenerated: number;
  fmtRoundtripsChecked: number;
  refEvalsChecked: number;
  internalErrors: { code: string; error: string; stack?: string }[];
  fmtFailures: { code: string; error: string }[];
  refEvalMismatches: { code: string; expected: string; got: string }[];
}

export class GrammarGenerator {
  private rand: Rand;

  constructor(seed = 12345) {
    this.rand = new Rand(seed);
  }

  /** Generates a complete valid Mycel program as a string */
  generateProgram(): { source: string; refEval?: { expected: string; expr: string } } {
    const parts: string[] = [];

    // 1. Maybe generate an enum or struct
    if (this.rand.bool(0.6)) {
      parts.push(this.genEnumOrStruct());
    }

    // 2. Maybe generate a class
    if (this.rand.bool(0.5)) {
      parts.push(this.genClass());
    }

    // 3. Maybe generate a helper function
    if (this.rand.bool(0.7)) {
      parts.push(this.genFunction());
    }

    // 4. Main statements
    const stmts: string[] = [];
    const numStmts = this.rand.int(3, 8);
    for (let i = 0; i < numStmts; i++) {
      stmts.push(this.genStatement());
    }

    // 5. Pure arithmetic reference evaluation check
    let refEval: { expected: string; expr: string } | undefined;
    if (this.rand.bool(0.8)) {
      const arith = this.genArithRef();
      stmts.push(`print("REF:", ${arith.code})`);
      refEval = { expr: arith.code, expected: arith.expected };
    }

    const source = parts.concat(stmts).join("\n\n") + "\n";
    return { source, refEval };
  }

  private genEnumOrStruct(): string {
    if (this.rand.bool(0.5)) {
      return `enum Color { Red, Green, Blue, Custom(r: Int, g: Int, b: Int) }`;
    } else {
      return `struct Point { let x: Int, y: Int }`;
    }
  }

  private genClass(): string {
    const name = `Box_${this.rand.int(1, 999)}`;
    return `class ${name} {
  var value: Int
  init(v: Int) {
    self.value = v
  }
  fn getVal() -> Int {
    return self.value
  }
  fn setVal(v: Int) {
    self.value = v
  }
}`;
  }

  private genFunction(): string {
    const name = `calc_${this.rand.int(1, 999)}`;
    const kind = this.rand.int(1, 4);
    switch (kind) {
      case 1:
        return `fn ${name}(n: Int) -> Int {
  if n <= 1 { return 1 }
  return n * ${name}(n - 1)
}`;
      case 2:
        return `fn ${name}(xs: [Int]) -> Int {
  var s = 0
  for x in xs { s += x }
  return s
}`;
      case 3:
        return `fn ${name}(a: Int, b: Int = 10) -> Int => a + b`;
      default:
        return `fn ${name}(msg: String) -> String {
  return f"msg: {msg.upper()}"
}`;
    }
  }

  private genStatement(): string {
    const kind = this.rand.int(1, 8);
    switch (kind) {
      case 1: {
        // Comprehensions
        const op = this.rand.pick(["*", "+", "-"]);
        const k = this.rand.int(1, 5);
        return `let comp_${this.rand.int(1, 999)} = [x ${op} ${k} for x in 1..6 if x % 2 == 0]`;
      }
      case 2: {
        // Ranges
        const lo = this.rand.int(1, 4);
        const hi = this.rand.int(5, 9);
        const inc = this.rand.bool() ? "..=" : "..";
        return `let r_${this.rand.int(1, 999)} = (${lo}${inc}${hi}).map(x => x * 2)`;
      }
      case 3: {
        // Maps and Sets
        return `let s_${this.rand.int(1, 999)} = Set([1, 2, 3])
let m_${this.rand.int(1, 999)} = {"alpha": 1, "beta": 2}
let u_${this.rand.int(1, 999)} = s_${this.rand.int(1, 999)} | Set([3, 4, 5])`;
      }
      case 4: {
        // F-strings
        const v = this.rand.int(10, 99);
        return `let name = "test"
let fs_${this.rand.int(1, 999)} = f"val={${v}} name={name} debug={${v}=} fmt={${v}:05d} {{literal}}"`;
      }
      case 5: {
        // Match statement
        const val = this.rand.int(0, 3);
        return `let mval_${this.rand.int(1, 999)} = match ${val} {
  0 => "zero"
  1 => "one"
  n if n > 1 => "many"
  _ => "other"
}`;
      }
      case 6: {
        // If-as-value and ternary
        const cond = this.rand.bool() ? "true" : "false";
        return `let cond_val_${this.rand.int(1, 999)} = if ${cond} { 100 } else { 200 }
let py_val_${this.rand.int(1, 999)} = 1 if ${cond} else 2`;
      }
      case 7: {
        // Tuples and destructuring
        return `let tup_${this.rand.int(1, 999)} = (10, "hello")
var (tup_a, tup_b) = (1, 2)
(tup_a, tup_b) = (tup_b, tup_a)`;
      }
      default: {
        // String operations
        return `let str_${this.rand.int(1, 999)} = "hello world"
let sub_${this.rand.int(1, 999)} = str_${this.rand.int(1, 999)}.substring(0, 5)
let split_${this.rand.int(1, 999)} = str_${this.rand.int(1, 999)}.split(" ")`;
      }
    }
  }

  /** Generates an arithmetic expression with reference JS BigInt/Float evaluation */
  private genArithRef(): { code: string; expected: string } {
    const kind = this.rand.int(1, 4);
    switch (kind) {
      case 1: {
        // Small int arithmetic: + - *
        const a = this.rand.int(-50, 50);
        const b = this.rand.int(1, 30);
        const c = this.rand.int(1, 10);
        const val = BigInt(a) + BigInt(b) * BigInt(c);
        return {
          code: `(${a} + ${b} * ${c})`,
          expected: val.toString(),
        };
      }
      case 2: {
        // Int / Int division: 7 / 2 = 3.5
        const a = this.rand.int(1, 20);
        const b = this.rand.pick([2, 4, 5, 8, 10]);
        const val = a / b;
        return {
          code: `(${a} / ${b})`,
          expected: Number.isInteger(val) ? val.toFixed(1) : val.toString(),
        };
      }
      case 3: {
        // Int.div: whole-number division
        const a = this.rand.int(-50, 50);
        const b = this.rand.pick([2, 3, 5, 7]);
        const val = Math.trunc(a / b);
        return {
          code: `(${a}).div(${b})`,
          expected: val.toString(),
        };
      }
      default: {
        // Range sum on safe small range
        const lo = this.rand.int(1, 5);
        const hi = this.rand.int(6, 12);
        let s = 0;
        for (let i = lo; i < hi; i++) s += i;
        return {
          code: `(${lo}..${hi}).sum()`,
          expected: s.toString(),
        };
      }
    }
  }
}

/** Runs grammar fuzzing for a given time budget or iterations */
export async function runGrammarFuzz(durationSeconds = 60, seed = 54321): Promise<GrammarFuzzResult> {
  const gen = new GrammarGenerator(seed);
  const result: GrammarFuzzResult = {
    iterations: 0,
    programsGenerated: 0,
    fmtRoundtripsChecked: 0,
    refEvalsChecked: 0,
    internalErrors: [],
    fmtFailures: [],
    refEvalMismatches: [],
  };

  const deadline = Date.now() + durationSeconds * 1000;
  while (Date.now() < deadline) {
    result.iterations++;
    const { source, refEval } = gen.generateProgram();
    result.programsGenerated++;

    // 1. Check compilation: must never throw internal errors
    try {
      const c = check({ source, file: `fuzz_${result.iterations}.myc` });
      if (!c.ok) {
        // If not ok, it must have valid diagnostics, not an internal crash
        continue;
      }
    } catch (e: any) {
      if (e.name !== "CompileError") {
        result.internalErrors.push({
          code: source,
          error: `${e.name}: ${e.message}`,
          stack: e.stack,
        });
        continue;
      }
    }

    // 2. Format roundtrip check: format(code) must parse and format(format(code)) === format(code)
    try {
      const formatted = format(source, `fuzz_${result.iterations}.myc`);
      const second = format(formatted, `fuzz_${result.iterations}.myc`);
      result.fmtRoundtripsChecked++;
      if (formatted !== second) {
        result.fmtFailures.push({
          code: source,
          error: "format is not idempotent: first format !== second format",
        });
      }
    } catch (e: any) {
      result.fmtFailures.push({
        code: source,
        error: `format threw: ${e.name}: ${e.message}`,
      });
    }

    // 3. Run and reference evaluation check
    try {
      const runRes = await run({
        source,
        file: `fuzz_${result.iterations}.myc`,
        limits: { maxSteps: 50_000, maxMillis: 1000 },
      });

      if (runRes.error && runRes.error.kind === "panic" && runRes.error.message.startsWith("internal error:")) {
        result.internalErrors.push({
          code: source,
          error: runRes.error.human,
        });
      }

      if (refEval && runRes.ok) {
        result.refEvalsChecked++;
        const match = /REF:\s*([^\r\n]+)/.exec(runRes.output);
        if (match) {
          const got = match[1].trim();
          if (got !== refEval.expected) {
            result.refEvalMismatches.push({
              code: refEval.expr,
              expected: refEval.expected,
              got,
            });
          }
        }
      }
    } catch (e: any) {
      result.internalErrors.push({
        code: source,
        error: `run() unhandled exception: ${e.name}: ${e.message}`,
        stack: e.stack,
      });
    }
  }

  return result;
}
