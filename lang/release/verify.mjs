// Real executable acceptance. Every child has a new HOME and no Node on PATH.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as vm from 'node:vm';
import * as assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkArtifact } from './check-artifact.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(process.argv[2] ?? path.join(here, 'dist/mycel'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mycel-release-'));
const cwd = path.join(root, 'fresh project café');
const home = path.join(root, 'home');
const bin = path.join(root, 'bin');
for (const d of [cwd, home, bin]) fs.mkdirSync(d);
for (const name of ['mycel', 'ply']) fs.copyFileSync(path.join(path.dirname(input), name), path.join(bin, name));
const mycel = path.join(bin, 'mycel');
const ply = path.join(bin, 'ply');
const env = { PATH: '/usr/bin:/bin', HOME: home, TMPDIR: root, LANG: 'en_US.UTF-8' };
const receipts = [];
function run(label, args, { command = mycel, dir = cwd, stdin = '', status = 0, output, error } = {}) {
  const r = spawnSync(command, args, { cwd: dir, env, input: stdin, encoding: 'utf8', timeout: 15000, maxBuffer: 2_000_000 });
  receipts.push({ label, command: path.basename(command), args, cwd: path.relative(root, dir), status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr });
  assert.ifError(r.error);
  assert.equal(r.status, status, `${label}: ${r.stdout}\n${r.stderr}`);
  if (output !== undefined) typeof output === 'string' ? assert.equal(r.stdout, output, label) : assert.match(r.stdout, output, label);
  if (error) assert.match(r.stderr, error, label);
  console.log(`PASS ${label}: ${JSON.stringify(r.stdout || r.stderr)}`);
  return r;
}
function source(file, text) { fs.writeFileSync(path.join(cwd, file), text); }

try {
  checkArtifact(input);
  // The scanner must fail for every token, even if a valid executable precedes it.
  const negative = path.join(root, 'contaminated');
  for (const token of ['/Users/', 'olxcore', 'codecli', '~/.olx']) {
    fs.writeFileSync(negative, Buffer.concat([fs.readFileSync(input), Buffer.from(token)]));
    assert.throws(() => checkArtifact(negative), /forbidden artifact content/);
  }
  console.log('PASS artifact scanner: 4 contamination probes rejected');
  run('no Node on PATH', ['-c', 'command -v node'], { command: '/bin/sh', status: 1, output: '' });
  run('version', ['--version'], { output: 'mycel 0.2.0\n' });
  run('welcome', [], { output: /Welcome to Mycel 0\.2\.0/ });
  source('hello.myc', 'print("hi")\n');
  run('hello shorthand', ['hello.myc'], { output: 'hi\n' });
  run('new demo', ['new', 'demo'], { output: /created demo/ });
  const demo = path.join(cwd, 'demo');
  run('demo run', ['run'], { dir: demo, output: /Hello/ });
  run('demo test', ['test'], { dir: demo, output: /1 passed, 0 failed/ });
  run('ply help install', ['help', 'install'], { command: ply, output: /--python[\s\S]*--swift/ });
  run('ply run alias', ['run', 'hello.myc'], { command: ply, output: 'hi\n' });

  const ctx = { self: {} };
  vm.runInNewContext(fs.readFileSync(path.join(here, '../../site/public/mycel/play/examples.js'), 'utf8'), ctx);
  const expected = {
    hello: 'hi\n', fstrings: 'Hello Ada!\n3 coffees cost 13.50\ncount=3\n',
    loops: '0 apple\n1 pear\n2 fig\ntotal: 108 biggest: 42\n[4, 8, 16, 42]\n',
    function: 'Hi Sam!\nHi Jo! Hi Jo! Hi Jo!\n', class: 'Mia has 42.50\n',
    match: '3.14\n6.00\n', words: 'the 3\ncat 1\nand 2\nhat 1\nbat 1\n',
    counter: '', todo: '',
  };
  assert.equal(ctx.self.MYCEL_EXAMPLES.length, 11);
  for (const e of ctx.self.MYCEL_EXAMPLES) {
    source(e.id + '.myc', e.code);
    const r = run('playground ' + e.id, [e.id + '.myc'], e.id === 'oops'
      ? { status: 1, error: /`elif` is Python — Mycel writes `else if`/ }
      : e.id === 'guess' ? { stdin: Array.from({ length: 100 }, (_, n) => n + 1).join('\n') + '\n', output: /Yes! It was (\d+)\. You needed \1 tries\./ }
      : { output: expected[e.id] });
    assert.equal(r.signal, null);
  }
  source('salutes.olx', 'pub fn salute(name: String) -> String => f"Olá, {name}"\n');
  source('fresh.myc', 'import salutes\nprint(salutes.salute("世界"))\n');
  run('fresh mixed extension import and Unicode', ['fresh.myc'], { output: 'Olá, 世界\n' });
  source('fresh_std.myc', 'import std.json\nimport std.crypto\nprint(json.parse("{\\"ok\\":true}").unwrap())\nprint(crypto.sha256("release acceptance"))\n');
  run('fresh JSON and crypto', ['fresh_std.myc'], { output: '{"ok":true}\n' + createHash('sha256').update('release acceptance').digest('hex') + '\n' });
  source('note.txt', 'synthetic note');
  source('files.myc', 'import std.fs\nprint(fs.readText("note.txt").unwrap())\n');
  run('fresh fs denied', ['files.myc'], { status: 1, error: /CapabilityError/ });
  run('fresh fs granted', ['run', 'files.myc', '--allow-read=.'], { output: 'synthetic note\n' });
  run('isolated hello', ['run', 'hello.myc', '--isolated'], { output: 'hi\n' });
  source('endless.myc', 'while true {}\n');
  run('isolated time limit', ['run', 'endless.myc', '--isolated', '--max-seconds=0.1'], { status: 1, error: /time limit/ });
  run('formatter', ['fmt', 'hello.myc']);
  run('documentation', ['doc', 'salutes.olx'], { output: /salute/ });
  run('REPL', ['repl'], { stdin: 'print("from repl")\n:quit\n', output: /from repl/ });
  const frame = (obj) => { const body = JSON.stringify(obj); return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`; };
  run('LSP initialize and shutdown', ['lsp'], { stdin: frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + frame({ jsonrpc: '2.0', id: 2, method: 'shutdown' }) + frame({ jsonrpc: '2.0', method: 'exit' }), output: /"capabilities"[\s\S]*"id":2/ });
  run('packaged build honest limitation', ['build', 'hello.myc'], { status: 1, error: /requires the source SDK and Node/ });
  run('packaged help excludes unavailable build', ['help']);
  assert.doesNotMatch(receipts.at(-1).stdout, /^  build /m);
  console.log(`PASS ${receipts.length} executable checks + 4 artifact contamination probes; PATH=${env.PATH}`);
} finally {
  const receipt = process.argv[3] ?? path.join(here, 'work/verification.json');
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  fs.writeFileSync(receipt, JSON.stringify({ binary: input, sha256: createHash('sha256').update(fs.readFileSync(input)).digest('hex'), environment: { PATH: env.PATH, isolatedHome: true }, receipts }, null, 2) + '\n');
  fs.rmSync(root, { recursive: true, force: true });
}
