import { Rand } from "./prng";
import { run, check } from "../src/host";

export interface DifferentialFuzzResult {
  iterations: number;
  checksRun: number;
  failures: { category: string; description: string; code: string; expected: string; got: string }[];
}

const I64_MAX = 9223372036854775807n;
const I64_MIN = -9223372036854775808n;

export class DifferentialFuzzer {
  private rand: Rand;

  constructor(seed = 13579) {
    this.rand = new Rand(seed);
  }

  /** Run a suite of differential checks */
  async runAllChecks(): Promise<{ checks: number; failures: DifferentialFuzzResult["failures"] }> {
    const failures: DifferentialFuzzResult["failures"] = [];
    let checks = 0;

    // 1. Int overflow and arithmetic semantics
    checks += await this.checkIntArithmetic(failures);

    // 2. Division semantics: 7 / 2 = 3.5, .div, div by zero
    checks += await this.checkDivisionSemantics(failures);

    // 3. Negative indexes (arrays, strings, assignment)
    checks += await this.checkNegativeIndexes(failures);

    // 4. Ranges (length, first, last, sum, step, open-ended)
    checks += await this.checkRanges(failures);

    // 5. String ops and unicode/surrogate handling (substring, padLeft, padRight, indexOf)
    checks += await this.checkStringOps(failures);

    return { checks, failures };
  }

  private async checkIntArithmetic(failures: DifferentialFuzzResult["failures"]): Promise<number> {
    let count = 0;

    // Test cases for overflow boundaries
    const interestingInts = [
      0n, 1n, -1n, 2n, -2n, 10n, -10n,
      I64_MAX, I64_MAX - 1n, I64_MAX - 2n,
      I64_MIN, I64_MIN + 1n, I64_MIN + 2n,
    ];

    // Add some random 64-bit ints
    for (let i = 0; i < 10; i++) {
      interestingInts.push(this.rand.bigint(I64_MIN, I64_MAX));
    }

    for (const a of interestingInts) {
      // 1. Unary negation
      count++;
      const negExpectedOverflow = a === I64_MIN;
      const negCode = `let x = -(${a.toString()})\nprint(x)`;
      // Note: if a is I64_MIN, -I64_MIN overflows
      try {
        const r = await run({ source: negCode });
        if (negExpectedOverflow) {
          if (r.ok) {
            failures.push({
              category: "numeric.overflow",
              description: `negation of I64_MIN (${a}) should overflow and panic`,
              code: negCode,
              expected: "panic: integer overflow",
              got: r.output.trim(),
            });
          }
        } else {
          const expected = (-a).toString();
          if (!r.ok || r.output.trim() !== expected) {
            failures.push({
              category: "numeric.neg",
              description: `negation of ${a}`,
              code: negCode,
              expected,
              got: r.output.trim() || (r.error?.message ?? "error"),
            });
          }
        }
      } catch (e: any) {
        failures.push({
          category: "numeric.crash",
          description: `crash on negation of ${a}`,
          code: negCode,
          expected: "safe evaluation",
          got: e.message,
        });
      }

      // 2. Binary operations with selected b
      for (const b of [0n, 1n, -1n, 2n, I64_MAX, I64_MIN]) {
        for (const op of ["+", "-", "*"]) {
          count++;
          let ref: bigint;
          let overflows = false;
          try {
            if (op === "+") ref = a + b;
            else if (op === "-") ref = a - b;
            else ref = a * b;
            if (ref > I64_MAX || ref < I64_MIN) overflows = true;
          } catch {
            overflows = true;
          }

          const code = `let res = (${a.toString()} ${op} ${b.toString()})\nprint(res)`;
          try {
            const r = await run({ source: code });
            if (overflows) {
              if (r.ok) {
                failures.push({
                  category: "numeric.overflow",
                  description: `${a} ${op} ${b} overflows 64-bit int but did not panic`,
                  code,
                  expected: "panic: integer overflow",
                  got: r.output.trim(),
                });
              }
            } else {
              const expStr = ref!.toString();
              if (!r.ok || r.output.trim() !== expStr) {
                failures.push({
                  category: "numeric.arith",
                  description: `${a} ${op} ${b}`,
                  code,
                  expected: expStr,
                  got: r.output.trim() || (r.error?.message ?? "error"),
                });
              }
            }
          } catch (e: any) {
            failures.push({
              category: "numeric.crash",
              description: `crash on ${a} ${op} ${b}`,
              code,
              expected: "safe evaluation",
              got: e.message,
            });
          }
        }
      }
    }

    // Literal check: -9223372036854775808 (I64_MIN)
    count++;
    const minLitCode = `let x = -9223372036854775808\nprint(x)`;
    const rMin = await run({ source: minLitCode });
    if (!rMin.ok || rMin.output.trim() !== "-9223372036854775808") {
      failures.push({
        category: "numeric.literal",
        description: "literal -9223372036854775808 (I64_MIN) should compile and run",
        code: minLitCode,
        expected: "-9223372036854775808",
        got: rMin.output.trim() || (rMin.error?.message ?? "compile error"),
      });
    }

    return count;
  }

  private async checkDivisionSemantics(failures: DifferentialFuzzResult["failures"]): Promise<number> {
    let count = 0;

    // 1. 7 / 2 = 3.5 (Float division)
    count++;
    const divCode = `print(7 / 2, 7.div(2), (-7).div(2))`;
    const rDiv = await run({ source: divCode });
    const expected = "3.5 3 -3";
    if (!rDiv.ok || rDiv.output.trim() !== expected) {
      failures.push({
        category: "numeric.division",
        description: "7 / 2 must equal 3.5 and 7.div(2) must equal 3",
        code: divCode,
        expected,
        got: rDiv.output.trim() || (rDiv.error?.message ?? "error"),
      });
    }

    // 2. Division by zero
    count++;
    const divZeroCode = `print(10 / 0)`;
    const rZero = await run({ source: divZeroCode });
    if (rZero.ok || !rZero.error || !rZero.error.message.includes("division by zero")) {
      failures.push({
        category: "numeric.divzero",
        description: "10 / 0 must panic with division by zero",
        code: divZeroCode,
        expected: "panic: division by zero",
        got: rZero.output.trim() || (rZero.error?.message ?? "ok"),
      });
    }

    // 3. I64_MIN.div(-1) overflow
    count++;
    const idivOverflowCode = `print((-9223372036854775808).div(-1))`;
    const rIdivOver = await run({ source: idivOverflowCode });
    if (rIdivOver.ok || !rIdivOver.error || !rIdivOver.error.message.includes("overflow")) {
      failures.push({
        category: "numeric.overflow",
        description: "I64_MIN.div(-1) must panic with integer overflow",
        code: idivOverflowCode,
        expected: "panic: integer overflow",
        got: rIdivOver.output.trim() || (rIdivOver.error?.message ?? "ok"),
      });
    }

    return count;
  }

  private async checkNegativeIndexes(failures: DifferentialFuzzResult["failures"]): Promise<number> {
    let count = 0;

    // 1. Array negative indexing
    count++;
    const arrCode = `let a = [10, 20, 30, 40]
print(a[-1], a[-2], a[-4])`;
    const rArr = await run({ source: arrCode });
    if (!rArr.ok || rArr.output.trim() !== "40 30 10") {
      failures.push({
        category: "indexing.array_negative",
        description: "a[-1], a[-2], a[-4] on [10, 20, 30, 40]",
        code: arrCode,
        expected: "40 30 10",
        got: rArr.output.trim() || (rArr.error?.message ?? "error"),
      });
    }

    // 2. Array negative index assignment
    count++;
    const arrAssignCode = `var a = [10, 20, 30]
a[-1] = 99
a[-3] = 77
print(a)`;
    const rArrAssign = await run({ source: arrAssignCode });
    if (!rArrAssign.ok || rArrAssign.output.trim() !== "[77, 20, 99]") {
      failures.push({
        category: "indexing.array_assign_negative",
        description: "a[-1] = 99 on array",
        code: arrAssignCode,
        expected: "[77, 20, 99]",
        got: rArrAssign.output.trim() || (rArrAssign.error?.message ?? "error"),
      });
    }

    // 3. String negative indexing with Unicode surrogates
    count++;
    const strCode = `let s = "hi 👋 world"
print(s[-1], s[-2], s[-7])`;
    const rStr = await run({ source: strCode });
    if (!rStr.ok || rStr.output.trim() !== "d l 👋") {
      failures.push({
        category: "indexing.string_negative_unicode",
        description: "string negative index with emoji s[-1], s[-2], s[-7]",
        code: strCode,
        expected: "d l 👋",
        got: rStr.output.trim() || (rStr.error?.message ?? "error"),
      });
    }

    // 4. Out of bounds negative indexing panics
    count++;
    const oobCode = `let a = [1, 2]
print(a[-3])`;
    const rOob = await run({ source: oobCode });
    if (rOob.ok || !rOob.error || !rOob.error.message.includes("out of range")) {
      failures.push({
        category: "indexing.oob",
        description: "a[-3] on 2-element array must panic out of range",
        code: oobCode,
        expected: "panic: out of range",
        got: rOob.output.trim() || (rOob.error?.message ?? "ok"),
      });
    }

    return count;
  }

  private async checkRanges(failures: DifferentialFuzzResult["failures"]): Promise<number> {
    let count = 0;

    // 1. Basic range properties
    count++;
    const rCode = `let r1 = 1..5
let r2 = 1..=5
print(r1.length, r1.first, r1.last, r1.sum(), r2.length, r2.last, r2.sum())`;
    const rRes = await run({ source: rCode });
    const expected = "4 1 4 10 5 5 15";
    if (!rRes.ok || rRes.output.trim() !== expected) {
      failures.push({
        category: "range.properties",
        description: "range 1..5 and 1..=5 properties",
        code: rCode,
        expected,
        got: rRes.output.trim() || (rRes.error?.message ?? "error"),
      });
    }

    // 2. Range.sum() overflow check
    count++;
    const sumOverCode = `let r = 9223372036854775806..=9223372036854775807
print(r.sum())`;
    const rSumOver = await run({ source: sumOverCode });
    if (rSumOver.ok || !rSumOver.error || !rSumOver.error.message.includes("overflow")) {
      failures.push({
        category: "range.sum_overflow",
        description: "(9223372036854775806..=9223372036854775807).sum() must panic with integer overflow",
        code: sumOverCode,
        expected: "panic: integer overflow",
        got: rSumOver.output.trim() || (rSumOver.error?.message ?? "ok"),
      });
    }

    // 3. Open-ended range declaration at statement level
    count++;
    const openRangeCode = `let r = 10..\nprint(r.lo)`;
    const rOpen = await run({ source: openRangeCode });
    if (!rOpen.ok || rOpen.output.trim() !== "10") {
      failures.push({
        category: "range.open_ended",
        description: "open-ended range 'let r = 10..' on its own line must parse and run",
        code: openRangeCode,
        expected: "10",
        got: rOpen.output.trim() || (rOpen.error?.message ?? "compile error"),
      });
    }

    return count;
  }

  private async checkStringOps(failures: DifferentialFuzzResult["failures"]): Promise<number> {
    let count = 0;

    // 1. String.substring on emoji / surrogates
    count++;
    const subCode = `let s = "hello 👋 world 🌍"
print(s.substring(0, 5), s.substring(6, 7), s.substring(8, 13))`;
    const rSub = await run({ source: subCode });
    const subExpected = "hello 👋 world";
    if (!rSub.ok || rSub.output.trim() !== subExpected) {
      failures.push({
        category: "string.substring",
        description: "String.substring on string with emojis counting code points",
        code: subCode,
        expected: subExpected,
        got: rSub.output.trim() || (rSub.error?.message ?? "error"),
      });
    }

    // 2. String.padLeft and padRight with surrogate characters
    count++;
    const padCode = `let s1 = "👋".padLeft(3)
let s2 = "a".padLeft(3, "👋")
let s3 = "a".padRight(3, "👋")
print(s1.length, s2.length, s3.length, s2, s3)`;
    const rPad = await run({ source: padCode });
    // "👋".padLeft(3) -> "  👋" (length 3)
    // "a".padLeft(3, "👋") -> "👋👋a" (length 3, fill with 2 emojis)
    // "a".padRight(3, "👋") -> "a👋👋" (length 3)
    const padExpected = "3 3 3 👋👋a a👋👋";
    if (!rPad.ok || rPad.output.trim() !== padExpected) {
      failures.push({
        category: "string.padding_surrogates",
        description: "String.padLeft and padRight must count code points and not split surrogates",
        code: padCode,
        expected: padExpected,
        got: rPad.output.trim() || (rPad.error?.message ?? "error"),
      });
    }

    // 3. String.indexOf on surrogates
    count++;
    const idxCode = `let s = "hi 👋 world"
print(s.indexOf("👋"), s.indexOf("world"), s.indexOf("nope") == nil)`;
    const rIdx = await run({ source: idxCode });
    const idxExpected = "3 5 true";
    if (!rIdx.ok || rIdx.output.trim() !== idxExpected) {
      failures.push({
        category: "string.indexOf",
        description: "String.indexOf must return code point positions",
        code: idxCode,
        expected: idxExpected,
        got: rIdx.output.trim() || (rIdx.error?.message ?? "error"),
      });
    }

    // 4. Char literal unicode escape error handling
    count++;
    const charBadCode = `let c = '\\u{999999999}'`;
    try {
      const cRes = check({ source: charBadCode });
      if (cRes.ok) {
        failures.push({
          category: "char.unicode_escape",
          description: "'\\u{999999999}' should fail with diagnostic",
          code: charBadCode,
          expected: "CompileError E0001",
          got: "ok",
        });
      }
    } catch (e: any) {
      if (e.name !== "CompileError") {
        failures.push({
          category: "char.unicode_crash",
          description: "'\\u{999999999}' caused unhandled compiler crash",
          code: charBadCode,
          expected: "CompileError",
          got: `${e.name}: ${e.message}`,
        });
      }
    }

    return count;
  }
}

/** Runs differential fuzzing for a bounded duration */
export async function runDifferentialFuzz(durationSeconds = 60, seed = 13579): Promise<DifferentialFuzzResult> {
  const fuzzer = new DifferentialFuzzer(seed);
  const result: DifferentialFuzzResult = {
    iterations: 0,
    checksRun: 0,
    failures: [],
  };

  const deadline = Date.now() + durationSeconds * 1000;
  while (Date.now() < deadline) {
    result.iterations++;
    const { checks, failures } = await fuzzer.runAllChecks();
    result.checksRun += checks;
    for (const f of failures) {
      if (!result.failures.some((x) => x.description === f.description)) {
        result.failures.push(f);
      }
    }
    // Small yield to avoid lockup
    await new Promise((r) => setImmediate(r));
  }

  return result;
}
