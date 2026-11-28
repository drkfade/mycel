// lang/learn/check.mjs — test suite for Mycel learn course
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'learn-mycel.html');
const mycelBin = path.resolve(__dirname, '../bin/mycel');
const samplesDir = path.join(__dirname, 'samples');

console.log('--- Checking Mycel Learn Course (lang/learn/check.mjs) ---');

// 1. Verify files exist
assert.ok(fs.existsSync(htmlPath), 'learn-mycel.html must exist');
assert.ok(fs.existsSync(mycelBin), 'mycel binary must exist');
assert.ok(fs.existsSync(samplesDir), 'samples directory must exist');

const html = fs.readFileSync(htmlPath, 'utf8');

// 2. Extract embedded DATA from HTML
const dataMatch = html.match(/const\s+DATA\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+D\s*=/);
assert.ok(dataMatch, 'Failed to extract DATA object from learn-mycel.html');

let data;
try {
  data = JSON.parse(dataMatch[1]);
} catch (e) {
  assert.fail(`DATA in learn-mycel.html is not valid JSON: ${e.message}`);
}

const lessons = data.L;
const glossary = data.G;

console.log(`Found ${lessons.length} lessons and ${glossary.length} glossary terms.`);
assert.ok(lessons.length >= 12 && lessons.length <= 20, `Course must have 12-20 lessons, got ${lessons.length}`);

// 3. Test each lesson
let passedCount = 0;
const tmpDir = fs.mkdtempSync(path.join('/tmp', 'mycel-learn-check-'));

try {
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const sBlock = lesson.blocks.find(b => b[0] === 's');
    assert.ok(sBlock, `Lesson ${i + 1} (${lesson.title}) missing sample block 's'`);
    
    const sample = sBlock[1];
    assert.ok(sample.f, `Lesson ${i + 1} sample missing file id`);
    assert.ok(sample.code, `Lesson ${i + 1} sample missing code`);
    assert.ok(typeof sample.out === 'string', `Lesson ${i + 1} sample missing output string`);
    assert.ok(sample.ex && Object.keys(sample.ex).length > 0, `Lesson ${i + 1} missing line explanations`);
    assert.ok(lesson.quiz && lesson.quiz.length >= 1 && lesson.quiz.length <= 3, `Lesson ${i + 1} must have 1-3 quiz questions`);

    // Write to temp file and run
    const tmpFile = path.join(tmpDir, `${sample.f}.myc`);
    fs.writeFileSync(tmpFile, sample.code, 'utf8');

    const runOut = execFileSync(mycelBin, ['run', '--allow-all', tmpFile], {
      encoding: 'utf8',
      cwd: tmpDir
    }).trim();

    const expectedOut = sample.out.trim();
    if (runOut !== expectedOut) {
      console.error(`\n❌ MISMATCH in Lesson ${i + 1}: ${lesson.title} (${sample.f})`);
      console.error('--- ACTUAL OUTPUT ---');
      console.error(runOut);
      console.error('--- EXPECTED OUTPUT (shown in HTML) ---');
      console.error(expectedOut);
      assert.strictEqual(runOut, expectedOut, `Output mismatch in Lesson ${i + 1} (${sample.f})`);
    }

    // Verify sample file on disk matches code in HTML
    const diskSamplePath = path.join(samplesDir, `${sample.f}.myc`);
    assert.ok(fs.existsSync(diskSamplePath), `Sample file ${sample.f}.myc must exist in samples/`);
    const diskCode = fs.readFileSync(diskSamplePath, 'utf8').trim();
    assert.strictEqual(sample.code.trim(), diskCode, `Sample file ${sample.f}.myc content differs from HTML sample code`);

    passedCount++;
    console.log(`  ✔ [${i + 1}/${lessons.length}] ${lesson.title} (samples/${sample.f}.myc) verified`);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nAll ${passedCount} lesson examples verified against lang/bin/mycel output!`);
console.log('learn-mycel.html self-contained structure and tests PASSED.');

// The AI development track on /mycel/learn/ai/: every example and exercise solution runs with the real CLI.
// (Runs before the tour check, which exits the process on its own failures.)
await import('./check-ai.mjs');

// The interactive tour on /mycel/learn/ and the site pages, through the playground bundle visitors run.
await import('./check-tour.mjs');
