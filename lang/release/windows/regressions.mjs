// Test the verified source snapshot with its matching generated web bundle.
// Never rewrites the checkout's site or suppresses a test/known failure.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.resolve(here, '../..');
const work = path.join(here, '../work/windows');
const compiler = path.join(work, 'compiler');
const receipt = JSON.parse(fs.readFileSync(path.join(work, 'build-receipt.json'), 'utf8'));
for (const [file, hash] of Object.entries(receipt.sources)) {
  if (createHash('sha256').update(fs.readFileSync(path.join(lang, file))).digest('hex') !== hash) throw new Error('Build inputs changed; rebuild first: ' + file);
}
for (const name of ['tests', 'examples', 'bin', 'web', 'compare', 'fuzz']) {
  const dest = path.join(compiler, name);
  fs.rmSync(dest, { recursive: true, force: true }); fs.cpSync(path.join(lang, name), dest, { recursive: true });
}
const site = path.join(work, 'site/public/mycel/play');
fs.mkdirSync(site, { recursive: true });
fs.cpSync(path.join(lang, '../site/public/mycel/play'), site, { recursive: true });
execFileSync(process.execPath, [path.join(compiler, 'node_modules/typescript/bin/tsc'), '-p', path.join(compiler, 'tsconfig.json')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(compiler, 'web/build.mjs')], { stdio: 'inherit' });
const tests = fs.readdirSync(path.join(compiler, 'dist/tests')).filter(x => x.endsWith('.test.js')).sort().map(x => path.join(compiler, 'dist/tests', x));
execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { cwd: compiler, stdio: 'inherit' });
