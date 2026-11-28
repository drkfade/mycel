# Embedding Mycel

```ts
import { run, runIsolated, check, compile } from "ply-lang/dist/src/host";

const r = await run({
  source: "fn main() { print(\"hi\") }",
  file: "script.olx",
  capabilities: { fs: { read: ["/data/in"], write: ["/data/out"] }, net: { hosts: ["api.example.com"] } },
  limits: { maxSteps: 50_000_000, maxMillis: 10_000, maxOutputBytes: 100_000, maxCollection: 1_000_000, maxStringLength: 5_000_000 },
  onOutput: (t) => process.stdout.write(t),
  signal: abortController.signal,
  args: ["--flag"],
  hostModules: { app: { source: "pub extern fn read_file(path: String) -> Result<String, Error>", natives: { read_file: (p: string) => /* … */ } } },
});
// r: { ok, output, error?: { kind: "compile"|"panic"|"uncaught"|"limit"|"abort", message, trace: [{fn,file,line,col}], human, limit? },
//      diagnostics: [{severity, code, message, file, line, col, why, suggestion}], warnings, steps, millis, taskErrors, tests? }
```

* `check(opts)` type-checks without running and returns `{ ok, diagnostics (JSON), text }`. Feed `diagnostics` back to a
  model: each has `code`, `line`, `col`, `message`, `why`, `suggestion`.
* `run` executes in-process. It enforces steps/time/output/collection/string limits and `signal`, but a native call that
  never returns (a catastrophic regex, a blocking `process.run`) or a heap blow-up cannot be interrupted from inside.
  `runIsolated({..., maxMemoryMb})` runs the same program in a worker thread: real heap cap, wall-clock kill, abort.
  (Host modules and stdin are not available there because functions cannot cross threads.)
* **Capabilities** are deny-by-default. `fs.read/write`: directory roots (symlinks and `..` resolved before the check);
  `net.hosts`: host names or `true`; `net.listen`: allow a localhost server; `process.run`: command names or `true`
  (spawned without a shell, minimal environment); `env.read`: variable names or `true`. A denied call returns
  `Err(CapabilityError)` whose message names the operation, the target and the reason.
* **Host modules** let the embedder expose native functions: `source` is Mycel declarations (`pub extern fn …`, classes
  with `extern`), `natives` maps `"fn"` / `"Class.method"` / `"Class.get_prop"` to implementations. Values cross as:
  `Int` = `bigint`, `Float` = `number`, `String`/`Char` = `string`, `Bool` = `boolean`, `[T]` = `Array`,
  `{K: V}` = `Map`, `T?` = `null`, `Result` via `ctx.M.prelude.Result$Ok.of(v)` / `Result$Err.of(e)`.
* Exit conditions are values, never thrown: `RunResult.error.kind` tells a limit from a panic from an uncaught error.

## Host integration pattern

Mycel is designed to be embedded as the language models write when they need to run code (for example, in a `run_code` tool or saved scripts):

1. **`run_code` integration**: call `check()` first; on errors return `diagnostics` (already actionable: `suggestion`
   is a concrete fix) instead of running; on success `runIsolated({ capabilities, limits, maxMemoryMb: 256 })`.
   Capabilities derive from the host's existing approval state (default none; a granted folder becomes `fs.read/write`).
2. **Host tools as a module**: generate a `hostModules.app` module from the tool registry — one `pub extern fn <tool>(args) ->
   Result<String, Error>` per read-only tool; mutating tools stay behind the host's existing exact single-use approval
   (the native calls the approval gate, so a script cannot bypass it). Automations then read like
   `let notes = app.search_notes("budget")?`.
3. **Saved scripts**: store `.myc` source in the script store with a hash; re-`check` on load (the standard library may
   change); user approval attaches to the hash plus the capability set, so changing either re-prompts.
4. **Prompt**: `lang/docs/SPEC.md` §1–§6 plus `examples/tour/*.olx` fit in ~6k tokens; the JSON diagnostics make a
   fix-and-retry loop converge without the model seeing JavaScript at all.
