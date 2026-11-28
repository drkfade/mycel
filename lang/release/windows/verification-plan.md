# Windows release acceptance — fixed before release smoke execution, 2026-11-08

No benchmark score or unseen capability claim. Synthetic portability fixtures only.
No hidden/sealed data. Fixed acceptance list prior to smoke execution.
Do not edit cases or existing expected outputs to obtain a pass.

- Verify the pinned Node release primary key, cleartext SHASUMS signature, equality
  with SHASUMS256.txt and SHA-256 of the pristine official win-x64/node.exe.
- Inspect final PE x64 header, embedded blob equality and enabled SEA fuse. Scan
  both bundle and executable for source home paths/assistant imports.
- Through the same bundle on this Mac, then through mycel.exe on Windows: version,
  bare welcome, CRLF script, Unicode/spaced nested imports across both extensions,
  new project/run/test, capability deny/grant/all, junction escape, CRLF fmt,
  text+JSON diagnostics, doc, isolated hello/timeout, REPL, LSP, package commands,
  unsupported standalone JavaScript export. Alias shim must be checked on Windows.
- Preserve original npm test assertions, including the hello example
  and deployed-site-current check. Report failures; never edit site in this task.
- ZIP independent CRC/extraction, exact seven-file allow-list, no loose source,
  byte-identical dual-licence/Node licenses, bootstrap's pinned hash and no exit.
- Windows PowerShell 5.1 and pwsh: parse scripts, install/reinstall/uninstall in a
  temporary LOCALAPPDATA, exact PATH entry/dedup/removal, preserve unrelated files,
  mocked download of the real archive and a tampered download, shell remains alive.
- Sabotage in private copied build only: old case-sensitive boundary, old CRLF
  normalization, old hash separator, old dangling-link fallback, shell spawning,
  and old slash-only std.files/fs paths. Require a corresponding test failure.
