import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkArtifact } from './check-artifact.mjs';
import { checkReleaseLicense } from './license.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const work = path.join(here, 'work');
const root = path.join(work, 'payload');
const resources = path.join(work, 'resources');
checkReleaseLicense(); // refuse to package a stale or proprietary licence text
fs.mkdirSync(resources, { recursive: true });
for (const name of ['welcome.html', 'conclusion.html']) fs.copyFileSync(path.join(here, 'resources', name), path.join(resources, name));
fs.copyFileSync(path.join(here, 'LICENSE.txt'), path.join(resources, 'LICENSE.txt'));
// Only remove our own staging tree, never installed files.
fs.rmSync(root, { recursive: true, force: true });
const bin = path.join(root, 'usr/local/bin');
const share = path.join(root, 'usr/local/share/mycel');
fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(share, { recursive: true });
for (const name of ['mycel', 'ply']) {
  checkArtifact(path.join(dist, name));
  fs.copyFileSync(path.join(dist, name), path.join(bin, name));
  fs.chmodSync(path.join(bin, name), 0o755);
}
for (const name of ['LICENSE.txt', 'README.txt', 'NODE-LICENSE.txt', 'uninstall.sh']) {
  fs.copyFileSync(path.join(here, name), path.join(share, name));
  fs.chmodSync(path.join(share, name), name.endsWith('.sh') ? 0o755 : 0o644);
}
for (const dir of ['usr', 'usr/local', 'usr/local/bin', 'usr/local/share', 'usr/local/share/mycel']) fs.chmodSync(path.join(root, dir), 0o755);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: here, stdio: 'inherit' });
run('/usr/bin/pkgbuild', ['--root', root, '--install-location', '/', '--ownership', 'recommended',
  '--identifier', 'xyz.ol1x.mycel.pkg', '--version', '0.1.0', path.join(work, 'mycel-core.pkg')]);
run('/usr/bin/productbuild', ['--distribution', path.join(here, 'Distribution.xml'), '--resources', resources,
  '--package-path', work, path.join(dist, 'Mycel-0.1.0-alpha.pkg')]);
run('/usr/sbin/pkgutil', ['--payload-files', path.join(dist, 'Mycel-0.1.0-alpha.pkg')]);
// Unsigned is deliberate; pkgutil returns nonzero when no signature is present.
try { run('/usr/sbin/pkgutil', ['--check-signature', path.join(dist, 'Mycel-0.1.0-alpha.pkg')]); }
catch (e) { if (e.status !== 1) throw e; }
