import * as fs from "fs";
import * as path from "path";
import { Rand } from "./prng";
import { Source } from "../src/diag";
import { lex, Token } from "../src/lexer";
import { check, run } from "../src/host";

export interface MutateFuzzResult {
  iterations: number;
  filesLoaded: number;
  mutationsChecked: number;
  hangs: { file: string; mutation: string; code: string; durationMs: number }[];
  crashes: { file: string; mutation: string; code: string; error: string; stack?: string }[];
}

const TOKEN_VOCABULARY = [
  // keywords
  "let", "var", "fn", "class", "struct", "interface", "enum", "type", "extend", "import",
  "pub", "private", "protected", "static", "if", "else", "while", "for", "in",
  "match", "return", "break", "continue", "throw", "try", "catch", "finally",
  "true", "false", "nil", "is", "as", "async", "await", "spawn", "gen", "yield",
  "init", "self", "super", "override", "operator", "extern", "then",
  // operators & delimiters
  "{", "}", "(", ")", "[", "]", ",", ":", ";", ".", "..", "..=", "...",
  "=>", "->", "|>", "?", "??", "?.", "!", "~",
  "=", "+=", "-=", "*=", "/=", "%=", "**=", "??=", "<<=", ">>=",
  "==", "!=", "<", "<=", ">", ">=",
  "+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>",
  // literals
  "0", "1", "-1", "9223372036854775807", "-9223372036854775808", "9223372036854775808",
  "0.0", "3.14", "1e10", "NaN", "Infinity",
  '""', '"test"', '"hello 👋 world"', '"""multi\nline"""', 'f"val={x}"', 'f"{x:.2f}"', 'f"{x=}"',
  "'a'", "'\\n'", "'\\u{1F600}'", "'\\u{bad}'", "'\\u{999999999}'",
  "x", "y", "foo", "bar", "_",
];

export class MutationFuzzer {
  private rand: Rand;
  private corpus: { name: string; text: string }[] = [];

  constructor(seed = 67890) {
    this.rand = new Rand(seed);
    this.loadCorpus();
  }

  private loadCorpus() {
    let root = path.resolve(__dirname, "..");
    if (!fs.existsSync(path.join(root, "compare"))) {
      root = path.resolve(__dirname, "../..");
    }
    const searchDirs = [
      path.join(root, "compare"),
      path.join(root, "examples"),
      path.join(root, "std"),
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      this.walkDir(dir);
    }

    // Also extract embedded code from tests
    const testsDir = path.join(root, "tests");
    if (fs.existsSync(testsDir)) {
      for (const f of fs.readdirSync(testsDir)) {
        if (f.endsWith(".test.ts")) {
          const content = fs.readFileSync(path.join(testsDir, f), "utf8");
          const re = /(?:run|exec|check|out)\(\s*`([^`]{20,})`/g;
          let m: RegExpExecArray | null;
          let idx = 0;
          while ((m = re.exec(content))) {
            this.corpus.push({ name: `${f}:snippet_${idx++}`, text: m[1] });
          }
        }
      }
    }
  }

  private walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "dist") {
          this.walkDir(full);
        }
      } else if (entry.isFile() && (entry.name.endsWith(".myc") || entry.name.endsWith(".olx"))) {
        this.corpus.push({ name: full, text: fs.readFileSync(full, "utf8") });
      }
    }
  }

  get corpusSize(): number {
    return this.corpus.length;
  }

  /** Generates a single mutated source from a random corpus item */
  mutate(): { file: string; mutation: string; text: string } {
    if (this.corpus.length === 0) throw new Error("empty corpus");
    const item = this.rand.pick(this.corpus);
    const text = item.text;

    let toks: Token[];
    try {
      toks = lex(new Source(item.name, text)).filter((t) => t.k !== "eof");
    } catch {
      // If original text does not lex cleanly, just do string mutation
      return this.mutateChars(item.name, text);
    }

    if (toks.length === 0) return this.mutateChars(item.name, text);

    const kind = this.rand.int(1, 5);
    switch (kind) {
      case 1: {
        // Delete token
        const idx = this.rand.int(0, toks.length - 1);
        const t = toks[idx];
        const res = text.slice(0, t.start) + text.slice(t.end);
        return { file: item.name, mutation: `delete token '${t.v}' at ${t.start}`, text: res };
      }
      case 2: {
        // Duplicate token
        const idx = this.rand.int(0, toks.length - 1);
        const t = toks[idx];
        const res = text.slice(0, t.end) + " " + text.slice(t.start, t.end) + text.slice(t.end);
        return { file: item.name, mutation: `duplicate token '${t.v}' at ${t.start}`, text: res };
      }
      case 3: {
        // Swap adjacent tokens
        if (toks.length < 2) return this.mutateChars(item.name, text);
        const idx = this.rand.int(0, toks.length - 2);
        const a = toks[idx], b = toks[idx + 1];
        if (a.end <= b.start) {
          const res = text.slice(0, a.start) + text.slice(b.start, b.end) + text.slice(a.end, b.start) + text.slice(a.start, a.end) + text.slice(b.end);
          return { file: item.name, mutation: `swap tokens '${a.v}' and '${b.v}'`, text: res };
        }
        return this.mutateChars(item.name, text);
      }
      case 4: {
        // Replace token with vocabulary token
        const idx = this.rand.int(0, toks.length - 1);
        const t = toks[idx];
        const repl = this.rand.pick(TOKEN_VOCABULARY);
        const res = text.slice(0, t.start) + " " + repl + " " + text.slice(t.end);
        return { file: item.name, mutation: `replace token '${t.v}' with '${repl}'`, text: res };
      }
      default: {
        // Insert vocabulary token
        const idx = this.rand.int(0, toks.length - 1);
        const t = toks[idx];
        const ins = this.rand.pick(TOKEN_VOCABULARY);
        const res = text.slice(0, t.start) + " " + ins + " " + text.slice(t.start);
        return { file: item.name, mutation: `insert token '${ins}' before '${t.v}'`, text: res };
      }
    }
  }

  private mutateChars(file: string, text: string): { file: string; mutation: string; text: string } {
    if (text.length === 0) return { file, mutation: "insert into empty", text: "let x = 1" };
    const pos = this.rand.int(0, text.length - 1);
    const sub = this.rand.pick(["\\u{999999999}", "\\u{bad}", 'f"lone } brace"', "'''", '"""', "0xGG", "-9223372036854775808"]);
    const res = text.slice(0, pos) + sub + text.slice(pos);
    return { file, mutation: `char injection '${sub}' at ${pos}`, text: res };
  }
}

/** Runs mutation fuzzing for a bounded duration */
export async function runMutationFuzz(durationSeconds = 60, seed = 67890): Promise<MutateFuzzResult> {
  const fuzzer = new MutationFuzzer(seed);
  const result: MutateFuzzResult = {
    iterations: 0,
    filesLoaded: fuzzer.corpusSize,
    mutationsChecked: 0,
    hangs: [],
    crashes: [],
  };

  const deadline = Date.now() + durationSeconds * 1000;
  while (Date.now() < deadline) {
    result.iterations++;
    const { file, mutation, text } = fuzzer.mutate();
    result.mutationsChecked++;

    const t0 = Date.now();
    let isOk = false;

    // 1. Check phase: compile diagnostics
    try {
      const c = check({ source: text, file: "mutated.myc" });
      isOk = c.ok;
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      if (elapsed > 2000) {
        result.hangs.push({ file, mutation, code: text, durationMs: elapsed });
      } else if (e.name !== "CompileError") {
        result.crashes.push({
          file,
          mutation,
          code: text,
          error: `check() crash: ${e.name}: ${e.message}`,
          stack: e.stack,
        });
      }
      continue;
    }

    const elapsedCheck = Date.now() - t0;
    if (elapsedCheck > 2000) {
      result.hangs.push({ file, mutation, code: text, durationMs: elapsedCheck });
      continue;
    }

    // 2. If it actually compiled, run it with 2-second timeout
    if (isOk) {
      const t1 = Date.now();
      try {
        const runRes = await run({
          source: text,
          file: "mutated.myc",
          limits: { maxMillis: 2000, maxSteps: 100_000 },
        });
        const elapsedRun = Date.now() - t1;
        if (elapsedRun > 2000) {
          result.hangs.push({ file, mutation, code: text, durationMs: elapsedRun });
        } else if (runRes.error && runRes.error.kind === "panic" && runRes.error.message.startsWith("internal error:")) {
          result.crashes.push({
            file,
            mutation,
            code: text,
            error: runRes.error.human,
          });
        }
      } catch (e: any) {
        result.crashes.push({
          file,
          mutation,
          code: text,
          error: `run() unhandled: ${e.name}: ${e.message}`,
          stack: e.stack,
        });
      }
    }
  }

  return result;
}
