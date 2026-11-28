// Inspect and execute an expanded payload; never invoke Installer or write /usr/local.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkArtifact } from './check-artifact.mjs';
import { checkReleaseLicense } from './license.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, 'dist/Mycel-0.2.1-alpha.pkg');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mycel-pkg-'));
const expanded = path.join(root, 'expanded');
const expected = [
  'usr/local/bin/mycel', 'usr/local/bin/myc', 'usr/local/bin/ply',
  'usr/local/share/mycel/LICENSE.txt', 'usr/local/share/mycel/README.txt',
  'usr/local/share/mycel/NODE-LICENSE.txt', 'usr/local/share/mycel/uninstall.sh',
].sort();
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
try {
  const listed = run('/usr/sbin/pkgutil', ['--payload-files', pkg]);
  console.log(listed);
  const signature = spawnSync('/usr/sbin/pkgutil', ['--check-signature', pkg], { encoding: 'utf8' });
  assert.equal(signature.status, 1);
  assert.match(signature.stdout + signature.stderr, /Status: no signature/);
  console.log(signature.stdout + signature.stderr);
  run('/usr/sbin/pkgutil', ['--expand-full', pkg, expanded]);
  const component = path.join(expanded, 'mycel-core.pkg');
  const payload = path.join(component, 'Payload');
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const f = path.join(dir, name), st = fs.lstatSync(f);
      assert.equal(st.isSymbolicLink(), false, f);
      if (st.isDirectory()) walk(f);
      else files.push(path.relative(payload, f));
    }
  }
  walk(payload);
  assert.deepEqual(files.sort(), expected);
  const binary = path.join(payload, 'usr/local/bin/mycel');
  for (const file of expected) {
    const p = path.join(payload, file);
    const mode = fs.statSync(p).mode & 0o777;
    assert.equal(mode, file.endsWith('.txt') ? 0o644 : 0o755, file);
    checkArtifact(p);
    const original = path.join(here, file.startsWith('usr/local/bin/') ? 'dist/' + path.basename(file) : path.basename(file));
    assert.deepEqual(fs.readFileSync(p), fs.readFileSync(original), file);
  }
  const distribution = fs.readFileSync(path.join(expanded, 'Distribution'), 'utf8');
  assert.match(distribution, /hostArchitectures="arm64"/);
  assert.match(distribution, /os-version min="13\.5"/);
  for (const name of ['welcome', 'license', 'conclusion']) assert.match(distribution, new RegExp('<' + name + ' file='));
  assert.deepEqual(fs.readFileSync(path.join(expanded, 'Resources/LICENSE.txt')), fs.readFileSync(path.join(here, 'LICENSE.txt')));
  // The licence pane and the installed copy must be the dual licence assembled from lang/, never the old EULA.
  assert.equal(fs.readFileSync(path.join(expanded, 'Resources/LICENSE.txt'), 'utf8'), checkReleaseLicense());
  for (const name of ['welcome', 'conclusion']) assert.match(fs.readFileSync(path.join(expanded, `Resources/${name}.html`), 'utf8'), /mycel hello\.myc/);
  const info = fs.readFileSync(path.join(component, 'PackageInfo'), 'utf8');
  assert.match(info, /identifier="xyz\.ol1x\.mycel\.pkg"/);
  assert.doesNotMatch(info, /<scripts[ >]/);
  const bom = run('/usr/bin/lsbom', ['-p', 'fMUG', path.join(component, 'Bom')]);
  assert.ok(bom.trim().split('\n').every(line => /root\twheel$/.test(line)), bom);
  assert.match(run('/usr/bin/file', [binary]), /Mach-O 64-bit executable arm64/);
  run('/usr/bin/codesign', ['--verify', '--strict', binary]);
  const libraries = run('/usr/bin/otool', ['-L', binary]);
  for (const line of libraries.trim().split('\n').slice(1)) assert.match(line.trim(), /^\/(System\/Library|usr\/lib)\//);
  const uninstall = path.join(payload, 'usr/local/share/mycel/uninstall.sh');
  run('/bin/sh', ['-n', uninstall]);
  const dryRun = run('/bin/sh', [uninstall, '--dry-run']);
  assert.match(dryRun, /User projects\/cache are retained/);
  console.log(dryRun);
  const binaryReceipt = path.join(here, 'work/payload-verification.json');
  execFileSync(process.execPath, [path.join(here, 'verify.mjs'), binary, binaryReceipt], { stdio: 'inherit' });
  const summary = { package: path.basename(pkg), sha256: createHash('sha256').update(fs.readFileSync(pkg)).digest('hex'),
    bytes: fs.statSync(pkg).size, files, signature: (signature.stdout + signature.stderr).trim(), bom,
    resourcesVerified: true, payloadExecutions: JSON.parse(fs.readFileSync(binaryReceipt)).receipts.length,
    installed: false, dryRun: dryRun.trim() };
  fs.writeFileSync(path.join(here, 'work/package-verification.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`PASS package: ${summary.bytes} bytes, SHA-256 ${summary.sha256}`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
