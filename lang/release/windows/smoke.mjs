// Same assertions run against the private CJS bundle on Mac and actual SEA on Windows.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.resolve(process.argv[2] ?? path.join(here, '../dist/mycel.exe'));
const bundled = artifact.endsWith('.cjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mycel smoke Ω '));
const home = path.join(work, 'home'); fs.mkdirSync(home);
const env = { ...process.env, HOME: home, USERPROFILE: home, PLY_REGISTRY: path.join(home, '.ply/registry'), NODE_OPTIONS: '', PATH: process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin' };
const receipts = [];
let cwd = work;
function run(label, args, { status = 0, output, error, input = '', alias = false } = {}) {
  let command = bundled ? process.execPath : artifact;
  let argv = bundled ? [artifact, ...args] : args;
  if (alias && !bundled) {
    if (process.platform !== 'win32') throw new Error('The Windows alias needs Windows');
    command = process.env.ComSpec ?? path.join(process.env.SystemRoot, 'System32/cmd.exe');
    // Only fixed smoke arguments are joined. Production process execution never uses a shell.
    argv = ['/d', '/s', '/c', `""${path.join(path.dirname(artifact), 'ply.cmd')}" ${args.map(a => '"' + a + '"').join(' ')}"`];
  }
  // verbatim for the cmd.exe alias: Node would otherwise re-quote the whole /c string (first real-Windows run:
  // '""D:\\…\\ply.cmd" "--version""' is not recognized as an internal or external command).
  const r = spawnSync(command, argv, { cwd, env, input, encoding: 'utf8', timeout: 20000, windowsHide: true, windowsVerbatimArguments: alias && !bundled });
  receipts.push({ label, args, status: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error?.message });
  assert.equal(r.status, status, `${label}: ${r.error?.message ?? ''}\n${r.stdout}\n${r.stderr}`);
  if (typeof output === 'string') assert.equal(r.stdout, output, label);
  if (output instanceof RegExp) assert.match(r.stdout, output, label);
  if (error) assert.match(r.stderr, error, label);
  return r;
}
try {
  run('version', ['--version'], { output: 'mycel 0.2.0\n' });
  run('welcome', [], { output: /Welcome to Mycel/ });
  fs.mkdirSync(path.join(work, 'nested'));
  fs.writeFileSync(path.join(work, 'nested/greet.olx'), 'pub fn message() -> String => "hello Ω"\r\n');
  fs.writeFileSync(path.join(work, 'hello.myc'), 'import nested.greet\r\nprint(greet.message())\r\n');
  run('CRLF mixed-extension import', ['hello.myc'], { output: 'hello Ω\n' });
  run('isolated CRLF import', ['run', 'hello.myc', '--isolated'], { output: 'hello Ω\n' });
  fs.writeFileSync(path.join(work, 'loop.myc'), 'while true { }\r\n');
  run('worker timeout', ['run', 'loop.myc', '--isolated', '--max-seconds=0.1'], { status: 1, error: /time limit/ });
  fs.writeFileSync(path.join(work, 'data.txt'), 'owner-free synthetic data');
  fs.writeFileSync(path.join(work, 'read.myc'), 'import std.fs\r\nprint(fs.readText("data.txt").isOk)\r\n');
  run('read denied', ['run', 'read.myc'], { output: 'false\n' });
  run('read grant', ['run', 'read.myc', '--allow-read=.'], { output: 'true\n' });
  run('all paths grant', ['run', 'read.myc', '-A'], { output: 'true\n' });
  const outside = path.join(home, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret'), 'synthetic');
  fs.mkdirSync(path.join(work, 'allowed'));
  fs.symlinkSync(outside, path.join(work, 'allowed/link'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(work, 'escape.myc'), 'import std.fs\nprint(fs.readText("allowed/link/secret").isErr)\n');
  run('junction escape denied', ['run', 'escape.myc', '--allow-read=allowed'], { output: 'true\n' });
  fs.writeFileSync(path.join(work, 'format.myc'), 'let  text="""a\r\nb"""\r\nprint(text)\r\n');
  run('fmt', ['fmt', 'format.myc']);
  run('fmt check', ['fmt', 'format.myc', '--check']);
  run('fmt retained string bytes', ['format.myc'], { output: 'a\r\nb\n' });
  run('doc', ['doc', 'nested/greet.olx'], { output: /message/ });
  fs.writeFileSync(path.join(work, 'bad.myc'), 'let x: Int = "bad"\r\n');
  const ds = JSON.parse(run('JSON diagnostics', ['check', 'bad.myc', '--json'], { status: 1 }).stdout);
  assert.equal(ds.find(d => d.severity === 'error').line, 1);
  run('text diagnostics', ['check', 'bad.myc'], { status: 1, error: /bad.myc:1:/ });
  run('REPL', ['repl'], { input: '1 + 2\n:quit\n', output: /3/ });
  const frame = value => { const s = JSON.stringify(value); return `Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`; };
  run('LSP', ['lsp'], { input: frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + frame({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + frame({ jsonrpc: '2.0', method: 'exit' }), output: /"capabilities"[\s\S]*"id":2/ });
  run('standalone build limit', ['build', 'hello.myc'], { status: 1, error: /requires the source SDK/ });
  run('new project', ['new', 'hello']); cwd = path.join(work, 'hello');
  run('project run', ['run'], { output: 'Hello, world!\n' });
  run('project tests', ['test'], { output: /1 passed, 0 failed/ });
  run('package help', ['help', 'install'], { output: /install/ });
  if (!bundled) {
    run('ply alias version', ['--version'], { alias: true, output: 'mycel 0.2.0\n' });
    run('ply alias project', ['run'], { alias: true, output: 'Hello, world!\n' });
  }
  const library = path.join(work, 'library'); fs.mkdirSync(path.join(library, 'src'), { recursive: true });
  fs.writeFileSync(path.join(library, 'ply.json'), JSON.stringify({ name: 'supply', version: '1.0.0' }));
  fs.writeFileSync(path.join(library, 'src/lib.myc'), 'pub fn answer() -> Int => 42\n');
  cwd = library; run('publish local package', ['publish']);
  cwd = path.join(work, 'hello'); run('add package', ['add', 'supply']);
  fs.writeFileSync(path.join(cwd, 'src/main.myc'), 'import supply\nprint(supply.answer())\n');
  run('run installed package', ['run'], { output: '42\n' });
  run('install locked package', ['install']); run('remove package', ['remove', 'supply']);
  console.log(`${receipts.length} smoke checks passed (${bundled ? 'CJS on ' + process.platform + '; Windows PE untested' : process.platform + ' actual SEA'}).`);
} finally {
  const receipt = process.env.MYCEL_SMOKE_RECEIPT ?? path.join(here, '../work/windows/smoke-receipt.json');
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  fs.writeFileSync(receipt, JSON.stringify({ artifact, platform: process.platform, bundled, receipts }, null, 2) + '\n');
  fs.rmSync(work, { recursive: true, force: true });
}
