# Mycel third-party components

Mycel itself is licensed under Apache-2.0 OR MIT, at your option (see `LICENSE`,
`LICENSE-APACHE`, `LICENSE-MIT`); the name and logo are covered by `TRADEMARK.md`.
The components below keep their own licenses. All of them allow redistribution
alongside Mycel under either of its licenses; each shipped one has its notice
shipped with it.

## Shipped inside the release packages (macOS pkg/tarball, Windows ZIP)

| Component | Version | Role | License | Notice |
| --- | --- | --- | --- | --- |
| Node.js | 24.13.0 | Embedded SEA runtime of `mycel` / `mycel.exe` | MIT; its bundled dependencies (V8, libuv, OpenSSL, ICU, zlib, …) carry their own permissive notices | full text in `release/NODE-LICENSE.txt`, shipped beside `LICENSE.txt` in every package |

The release runtime is modified: thin arm64 slice (macOS), debug symbols stripped,
upstream build-home prefixes sanitized in place, SEA script injected, ad-hoc signed.
Node's license file is copied from its exact v24.13.0 tag:
https://github.com/nodejs/node/blob/v24.13.0/LICENSE.

The compiler has no runtime npm dependencies: `lang/src`, `lang/lsp` and `lang/web`
import only Node built-ins.

## Shipped inside the VS Code extension (`vscode-mycel`, runtime dependencies)

| Component | Version | License |
| --- | --- | --- |
| vscode-languageclient | 9.0.1 | MIT |
| vscode-languageserver-protocol | 3.17.5 | MIT |
| vscode-languageserver-types | 3.17.5 | MIT |
| vscode-jsonrpc | 8.2.0 | MIT |
| minimatch | 5.1.9 | ISC |
| brace-expansion | 2.1.7 | MIT |
| balanced-match | 1.0.2 | MIT |
| semver | 7.8.6 | ISC |

Each keeps its own license file inside the `.vsix` (`extension/node_modules/*/`).
The JetBrains plugin bundles no third-party code; it compiles against the IDE's own jars.

## Build and publishing tools only (not redistributed)

| Component | Version | Used by | License |
| --- | --- | --- | --- |
| TypeScript | 5.8.3 | `lang` build | Apache-2.0 |
| @types/node | 24.10.1 | `lang` build | MIT |
| postject | 1.0.0-alpha.6 | SEA injection via npx | MIT, with Apache-2.0 LIEF; https://github.com/nodejs/postject/blob/v1.0.0-alpha.6/LICENSE |
| @vscode/vsce | 3.2.1 | packaging the `.vsix` | MIT |
| @vscode/vsce-sign (+ platform binary) | — | pulled in by vsce | Microsoft license ("SEE LICENSE IN LICENSE.txt"); not open source, never shipped or committed |
| ovsx | 0.10.1 | Open VSX publishing | EPL-2.0; a tool only, its license does not reach Mycel |
| vscode-textmate, vscode-oniguruma | 9.2.0, 2.0.1 | grammar tests | MIT |

The rest of the editor dev tree (≈210 packages) is MIT/ISC/BSD/Apache/BlueOak/0BSD/
Python-2.0 (argparse); none is shipped. `node_modules/` is never committed or exported.

postject npm integrity:
`sha512-b9Eb8h2eVqNE8edvKdwqkrY6O7kAwmI8kcnBv1NScolYJbo59XUF0noFq+lxbC1yN20bmC0WBEbDC5H/7ASb0A==`.
