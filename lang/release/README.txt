Mycel 0.1 alpha (0.1.0) for macOS Apple silicon (arm64)
Copyright (c) 2026 drky. Open source: Apache-2.0 OR MIT, at your option.

Install
Download Mycel-0.1.0-alpha.pkg from https://ol1x.xyz/mycel/ when published.
This preview package is unsigned and not notarized. Try right-click -> Open.
On macOS versions that do not offer that override, try opening it once, then
System Settings -> Privacy & Security -> Open Anyway. Confirm only if you trust
the download. See https://support.apple.com/en-us/102445 for Apple's guidance.
The installer requests an administrator password. It installs into /usr/local;
it does not edit your shell profile. If needed, add /usr/local/bin to your PATH.
Node is included inside mycel; no separate Node installation is needed to run it.

First program
Create hello.myc containing:
  print("hi")
Then run:
  mycel hello.myc
Or create a project:
  mycel new demo
  cd demo
  mycel run
  mycel test

What works
One-line scripts; .myc and .olx files; typed/inferred variables; functions;
f-strings; lists, maps and loops; classes, structs, enums and match; diagnostics;
local module imports; check/test/fmt/doc/repl; stdin input(); worker-isolated runs;
the std library, including JSON, math, files, time and explicit capability grants.
The ply command runs the same CLI and shows package installation syntax with:
  ply help install
Mycel package dependencies can use paths or the local registry; there is no
public package registry in this alpha.

Limits
Foreign package imports/install (Python, JS/TS, Java, Rust, Go, Swift) are not
available in this packaged alpha. Help lists their planned install flag syntax;
that does not mean those adapters ship here.
std.ui has browser UI primitives; the macOS CLI has no native window renderer.
The playground's Counter and Todo sources execute but display no window here.
std.db is an early SQLite wrapper, not a production database API; SQLite uses
Node's experimental node:sqlite. Back up data; do not rely on this alpha for
critical storage. Desktop UI/database work and foreign adapters remain in progress.
This download targets Apple silicon only. Intel, Linux and Windows binaries
are not included or verified. The compiler is experimental; bugs are expected.
The JavaScript export command (mycel build) requires the source SDK and Node;
use mycel run for this standalone download.

Learn and editors
https://ol1x.xyz/mycel/learn/
Browser playground: https://ol1x.xyz/mycel/play/
VS Code: drkyy.mycel
  https://marketplace.visualstudio.com/items?itemName=drkyy.mycel
JetBrains Marketplace: search "Mycel Language".

Uninstall
  sudo /bin/sh /usr/local/share/mycel/uninstall.sh
This removes only the installed Mycel files and package receipt. It leaves your
programs, projects and ~/.ply package cache alone. The script supports --dry-run.
License (Apache-2.0 OR MIT, plus the name/logo note): /usr/local/share/mycel/LICENSE.txt
Third-party notices: /usr/local/share/mycel/NODE-LICENSE.txt
This artifact has not been published by the release builder.
