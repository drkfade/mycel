#!/bin/sh
# Makes dist/mycel-<version>-macos-arm64.tar.gz (what site/public/mycel/install.sh fetches) from the verified dist/mycel.
# Layout: mycel-<version>/{bin/{mycel,myc,ply},LICENSE.txt,NODE-LICENSE.txt}. Run after package.mjs / verify-package.mjs.
set -eu
cd "$(dirname "$0")"
VERSION="0.2.1-alpha"
STAGE="work/tarball/mycel-$VERSION"
rm -rf work/tarball && mkdir -p "$STAGE/bin"
cp dist/mycel "$STAGE/bin/mycel" && chmod 755 "$STAGE/bin/mycel"
ln -s mycel "$STAGE/bin/myc"
ln -s mycel "$STAGE/bin/ply"
cp LICENSE.txt NODE-LICENSE.txt "$STAGE/"
COPYFILE_DISABLE=1 tar -czf "dist/mycel-$VERSION-macos-arm64.tar.gz" -C work/tarball "mycel-$VERSION"
shasum -a 256 "dist/mycel-$VERSION-macos-arm64.tar.gz"
