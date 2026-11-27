# Mycel 0.1 alpha release build

Mycel is open source (Apache-2.0 OR MIT, see `lang/LICENSE`); the compiler source
is published as a repository, not inside the packages. The release deliverable is
the `.pkg`, after owner approval.

Prerequisites: macOS on arm64, Node **24.13.0**, npm/npx, Apple Command Line Tools
(`lipo`, `strip`, `codesign`, `pkgbuild`, `productbuild`, `pkgutil`). Network is
used only at build time for the pinned development tools. No installer runs.

From the repo root:

```sh
node lang/release/build.mjs
node lang/release/verify.mjs
node lang/release/package.mjs
node lang/release/verify-package.mjs
node lang/release/regressions.mjs
shasum -a 256 lang/release/dist/Mycel-0.1.0-alpha.pkg
```

`build.mjs` copies only compiler/CLI/std/LSP sources and manifests into
`work/compiler`, installs the declared pinned development dependencies with
hooks disabled, and compiles there. It never relies on the checkout's development
`node_modules` symlink. `source-manifest.json` and `work/source-manifest.json` record the actual inputs.
The delivered macOS binary retains the inherited 48-file snapshot; concurrent
Windows portability edits made later are excluded from it. A new build updates
both manifests and requires full verification before replacing the package.
`bundle.mjs` follows relative CommonJS requires, explicitly includes the computed
worker/LSP entries, strips source-map links and embeds all std `.olx`/`.myc` files.
Built-ins remain real Node requires; only reads of embedded std files and the
bundled worker filename need adapters. There is no runtime extraction directory.

The installed universal Node is thinned to arm64; a thin-only Node binary is not
currently supported by this local recipe. Debug symbols are stripped and the two
upstream OpenSSL build-home prefixes are sanitized before compiler injection.
This changes upstream build metadata, not Mycel input. Both bundle and final
Mach-O are independently scanned for home paths and assistant imports. The
artifact test intentionally fails on injected forbidden tokens.

SEA follows Node's documented `--experimental-sea-config` + pinned
`postject@1.0.0-alpha.6` process. No snapshot/code cache, no inherited Node options.
The final executable is ad-hoc signed; the installer is **unsigned**, and neither
is notarized. Intel/x64 binaries are not produced or tested. Only the arm64 slice
is included; the Installer distribution enforces arm64/macOS 13.5+.

`package.mjs` stages only two commands and four support files, includes the same
LICENSE.txt (the dual licence assembled from `lang/` by `license.mjs`; packaging
refuses a stale copy) in the payload and Installer license screen, and adds welcome
and conclusion resources. `verify-package.mjs` expands it in a temporary directory
and repeats the real binary checks on the payload; it never installs it.

Read `verification-plan.md` before running acceptance. The inherited tour-test
exclusion is not applied: regressions.mjs runs every unchanged compiler test
and any fixture disagreement is reported as a failure. Detailed command/stdout/
stderr receipts go under ignored `work/`; reports summarize the exact results.
No speed or unseen capability claim is made from these synthetic acceptance tests.

After changing `lang/LICENSE*` or `lang/TRADEMARK.md`, run
`node lang/release/license.mjs --write`, then rebuild, reverify and update the
report's SHA-256. The website download link and deployment belong to the orchestrator.

Reference: https://github.com/nodejs/node/blob/v24.13.0/doc/api/single-executable-applications.md
