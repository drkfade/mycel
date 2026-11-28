// Packages only the executable and end-user files; no loose compiler source (that lives in the open repo).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { checkArtifact } from './check-artifact.mjs';
import { checkReleaseLicense } from './license.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const windows = path.join(here, 'windows');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
checkReleaseLicense(); // refuse to package a stale or proprietary licence text
checkArtifact(path.join(dist, 'mycel.exe'));
const receipt = JSON.parse(fs.readFileSync(path.join(here, 'work/windows/build-receipt.json'), 'utf8'));
if (receipt.exeSha256 !== sha(path.join(dist, 'mycel.exe'))) throw new Error('Executable does not match verified build receipt');
// Small ZIP32 writer using Node built-ins, avoiding a host-specific zip/PowerShell dependency.
// UTF-8 names, DEFLATE, no directories, extras, source files or absolute paths.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const entries = [
  ['mycel.exe', fs.readFileSync(path.join(dist, 'mycel.exe'))],
  ['ply.cmd', Buffer.from('@echo off\r\n"%~dp0mycel.exe" %*\r\n')],
  ...['LICENSE.txt', 'NODE-LICENSE.txt'].map(name => [name, fs.readFileSync(path.join(here, name))]),
  ...['README-windows.txt', 'install.ps1', 'uninstall.ps1'].map(name => [name, fs.readFileSync(path.join(windows, name))]),
];
const locals = [], directory = [];
let offset = 0;
for (const [name, data] of entries) {
  const label = Buffer.from(name), compressed = deflateRawSync(data, { level: 9 }), crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0x5d68, 12); // fixed DOS date: 2026-11-08
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(label.length, 26);
  locals.push(header, label, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); header.copy(central, 6, 4, 30);
  central.writeUInt32LE(offset, 42); directory.push(central, label);
  offset += header.length + label.length + compressed.length;
}
const size = directory.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
const name = 'Mycel-0.2.0-alpha-windows-x64.zip';
fs.writeFileSync(path.join(dist, name), Buffer.concat([...locals, ...directory, end]));
const hash = sha(path.join(dist, name));
fs.writeFileSync(path.join(dist, name + '.sha256'), `${hash}  ${name}\n`);
const bootstrap = fs.readFileSync(path.join(windows, 'bootstrap.ps1'), 'utf8').replace('@ZIP_SHA256@', hash);
if (bootstrap.includes('@ZIP_SHA256@') || /\bexit\b/i.test(bootstrap)) throw new Error('Invalid bootstrap');
fs.writeFileSync(path.join(dist, 'install.ps1'), bootstrap);
fs.writeFileSync(path.join(here, 'work/windows/package-receipt.json'), JSON.stringify({ archive: name, sha256: hash, bytes: fs.statSync(path.join(dist, name)).size, files: Object.fromEntries(entries.map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')])), installerSha256: sha(path.join(dist, 'install.ps1')) }, null, 2) + '\n');
console.log(`${hash}  ${name} (${fs.statSync(path.join(dist, name)).size} bytes)`);
console.log('Staged dist/install.ps1. Publish only after review; nothing deployed.');
