// Private, reproducible cross-build. Never executes node.exe or installs Mycel.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { bundle } from './bundle.mjs';
import { checkArtifact } from './check-artifact.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.dirname(here);
const work = path.join(here, 'work/windows');
const dist = path.join(here, 'dist');
const version = '24.13.0';
// Published by nodejs/release-keys and Node's release documentation (Marco Ippolito).
const signer = 'CC68F5A3106FF448322E48ED27F5E38D5B0A215F';
if (process.version !== 'v' + version) throw new Error('Build with Node ' + version + ' (same version as the injected runtime).');
fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(dist, { recursive: true });
const run = (cmd, args, cwd = work) => execFileSync(cmd, args, { cwd, stdio: 'inherit', windowsHide: true });
const npm = (args, cwd = work) => process.platform === 'win32'
  ? run(process.execPath, [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args], cwd)
  : run('npm', args, cwd);
async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
}
const tools = path.join(work, 'tools'); fs.mkdirSync(tools, { recursive: true });
fs.writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ private: true, dependencies: { openpgp: '6.3.2', postject: '1.0.0-alpha.6' } }, null, 2));
npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(work, 'npm-cache')], tools);
const pgp = await import(pathToFileURL(path.join(tools, 'node_modules/openpgp/dist/node/openpgp.mjs')));
const base = `https://nodejs.org/download/release/v${version}/`;
await download(base + 'SHASUMS256.txt.asc', path.join(work, 'SHASUMS256.txt.asc'));
await download(base + 'SHASUMS256.txt', path.join(work, 'SHASUMS256.txt'));
await download(`https://raw.githubusercontent.com/nodejs/release-keys/HEAD/keys/${signer}.asc`, path.join(work, 'node-release-key.asc'));
const key = await pgp.readKey({ armoredKey: fs.readFileSync(path.join(work, 'node-release-key.asc'), 'utf8') });
if (key.getFingerprint().toUpperCase() !== signer) throw new Error('Unexpected Node release signing key fingerprint');
const message = await pgp.readCleartextMessage({ cleartextMessage: fs.readFileSync(path.join(work, 'SHASUMS256.txt.asc'), 'utf8') });
const verified = await pgp.verify({ message, verificationKeys: key });
if (verified.signatures.length !== 1) throw new Error('Expected exactly one release signature');
await verified.signatures[0].verified;
const normalize = s => s.replace(/\r\n/g, '\n').trimEnd();
if (normalize(verified.data) !== normalize(fs.readFileSync(path.join(work, 'SHASUMS256.txt'), 'utf8'))) throw new Error('Unsigned checksum file differs from signed data');
const expected = /^([a-f0-9]{64})\s+win-x64\/node\.exe$/m.exec(normalize(verified.data))?.[1];
if (!expected) throw new Error('Signed checksum for win-x64/node.exe missing');
const node = path.join(work, 'node.exe');
await download(base + 'win-x64/node.exe', node);
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (sha(node) !== expected) throw new Error('Windows Node SHA-256 mismatch');
console.log(`Verified Node release signature ${signer}; node.exe SHA-256 ${expected}`);
// Keep this snapshot separate from the existing macOS release work.
const compiler = path.join(work, 'compiler'); fs.mkdirSync(compiler, { recursive: true });
const sources = {};
for (const name of ['src', 'std', 'lsp', 'tools', 'bridges', 'package.json', 'tsconfig.json']) {
  const dest = path.join(compiler, name); fs.rmSync(dest, { force: true, recursive: true });
  fs.cpSync(path.join(lang, name), dest, { recursive: true });
  function hash(file) {
    if (fs.statSync(file).isDirectory()) for (const child of fs.readdirSync(file).sort()) hash(path.join(file, child));
    else sources[path.relative(compiler, file).split(path.sep).join('/')] = sha(file);
  }
  hash(dest);
}
fs.writeFileSync(path.join(work, 'source-manifest.json'), JSON.stringify(sources, null, 2) + '\n');
npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(work, 'npm-cache')], compiler);
npm(['run', 'build'], compiler);
const script = path.join(work, 'mycel.cjs'); fs.writeFileSync(script, bundle(compiler)); checkArtifact(script);
const config = { main: "mycel.cjs", output: "mycel.blob", disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, execArgvExtension: 'none' };
fs.writeFileSync(path.join(work, 'sea-config.json'), JSON.stringify(config, null, 2));
run(process.execPath, ['--experimental-sea-config', 'sea-config.json']);
const binary = path.join(dist, 'mycel.exe'); fs.copyFileSync(node, binary);
run(process.execPath, [path.join(tools, 'node_modules/postject/dist/cli.js'), binary, 'NODE_SEA_BLOB', path.join(work, config.output), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);
checkArtifact(binary);
// Check PE architecture, injected blob bytes and enabled fuse without executing Windows code.
const bytes = fs.readFileSync(binary), pe = bytes.readUInt32LE(0x3c);
if (bytes.toString('ascii', 0, 2) !== 'MZ' || bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Not an x64 PE executable');
if (!bytes.includes(fs.readFileSync(path.join(work, config.output))) || !bytes.includes(Buffer.from('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2:1'))) throw new Error('SEA injection missing');
fs.writeFileSync(path.join(work, 'build-receipt.json'), JSON.stringify({ nodeVersion: version, host: `${process.platform}-${process.arch}`, signer, nodeSha256: expected, blobSha256: sha(path.join(work, config.output)), bundleSha256: sha(script), exeSha256: sha(binary), sources, executedOnWindows: false }, null, 2) + '\n');
console.log(`Built Windows x64 SEA: ${binary} (${bytes.length} bytes). Not executed on Windows.`);
