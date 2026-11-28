// Run from any directory. Does not install or publish anything.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bundle } from './bundle.mjs';
import { checkArtifact } from './check-artifact.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.dirname(here);
if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.13.0') {
  throw new Error('This release builder requires Node 24.13.0 on macOS arm64 (matching NODE-LICENSE.txt).');
}
const run = (cmd, args, cwd = here) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const dist = path.join(here, 'dist');
const work = path.join(here, 'work');
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(work, { recursive: true });
// A clean, private source snapshot proves this build does not use the checkout's
// optional node_modules symlink. Only declared build dependencies are installed.
const compiler = path.join(work, 'compiler');
fs.mkdirSync(compiler, { recursive: true });
const sourceHashes = {};
for (const name of ['src', 'std', 'lsp', 'tools', 'package.json', 'tsconfig.json']) {
  const dest = path.join(compiler, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(lang, name), dest, { recursive: true });
  function hash(file) {
    if (fs.statSync(file).isDirectory()) for (const child of fs.readdirSync(file).sort()) hash(path.join(file, child));
    else sourceHashes[path.relative(compiler, file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  hash(dest);
}
fs.writeFileSync(path.join(work, 'source-manifest.json'), JSON.stringify(sourceHashes, null, 2) + '\n');
fs.copyFileSync(path.join(work, 'source-manifest.json'), path.join(here, 'source-manifest.json'));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(work, 'npm-cache')], compiler);
run('npm', ['run', 'build'], compiler);
fs.writeFileSync(path.join(dist, 'mycel.cjs'), bundle(compiler));
checkArtifact(path.join(dist, 'mycel.cjs'));
fs.writeFileSync(path.join(work, 'sea-config.json'), JSON.stringify({
  main: '../dist/mycel.cjs', output: 'mycel.blob', disableExperimentalSEAWarning: true,
  useSnapshot: false, useCodeCache: false, execArgvExtension: 'none',
}, null, 2) + '\n');
run(process.execPath, ['--experimental-sea-config', 'sea-config.json'], work);
const binary = path.join(dist, 'mycel');
// The installed Node may be universal. Thin to arm64 before postject modifies the Mach-O.
run('/usr/bin/lipo', [process.execPath, '-thin', 'arm64', '-output', binary]);
run('/usr/bin/codesign', ['--remove-signature', binary]);
run('/usr/bin/strip', ['-S', '-x', binary]);
// Node's upstream OpenSSL build metadata contains the build farm's home directory.
// Sanitize ONLY the pristine runtime, before injecting our script, keeping Mach-O offsets unchanged.
// Compiler content is never scrubbed: the separate artifact scan must reject leaks there.
const runtime = fs.readFileSync(binary);
const prefix = Buffer.from('/Users/');
let at = 0, sanitized = 0;
while ((at = runtime.indexOf(prefix, at)) !== -1) {
  runtime.write('/build/', at, 'ascii'); at += prefix.length; sanitized++;
}
fs.writeFileSync(binary, runtime);
console.log(`Removed upstream debug symbols; sanitized ${sanitized} runtime build-path prefixes.`);
run('npx', ['--yes', '--cache', path.join(work, 'npm-cache'), 'postject@1.0.0-alpha.6', binary,
  'NODE_SEA_BLOB', path.join(work, 'mycel.blob'), '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--macho-segment-name', 'NODE_SEA']);
run('/usr/bin/codesign', ['--sign', '-', '--identifier', 'xyz.ol1x.mycel', binary]);
fs.chmodSync(binary, 0o755);
fs.writeFileSync(path.join(dist, 'ply'), '#!/bin/sh\nexec "$(dirname "$0")/mycel" "$@"\n', { mode: 0o755 });
checkArtifact(binary);
run(binary, ['--version']);
