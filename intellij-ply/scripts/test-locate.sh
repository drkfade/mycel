#!/bin/sh
# Windows/macOS CLI lookup tests with a plain JDK (no IDE jars): compiles PlyLocate alone.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
javac --release 21 -d "$OUT" "$HERE/src/ply/PlyLocate.java" "$HERE/test/ply/PlyLocateTests.java"
java -cp "$OUT" ply.PlyLocateTests
