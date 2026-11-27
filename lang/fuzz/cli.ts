import { runGrammarFuzz } from "./grammar";
import { runMutationFuzz } from "./mutate";
import { runDifferentialFuzz } from "./differential";

interface CliArgs {
  mode: "grammar" | "mutate" | "diff" | "all";
  durationSeconds: number;
  seed: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let mode: CliArgs["mode"] = "all";
  let durationSeconds = 60; // default 60s per mode or specified
  let seed = 424242;

  for (const a of args) {
    if (a.startsWith("--mode=")) {
      const m = a.slice(7);
      if (["grammar", "mutate", "diff", "all"].includes(m)) mode = m as any;
    } else if (a.startsWith("--duration=")) {
      durationSeconds = Math.max(1, parseInt(a.slice(11), 10));
    } else if (a.startsWith("--minutes=")) {
      durationSeconds = Math.max(1, Math.round(parseFloat(a.slice(10)) * 60));
    } else if (a.startsWith("--seed=")) {
      seed = parseInt(a.slice(7), 10);
    } else if (a === "--help" || a === "-h") {
      console.log(`Mycel Fuzzing Harness
Usage: node dist/fuzz/cli.js [options]

Options:
  --mode=<grammar|mutate|diff|all>  Select fuzzing mode (default: all)
  --duration=<seconds>              Time budget per mode in seconds (default: 60)
  --minutes=<minutes>               Time budget per mode in minutes
  --seed=<number>                   Random seed for reproducibility (default: 424242)
  --help, -h                        Show this help
`);
      process.exit(0);
    }
  }

  return { mode, durationSeconds, seed };
}

async function main() {
  const { mode, durationSeconds, seed } = parseArgs();

  console.log(`=== Mycel Fuzzer Starting ===`);
  console.log(`Mode: ${mode} | Duration per mode: ${durationSeconds}s | Base Seed: ${seed}\n`);

  if (mode === "grammar" || mode === "all") {
    console.log(`--- [1/3] Grammar-Based Fuzzing ---`);
    const t0 = Date.now();
    const gRes = await runGrammarFuzz(durationSeconds, seed);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Grammar fuzz finished in ${elapsed}s:`);
    console.log(`  Iterations: ${gRes.iterations}`);
    console.log(`  Programs generated: ${gRes.programsGenerated}`);
    console.log(`  Fmt roundtrips checked: ${gRes.fmtRoundtripsChecked} (Failures: ${gRes.fmtFailures.length})`);
    console.log(`  Reference evaluations checked: ${gRes.refEvalsChecked} (Mismatches: ${gRes.refEvalMismatches.length})`);
    console.log(`  Internal compiler errors / crashes: ${gRes.internalErrors.length}`);

    if (gRes.internalErrors.length > 0) {
      console.log(`\n  Sample Grammar Internal Errors:`);
      for (const err of gRes.internalErrors.slice(0, 3)) {
        console.log(`    Error: ${err.error}`);
      }
    }
    if (gRes.fmtFailures.length > 0) {
      console.log(`\n  Sample Format Failures:`);
      for (const f of gRes.fmtFailures.slice(0, 3)) {
        console.log(`    ${f.error}`);
      }
    }
    console.log("");
  }

  if (mode === "mutate" || mode === "all") {
    console.log(`--- [2/3] Mutation Fuzzing ---`);
    const t0 = Date.now();
    const mRes = await runMutationFuzz(durationSeconds, seed + 1);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Mutation fuzz finished in ${elapsed}s:`);
    console.log(`  Corpus files loaded: ${mRes.filesLoaded}`);
    console.log(`  Mutations evaluated: ${mRes.mutationsChecked}`);
    console.log(`  Hangs (> 2s): ${mRes.hangs.length}`);
    console.log(`  Crashes / internal errors: ${mRes.crashes.length}`);

    if (mRes.crashes.length > 0) {
      console.log(`\n  Sample Mutation Crashes:`);
      for (const c of mRes.crashes.slice(0, 3)) {
        console.log(`    File: ${c.file}`);
        console.log(`    Mutation: ${c.mutation}`);
        console.log(`    Error: ${c.error}`);
      }
    }
    console.log("");
  }

  if (mode === "diff" || mode === "all") {
    console.log(`--- [3/3] Differential & Semantics Fuzzing ---`);
    const t0 = Date.now();
    const dRes = await runDifferentialFuzz(durationSeconds, seed + 2);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Differential fuzz finished in ${elapsed}s:`);
    console.log(`  Iterations: ${dRes.iterations}`);
    console.log(`  Checks executed: ${dRes.checksRun}`);
    console.log(`  Semantic failures / bugs found: ${dRes.failures.length}`);

    if (dRes.failures.length > 0) {
      console.log(`\n  Distinct Failures:`);
      for (const f of dRes.failures) {
        console.log(`    [${f.category}] ${f.description}`);
        console.log(`      Expected: ${f.expected}`);
        console.log(`      Got:      ${f.got}`);
      }
    }
    console.log("");
  }

  console.log(`=== Mycel Fuzzer Completed ===`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Fuzzer fatal error:", e);
    process.exit(1);
  });
}
