// Run the existing compiler suite in the private build snapshot, preserving repo examples/site.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.dirname(here);
const compiler = path.join(here, 'work/compiler');
for (const name of ['tests', 'examples', 'bin', 'web', 'compare']) {
  const dest = path.join(compiler, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(lang, name), dest, { recursive: true });
}
fs.cpSync(path.join(lang, '../site/public/mycel/play'), path.join(here, 'work/site/public/mycel/play'), { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: compiler, stdio: 'inherit' });
const tests = fs.readdirSync(path.join(compiler, 'dist/tests')).filter(x => x.endsWith('.test.js')).sort().map(x => path.join(compiler, 'dist/tests', x));
const home = path.join(here, 'work/regression-home'); fs.mkdirSync(home, { recursive: true });
// Run every unchanged test, including pre-existing fixture disagreements.
execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
  cwd: compiler, env: { ...process.env, HOME: home }, stdio: 'inherit',
});
