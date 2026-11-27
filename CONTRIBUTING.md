# Contributing to Mycel

Thanks for helping. Bug reports, small fixes, tests and docs are all welcome.
For a language change, open an issue first so we can agree on the design.

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by:` line certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/): that you
wrote the change or otherwise have the right to submit it under the project's
licenses. Git adds the line for you:

```sh
git commit -s -m "fmt: keep blank line after imports"
```

Contributions are accepted under Apache-2.0 OR MIT, the same as the project (see
`LICENSE`). Pull requests whose commits lack a sign-off can't be merged.

## Run the tests

Node 24 or newer.

```sh
cd lang
npm install
npm test                         # compiler, std, CLI, formatter, examples (no failures suppressed)
node lsp/test.js                 # language server
node --test lsp/uris.test.js
npm run fuzz                     # differential/grammar fuzzers

cd ../vscode-mycel
npm install
node --test test/*.test.js       # grammar, snippets, launch rules, LSP smoke

cd ../intellij-ply
scripts/build.sh test            # needs a local IntelliJ IDEA (set IDE_APP=/path/to/IDEA.app)
```

The Windows workflow (`.github/workflows/windows.yml`) runs the same suites plus
the installer tests on a real Windows runner.

## Making a change

- Keep changes small and focused; one fix per pull request.
- Add a test that fails without your change and passes with it.
- `bin/mycel fmt --check` must stay clean on the examples.
- Error messages say what went wrong, where, why and what to type instead.
- The compiler has no runtime npm dependencies; please keep it that way.

## Reporting bugs

Use the issue templates. Include the Mycel version (`mycel --version`), your OS,
the smallest program that shows the problem, and what you expected. Report
security problems (for example a way out of the capability sandbox) privately
through the repository's Security tab ("Report a vulnerability"), not in a
public issue.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
