// Runs the shipped learning material through a release artifact exactly as a Windows user would get it:
// every tour example (against its recorded .out), every example project (check + its own tests) and every
// learn-course lesson (against the output the course page shows). Each source file also runs again with CRLF
// line endings, because a Windows checkout/editor produces CRLF and a beginner never converts it.
// Usage: node corpus.mjs <mycel.exe | mycel.cjs>   (Mac: the CJS bundle; Windows CI: the actual SEA)
// Never edits the examples or the course; copies them into a temporary directory first.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.resolve(here, '../..');
const artifact = path.resolve(process.argv[2] ?? path.join(here, '../dist/mycel.exe'));
const bundled = artifact.endsWith('.cjs');
// Tour files listed in MYCEL_CORPUS_SKIP have a known-stale .out; listed, reported, not silently passed.
const SKIP = new Set((process.env.MYCEL_CORPUS_SKIP ?? 'tour/01_hello.olx').split(',').filter(Boolean));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mycel corpus Ω '));
const home = path.join(work, 'home'); fs.mkdirSync(home);
const env = { ...process.env, HOME: home, USERPROFILE: home, PLY_REGISTRY: path.join(home, '.ply/registry'), NODE_OPTIONS: '', NO_COLOR: '1' };
const results = [];
const crlf = (text) => text.replace(/\r?\n/g, '\r\n');

function mycel(args, cwd) {
  const r = spawnSync(bundled ? process.execPath : artifact, bundled ? [artifact, ...args] : args,
    { cwd, env, input: '', encoding: 'utf8', timeout: 60000, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error ? r.error.message : '') };
}
function record(label, ok, detail) {
  results.push({ label, ok, detail: ok ? undefined : detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : '\n' + detail}`);
}

try {
  // 1. Tour: single files with exact recorded output.
  const tour = path.join(lang, 'examples/tour');
  for (const f of fs.readdirSync(tour).filter((x) => x.endsWith('.olx')).sort()) {
    if (SKIP.has('tour/' + f)) { results.push({ label: 'tour/' + f, skipped: true }); console.log(`SKIP tour/${f} (MYCEL_CORPUS_SKIP)`); continue; }
    const expected = fs.readFileSync(path.join(tour, f.replace(/\.olx$/, '.out')), 'utf8');
    const source = fs.readFileSync(path.join(tour, f), 'utf8');
    for (const [variant, text] of [['as shipped', source], ['CRLF', crlf(source)]]) {
      const dir = fs.mkdtempSync(path.join(work, 'tour-'));
      fs.writeFileSync(path.join(dir, f), text);
      const r = mycel(['run', f, '--allow-read=.', '--allow-write=.'], dir);
      record(`tour/${f} (${variant})`, r.status === 0 && r.stdout === expected, `status ${r.status}\n--- stdout\n${r.stdout}\n--- expected\n${expected}\n--- stderr\n${r.stderr}`);
    }
  }
  // 2. Example projects: `mycel check` clean and `mycel test` green, as shipped and with every source CRLF.
  for (const proj of fs.readdirSync(path.join(lang, 'examples')).filter((p) => fs.existsSync(path.join(lang, 'examples', p, 'ply.json'))).sort()) {
    for (const variant of ['as shipped', 'CRLF']) {
      const dir = path.join(work, `${proj}-${variant === 'CRLF' ? 'crlf' : 'lf'}`);
      fs.cpSync(path.join(lang, 'examples', proj), dir, { recursive: true, filter: (s) => path.basename(s) !== 'data' });
      if (variant === 'CRLF') {
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(myc|olx)$/.test(e.name)) fs.writeFileSync(p, crlf(fs.readFileSync(p, 'utf8'))); } };
        walk(dir);
      }
      const c = mycel(['check', '--json'], dir);
      let errors;
      try { errors = JSON.parse(c.stdout).filter((d) => d.severity === 'error'); } catch { errors = [`unparseable: ${c.stdout}${c.stderr}`]; }
      record(`examples/${proj} check (${variant})`, errors.length === 0, JSON.stringify(errors, null, 2));
      const t = mycel(['test'], dir);
      record(`examples/${proj} test (${variant})`, t.status === 0 && /\b0 failed/.test(t.stdout), `status ${t.status}\n${t.stdout}${t.stderr}`);
    }
  }
  // 3. Learn course: the sample each lesson shows, run with the grant the course tells beginners to use.
  const html = fs.readFileSync(path.join(lang, 'learn/learn-mycel.html'), 'utf8');
  const m = html.match(/const\s+DATA\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+D\s*=/);
  if (!m) throw new Error('learn-mycel.html: DATA block not found');
  const lessons = JSON.parse(m[1]).L;
  for (const [i, lesson] of lessons.entries()) {
    const sample = lesson.blocks.find((b) => b[0] === 's')[1];
    for (const [variant, text] of [['as shown', sample.code], ['CRLF', crlf(sample.code)]]) {
      const dir = fs.mkdtempSync(path.join(work, 'learn-'));
      fs.writeFileSync(path.join(dir, sample.f + '.myc'), text);
      const r = mycel(['run', '--allow-all', sample.f + '.myc'], dir);
      // The course compares trimmed output (its page trims); line endings must already be LF.
      record(`learn ${i + 1} ${sample.f} (${variant})`, r.status === 0 && r.stdout.trim() === sample.out.trim(), `status ${r.status}\n--- stdout\n${r.stdout}\n--- expected\n${sample.out}\n--- stderr\n${r.stderr}`);
    }
  }
} finally {
  const receipt = process.env.MYCEL_CORPUS_RECEIPT ?? path.join(here, '../work/windows/corpus-receipt.json');
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  fs.writeFileSync(receipt, JSON.stringify({ artifact, platform: process.platform, bundled, results }, null, 2) + '\n');
  fs.rmSync(work, { recursive: true, force: true });
}
const failed = results.filter((r) => r.ok === false).length;
const passed = results.filter((r) => r.ok).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(`${passed} passed, ${failed} failed, ${skipped} skipped (${bundled ? 'CJS on ' + process.platform + '; Windows PE untested' : process.platform + ' actual SEA'}).`);
process.exitCode = failed ? 1 : 0;
