# Windows x64 release

Mycel is open source (Apache-2.0 OR MIT, see `lang/LICENSE`). Release
deliverables are the ZIP, its checksum and the rendered
`dist/install.ps1` bootstrap. No site files are edited here.
The existing macOS recipe and its output are separate and retained.

Build on this Mac with **Node 24.13.0** (npm is a build dependency only):

```sh
node lang/release/build-windows.mjs
node lang/release/package-windows.mjs
node lang/release/windows/smoke.mjs lang/release/work/windows/mycel.cjs
```

The build fetches official `v24.13.0/win-x64/node.exe`, SHASUMS256.txt and its
cleartext signature from nodejs.org. OpenPGP.js 6.3.2 verifies the signature
against the pinned Node release primary fingerprint
`CC68F5A3106FF448322E48ED27F5E38D5B0A215F` (Marco Ippolito), checks that signed
and plain checksum lists agree, then checks node.exe's SHA-256. The raw key comes
from the official nodejs/release-keys repository; its fingerprint must match.
Tampering with any of these inputs fails the build before injection.

Sources are copied to `work/windows/compiler`, separately from macOS staging,
and compiled with the pinned package.json development dependencies. The exact
same `bundle.mjs` loader embeds CLI, worker, LSP and std. It does not extract
compiler source at runtime. Source hashes and signature/runtime/blob/bundle/exe
hashes are recorded in `work/windows/build-receipt.json`. Build-tool lockfiles
under work retain resolved package integrities. Built-ins are actual Node APIs.

Node 24 explicitly permits cross-platform blobs when `useSnapshot` and
`useCodeCache` are false. The host and injected runtime versions must match.
Relative SEA main/output names keep the build machine's paths out of the blob.
`postject@1.0.0-alpha.6` injects that blob into the pristine Windows x64 PE.
There is no Mach-O processing, signing, runtime patching or Authenticode claim.
Node's original signature becomes invalid; postject's signature warning is
expected. The final x64 PE, embedded blob and enabled fuse are checked, and both
bundle and executable pass the existing forbidden-home/assistant byte scan.
These inspections do not prove Windows execution.

`package-windows.mjs` uses Node built-ins to write an eight-file ZIP: mycel.exe,
myc.cmd, ply.cmd, LICENSE.txt, NODE-LICENSE.txt, README-windows.txt, install.ps1 and
uninstall.ps1. LICENSE.txt is the dual licence assembled by `license.mjs`, byte-identical to the
macOS one. The packaged installer accepts an extracted directory and installs per
user to `%LOCALAPPDATA%\Mycel\bin`, checks the executable version, stages a
replacement while preserving unrelated files/directories, rolls back failed
replacements and updates user/current PATH without elevation. Uninstall removes
only the known files and exact PATH entry, preserving user files and `.ply`.

The separate `dist/install.ps1` is rendered from `windows/bootstrap.ps1` with
the **actual ZIP SHA-256 pinned in the script**. It downloads
`https://ol1x.xyz/mycel/download/Mycel-0.2.1-alpha-windows-x64.zip`, verifies it
before extracting/executing, validates archive names, and invokes the offline
installer. Failures return to the caller; no installer uses `exit`, modifies
machine PATH or changes machine execution policy. A trusted HTTPS copy of the
bootstrap is the trust root; its embedded checksum does not authenticate itself.

Once published, the ZIP and rendered installer expose:

```powershell
irm https://ol1x.xyz/mycel/install.ps1 | iex
```

**Run on real Windows (GitHub windows-latest) on 2026-11-26: green.** In the public repository the workflow is
`.github/workflows/windows.yml` (source: `public/.github/workflows/windows.yml`,
exported by `export-public.sh`). It runs the original
compiler suite without suppressing known failures, builds a fresh Windows SEA,
smokes it, downloads the published Mac-built ZIP against a provided
hash, and smokes that executable and its ply alias. It also exercises bootstrap,
reinstall, PATH/uninstall and tampered downloads under Windows PowerShell 5.1 and
PowerShell 7. No artifact/source upload or deployment is configured.

Run `windows/test-installers.ps1` only on a disposable Windows user such as CI;
it restores user PATH, uses a temporary LOCALAPPDATA and mocks HTTP with the
staged ZIP. On this Mac only PowerShell parsing and CJS execution can be proved.
`windows/verification-plan.md` fixes the acceptance cases before smoke execution.

References:
- https://github.com/nodejs/node/blob/v24.13.0/doc/api/single-executable-applications.md
- https://nodejs.org/download/release/v24.13.0/SHASUMS256.txt
- https://github.com/nodejs/release-keys
