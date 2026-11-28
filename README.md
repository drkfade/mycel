# Mycel

Mycel is a friendly, typed programming language for your first program and your
hundredth. It compiles to sandboxed JavaScript and runs on Node, with no runtime
dependencies. Programs run with `mycel` (or its short alias `myc`: `myc hello.myc`); packages install with `ply`.

```mycel
print("hi")
```

That is a whole program.

**Try it in your browser:** https://ol1x.xyz/mycel/play/ (nothing to install).
**Learn it:** https://ol1x.xyz/mycel/learn/

## Install

macOS (Apple silicon), no sudo, installs into `~/.mycel/bin`:

```sh
curl -fsSL https://ol1x.xyz/mycel/install.sh | sh
```

Windows x64 (PowerShell; the Windows alpha goes live when its ZIP is on the
download page), installs per user into `%LOCALAPPDATA%\Mycel\bin`:

```powershell
irm https://ol1x.xyz/mycel/install.ps1 | iex
```

Both installers check the download's SHA-256 before installing. The macOS `.pkg`
and the Windows ZIP are on https://ol1x.xyz/mycel/download/.

Editor support: VS Code (`drkyy.mycel` on the Marketplace, source in
`vscode-mycel/`) and JetBrains IDEs ("Mycel Language", source in `intellij-ply/`).

## From source

Requires Node 24+.

```sh
cd lang
npm install          # TypeScript and Node types are development dependencies only
npm test             # build + the whole compiler suite
bin/mycel --version
bin/mycel new demo && cd demo && ../bin/mycel run
```

`lang/README.md` covers the language and the CLI; `lang/docs/SPEC.md` is the
specification; `lang/release/` builds the standalone macOS and Windows packages.

## Layout

| Path | What |
| --- | --- |
| `lang/` | compiler, standard library, language server, playground bundle, tests, release tooling |
| `vscode-mycel/` | VS Code extension |
| `intellij-ply/` | JetBrains plugin |

## License

Mycel is licensed under either of [Apache-2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT),
at your option. Programs you write in Mycel are yours. Bundled third-party
components keep their own licenses: see `lang/THIRD_PARTY.md`.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in Mycel by you, as defined in the Apache-2.0 license, shall be dual
licensed as above, without any additional terms or conditions.

## Trademark

The name "Mycel" and the Mycel logo identify the official project. Forks are
welcome but need their own name and logo; writing about Mycel, teaching it and
saying your code is written in Mycel are all fine. See [TRADEMARK.md](TRADEMARK.md).
