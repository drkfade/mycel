Mycel 0.2 alpha — Windows x64
Copyright (c) 2026 drky. Open source: Apache-2.0 OR MIT, at your option; see LICENSE.txt.

STATUS: Windows executable and installers are untested on real Windows until
private Windows CI runs. The SEA is unsigned; modifying Node's PE invalidates
its upstream signature. This is a private review build, not a verified release.
No separate Node install is needed. Requires Windows x64 supported by Node 24
(Windows 10 / Server 2016 or later). No administrator rights are needed.

Once published, install from PowerShell:
  irm https://ol1x.xyz/mycel/install.ps1 | iex
The installer pins the ZIP's SHA-256, installs to %LOCALAPPDATA%\Mycel\bin,
and adds that directory to your user PATH and the current PowerShell PATH.
The hash protects the archive; the HTTPS installer itself is the trust root.

Offline: extract all ZIP files to one directory, inspect LICENSE.txt, then run:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
Or run .\mycel.exe directly from the extracted directory.

  mycel --version
  mycel new hello
  cd hello
  mycel run
  mycel test
  ply help install
  ply run

Files use .myc (.olx also supported). CRLF and LF source files are supported.
Quote paths containing spaces. mycel.exe is the CLI and package manager;
ply.cmd is its sibling alias and forwards arguments using normal cmd rules.
From PowerShell: & "C:\path with spaces\mycel.exe" run .\hello.myc

Filesystem/process/network access needs explicit capabilities, for example:
  mycel run app.myc --allow-read=data --allow-write=data --allow-run=git
std.process passes argv directly to executables without a shell; cmd built-ins
(echo, dir) and .cmd/.bat files are not native executables. Use an executable.
Do not wrap arguments for cmd.exe yourself. The host quotes argv for Windows.
Windows device namespaces, alternate data streams and DOS device paths are
rejected by file capabilities. Junctions/symlinks are resolved before grants;
a link swap between checking and opening remains the documented TOCTOU limit.

Includes run/check/test/fmt/doc/repl/LSP and local Mycel package commands.
Standalone `mycel build` needs the private source SDK and separate Node; this
alpha reports that limitation. Foreign-language package adapters are absent;
std.ui has no native desktop renderer. No speed/compatibility claim is made.

Uninstall (programs and %USERPROFILE%\.ply are preserved):
  & "$env:LOCALAPPDATA\Mycel\bin\uninstall.ps1"
If script policy blocks the offline uninstall:
  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Mycel\bin\uninstall.ps1"

Learn: https://ol1x.xyz/mycel/learn/
The compiler source, bundle and build snapshots must remain private.
