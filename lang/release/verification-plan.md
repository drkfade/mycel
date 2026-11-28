# Mycel 0.2 alpha checks (fixed before first binary execution)

This is release acceptance, not a performance benchmark. No sealed splits or
private data are used; do not change cases to hide failures.

- Scan bundle and Mach-O bytes for build-host paths and private host tokens (see `check-artifact.mjs`).
  Negative probes append each forbidden token to a temporary copy and must fail.
- With a fresh HOME, working directory containing spaces/Unicode, and PATH exactly
  `/usr/bin:/bin`, execute the copied binary and sibling ply shim: version, welcome,
  hello.myc; new demo, run, test; ply help install and ply run alias.
- Run all 11 examples from the existing playground examples.js without changing
  source. The guessing game's random secret is not seeded: provide 1 through 100
  and verify a successful guess. The error example must fail with its fix-it.
  UI examples are compile/run checks only, not native window verification.
- Fresh synthetic inputs: Unicode relative import across .myc/.olx; JSON and
  crypto; filesystem capability deny/grant; isolated hello and infinite loop;
  editor LSP initialize/shutdown; fmt and doc; REPL input; packaged build behavior.
- Repeat the binary suite after package payload expansion, without installing.
- Check the pkg payload list, unsigned signature status, architecture constraint,
  license/welcome/conclusion resources, permissions, hashes, uninstall dry-run,
  extracted payload byte scans and absence of compiler source as loose files.
- Run compiler regression tests except any excluded tour fixture test;
  record any failures without altering existing tests or examples.
