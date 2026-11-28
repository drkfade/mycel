# Mycel — implementation status

Last updated 2026-11-27. `cd lang && npm test` passes across the compiler, standard library, CLI, formatter, and examples.

## Implemented and tested
| Area | State |
|---|---|
| Lexer, parser, AST | all syntax in `docs/SPEC.md`; explained syntax errors (unclosed brackets name the opener, missing operands, reserved words) |
| Type checker | inference (local, generics, expected-type hints), optionals + narrowing (`if let`, `!= nil`, early exit, `&&`), `Result` + `?`, classes/structs/enums/interfaces, generics with bounds (invariant), overloading, named/default/variadic args, access modifiers, override checking, interface conformance, definite initialisation, missing-return, exhaustive `match` (enums, Bool, optionals, tuples, lists), operator overloading, extensions, type aliases |
| Language & stdlib highlights | list/map comprehensions with nested `for`/`if` and patterns; destructuring in parameters (`fn f((a, b): (Int, Int))`, `((k, v)) => k`, `P{x, y}`); labeled `break`/`continue`; JSON-native literals where a `json.Json` is expected; `task.select(channels[, timeout:])`; `mycel explain <code>` for every code; playground live values per line; Swift `if let x {` fix-it |
| Codegen + runtime | Mycel → JS in a closed world (no way to name host objects); 64-bit `Int` (BigInt, overflow panics), Unicode-correct strings, generators, async/await/spawn, optional chaining that short-circuits whole chains, tail of `?` propagation, stack traces mapped back to Mycel lines |
| Diagnostics | text + JSON, did-you-mean (Damerau), concrete `suggestion` for the common mistakes |
| Python + npm packages | `ply install x --python/--npm` (flag anywhere) into `.ply/python/venv` / `.ply/node` (npm scripts off); exact pins + hashes + provided modules in ply.lock; restore with `ply install`; remove/update/why; `import requests`, `from x import y`, `import "@s/p" as p`, `--python` flag only when ambiguous; generated bindings (Python signatures → named args); `std.foreign.Value` (data copied, objects as handles); calls capability-gated (`capabilities.packages`, `--allow-pkg`); Python bridge ~40 µs/call, crash → clear error |
| `mycel translate` | Python → Mycel via Python's `ast`; 40/40 dataset pairs, 25/25 compare programs, held-out 29/30 (batch B 13/15 on first run); untranslatable lines → `// TODO(translate) line N` + exit 3; `std.pycompat` for Python printing/`//`/`%`/round/slices |
| Modules / packages | files = modules, `import` forms, `pub`, cycle detection, `ply.json`, semver ranges, `path:` deps, local registry, flat install, `ply.lock` with sha256 integrity, publish (immutable versions) |
| Std library | prelude (Int/Float/String/Array/Map/Set/Range/Gen/Result/Error), `std.json math fs env process time re log test crypto io http sqlite task foreign pycompat` (see `docs/stdlib/`) |
| Safety | capabilities (fs roots incl. symlink/`..` resolution, net hosts, listen, process commands, env names), limits (steps, wall time, output, collection, string, abort), `runIsolated` (worker: heap cap, wall-clock kill for native work) |
| Tooling | `mycel run check test build fmt doc repl new` (`ply` = same CLI; `ply add remove install publish` for packages); `.myc` primary, `.olx` accepted everywhere, REPL with persistent state and `:type`, formatter (idempotent, token-verified), doc generator |
| Examples | `examples/tour` (7 topics), `calc` (lexer/parser/evaluator, 3 tests), `todo` (JSON + fs + args, 3 tests), `api` (REST server + client, 2 tests) |

## Partial / known limits (all documented, none silent)
* **Foreign packages**: no callbacks into Mycel (a Mycel closure cannot be passed to Python/npm), no `bytes` type (bytes stay a handle), members of handles are reached with `.attr()/.call()` (no dot access), the import's alias of a dotted Python module binds its last part (`import google.generativeai` → `generativeai`), Python's argument checks happen in Python (an error, not a compile error). Java/Rust/Go/Swift: not yet. `ply install --python` needs `python3` with `venv`; `--npm` needs `npm` on PATH.
* **translate**: an `if` expression mixing Int and Float branches is a compile error; `with`, decorators, `match`, `**kwargs`, `global` rebinding, string `%`-formatting and slices with steps become TODO comments; a Python set prints in sorted order (CPython's order differs for some sets).
* **Memory** is limited in-process only by collection/string caps; a true heap cap needs `runIsolated` / `--max-memory-mb`.
* **Native work cannot be interrupted in-process**: a catastrophic regex or a long `process.run` ignores `maxMillis` until it
  returns. `runIsolated` kills it (tested). `std.re` also caps pattern (2000 chars) and input (1 MB).
* **fs checks are path-based**: a symlink swapped between the check and the open could escape (TOCTOU); roots are resolved with
  `realpath` at check time.
* **Generics are erased and invariant**: no `is T` on a type parameter; `[Dog]` is not a `[Animal]` (compile error says why).
* **Char is a one-character String at run time**: `x is Char` is true for any String; `display` of a Char inside a collection prints like a String.
* **Collections are reference types** (`let` fixes the binding only); structs are immutable values.
* **Map keys / set elements** are limited to `Int String Char Bool Float`.
* `std.sqlite` rides Node's experimental `node:sqlite` (Node prints an ExperimentalWarning); `std.process.run` blocks the event loop.
* Top-level initialisers run in source order (using a later `let` at load time fails with the JS TDZ message mapped to a Mycel panic).
* `defer` is not added: `try { } finally { }` is the one way to clean up (Go/Swift habit gets a fix-it).
* The formatter keeps your line breaks (no line wrapping) and normalises spacing only around `,`, brackets, `{`, `=`, comparison and arrow operators.
* Windows drive/UNC/case boundaries, path hashing and CRLF have simulated regression coverage on macOS. A Windows x64 Node SEA is cross-built; the executable and installers remain untested on real Windows until private CI runs (see `release/WINDOWS.md`).

## Planned (not started)
Async generators (`for await`; a producer that sends on a `task.Channel` covers it today), local `gen fn`, reified generics,
`where` clauses, a debugger, `mycel build` of a user program into one executable (today: one JS file + Node), a remote package registry, verified production Windows support. (Speed is not a problem today: a cold `mycel run`
of hello-world is ~60 ms wall including Node start-up; a warm in-process `check` is ~3.5 ms.)

## Next step
Embed in a host app per `docs/EMBEDDING.md` ("Host integration pattern"): `run_code` with check-first diagnostics, a `host` module generated from the host's tool registry, and hash-pinned saved scripts.
