// Checks the "AI development in Mycel" track (lang/learn/ai-course.mjs, samples/ai/, learn/ai/index.html).
//   1. every example file runs with lang/bin/mycel (with the flags and typed input its lesson gives) and prints
//      exactly the output the lesson shows;
//   2. every solution file does the same for its exercise;
//   3. site/public/mycel/learn/ai/index.html matches the builder (build-ai.mjs), and the learn index links to it.
// Run: node lang/learn/check-ai.mjs   (also run at the end of check.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { lessons } from "./ai-course.mjs";
import { render, aiPagePath, samplesAiDir } from "./build-ai.mjs";
import { mycelDir } from "./build-tour.mjs";
import os from "node:os";
import { datasets, dataDir, transcriptDir, maxFileBytes, maxTotalBytes } from "./ai-data.mjs";
import { renderDataPage, renderReadme, dataPagePath, readmePath } from "./build-ai-data.mjs";
import { projectFor } from "./run-ai-data.mjs";

// Runs lesson 15's own-data solution in a scratch project with the data file copied next to it.
function runOwnData(file, data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-own-data-"));
  try {
    fs.copyFileSync(path.join(samplesAiDir, `${file}.myc`), path.join(dir, "main.myc"));
    fs.copyFileSync(path.join(dataDir, data), path.join(dir, data));
    fs.copyFileSync(path.join(samplesAiDir, "ply.json"), path.join(dir, "ply.json"));
    fs.mkdirSync(path.join(dir, "ply_modules"));
    fs.symlinkSync(fs.realpathSync(path.join(samplesAiDir, "ply_modules", "tensor")), path.join(dir, "ply_modules", "tensor"));
    return execFileSync(mycelBin, ["run", "--allow-read=.", "main.myc"], { cwd: dir, encoding: "utf8", timeout: 120000 }).trim();
  } catch (e) {
    return `(exit ${e.status}) ${String(e.stdout || "").trim()} ${String(e.stderr || "").trim()}`.trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const mycelBin = path.resolve(here, "../bin/mycel");

console.log("--- AI development in Mycel track (lang/learn/check-ai.mjs) ---");
assert.ok(fs.existsSync(mycelBin), "lang/bin/mycel must exist");
let failed = 0;

function runFile(file, { flags = "", stdin = "" }) {
  const args = ["run", ...flags.split(/\s+/).filter(Boolean), path.join(samplesAiDir, `${file}.myc`)];
  try {
    return execFileSync(mycelBin, args, { encoding: "utf8", input: stdin, cwd: samplesAiDir, timeout: 60000 }).trim();
  } catch (e) {
    return `(exit ${e.status}) ${String(e.stdout || "").trim()} ${String(e.stderr || "").trim()}`.trim();
  }
}

function expect(label, file, opts, out) {
  const actual = runFile(file, opts);
  if (actual === out.trim()) {
    console.log(`  ✔ ${label} (${file}.myc)`);
  } else {
    failed++;
    console.error(`  ✘ ${label} (${file}.myc) output differs\n--- ACTUAL ---\n${actual}\n--- EXPECTED ---\n${out.trim()}`);
  }
}

for (const [i, l] of lessons.entries()) {
  const n = i + 1;
  const sample = path.join(samplesAiDir, `${l.file}.myc`);
  const solution = path.join(samplesAiDir, `${l.exercise.file}.myc`);
  if (!fs.existsSync(sample)) { failed++; console.error(`  ✘ lesson ${n}: ${sample} missing`); continue; }
  if (!fs.existsSync(solution)) { failed++; console.error(`  ✘ lesson ${n}: ${solution} missing`); continue; }
  expect(`lesson ${n} ${l.title}`, l.file, { flags: l.flags, stdin: l.stdin }, l.out);
  expect(`lesson ${n} exercise solution`, l.exercise.file, { flags: l.exercise.flags || l.flags, stdin: l.exercise.stdin }, l.exercise.out);
}

// Lessons 11 to 15 (the tensor package): the example folder must be a project that installs tensor, every
// code excerpt in a lesson must be copied exactly from that lesson's example file, the full-run transcript must be
// shown as stored, and no example line may be a // comment (comments are #).
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const projectPly = path.join(samplesAiDir, "ply.json");
if (fs.existsSync(projectPly) && fs.existsSync(path.join(samplesAiDir, "ply_modules", "tensor", "ply.json"))) {
  console.log("  ✔ samples/ai is a project with the tensor package installed");
} else {
  failed++;
  console.error("  ✘ samples/ai needs ply.json and ply_modules/tensor (see lesson 11)");
}
for (const [i, l] of lessons.entries()) {
  if (i < 10) continue;
  const n = i + 1;
  const example = fs.readFileSync(path.join(samplesAiDir, `${l.file}.myc`), "utf8");
  const excerpts = [...l.text.matchAll(/<pre class="static excerpt"><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  if (!excerpts.length) { failed++; console.error(`  ✘ lesson ${n}: no code excerpt in the text`); }
  for (const ex of excerpts) {
    if (example.includes(ex)) {
      console.log(`  ✔ lesson ${n}: excerpt of ${ex.split("\n").length} line(s) is in ${l.file}.myc`);
    } else {
      failed++;
      console.error(`  ✘ lesson ${n}: excerpt not found verbatim in ${l.file}.myc:\n${ex}`);
    }
  }
  for (const name of [l.file, l.exercise.file]) {
    const text = fs.readFileSync(path.join(samplesAiDir, `${name}.myc`), "utf8");
    // comments are # now; // is floor division, so a line that starts with // is a mistake
    if (/^\s*\/\//m.test(text)) {
      failed++;
      console.error(`  ✘ ${name}.myc has a // comment line; comments use #`);
    }
  }
  if (l.fullRun) {
    const transcript = path.join(samplesAiDir, `${l.fullRun.file}.txt`);
    if (fs.existsSync(transcript) && fs.readFileSync(transcript, "utf8").includes("trained 600 steps")) {
      console.log(`  ✔ lesson ${n}: full-run transcript (${l.fullRun.file}.txt) is stored and shown`);
    } else {
      failed++;
      console.error(`  ✘ lesson ${n}: full-run transcript ${l.fullRun.file}.txt missing or not a 600-step run`);
    }
  }
}

const expected = render();
const onDisk = fs.existsSync(aiPagePath) ? fs.readFileSync(aiPagePath, "utf8") : "";
if (onDisk === expected) {
  console.log("  ✔ learn/ai/index.html matches build-ai.mjs");
} else {
  failed++;
  console.error("  ✘ learn/ai/index.html is out of date: run node lang/learn/build-ai.mjs");
}

const learnIndex = fs.readFileSync(path.join(mycelDir, "learn", "index.html"), "utf8");
if (learnIndex.includes('href="/mycel/learn/ai/"')) {
  console.log("  ✔ learn index links to the AI track");
} else {
  failed++;
  console.error('  ✘ learn/index.html has no link to /mycel/learn/ai/');
}

// Training data (ai-data.mjs, site/public/mycel/learn/ai/data/): files exist and are within the size limits, every
// listed size and character count is right, mycel_code.txt has no // comments, the data page and README match their
// builder, every transcript is a real 600-step run, and lesson 15's own-data exercise runs on its data file.
const dataFail = (msg) => { failed++; console.error(`  ✘ ${msg}`); };
let dataTotal = 0;
for (const d of datasets) {
  const file = path.join(dataDir, d.file);
  if (!fs.existsSync(file)) { dataFail(`data file ${d.file} is missing`); continue; }
  const buf = fs.readFileSync(file);
  const text = buf.toString("utf8");
  dataTotal += buf.length;
  if (buf.length > maxFileBytes) dataFail(`${d.file} is ${buf.length} bytes, over ${maxFileBytes}`);
  if (buf.length !== d.bytes) dataFail(`${d.file}: listed ${d.bytes} bytes, file has ${buf.length}`);
  const chars = [...text].length;
  if (chars !== d.chars) dataFail(`${d.file}: listed ${d.chars} characters, file has ${chars}`);
  if (buf.length === d.bytes && chars === d.chars) console.log(`  ✔ ${d.file}: ${buf.length} bytes, ${chars} characters, as listed`);
  if (d.id === "mycel_code") {
    // a // outside a string literal would be a comment in the old syntax; inside strings (URLs) it is fine
    const bad = text.split("\n").map((l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""')).filter((l) => l.includes("//"));
    if (bad.length) dataFail(`mycel_code.txt has // comments: ${bad.slice(0, 3).join(" | ")}`);
    else console.log("  ✔ mycel_code.txt has no // comments (the // in URLs are inside strings)");
  }
  const transcript = path.join(transcriptDir, `${d.id}.txt`);
  if (!fs.existsSync(transcript) || !/^step\s+600\s+train loss/m.test(fs.readFileSync(transcript, "utf8"))) {
    dataFail(`samples/ai-data/${d.id}.txt is missing or not a 600-step run`);
  }
}
if (dataTotal <= maxTotalBytes) {
  console.log(`  ✔ data files total ${dataTotal} bytes, under ${maxTotalBytes}`);
} else {
  dataFail(`data files total ${dataTotal} bytes, over ${maxTotalBytes}`);
}
const dataPage = fs.existsSync(dataPagePath) ? fs.readFileSync(dataPagePath, "utf8") : "";
if (dataPage === renderDataPage()) console.log("  ✔ learn/ai/data/index.html matches build-ai-data.mjs");
else dataFail("learn/ai/data/index.html is out of date: run node lang/learn/build-ai-data.mjs");
const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : "";
if (readme === renderReadme()) console.log("  ✔ learn/ai/data/README.md matches build-ai-data.mjs");
else dataFail("learn/ai/data/README.md is out of date: run node lang/learn/build-ai-data.mjs");
if (expected.includes('href="/mycel/learn/ai/data/"') && expected.split('href="/mycel/learn/ai/data/"').length - 1 >= 2) {
  console.log("  ✔ AI track page links to the data page from the intro and What you built");
} else {
  dataFail("learn/ai/index.html must link to /mycel/learn/ai/data/ from the intro and What you built");
}

// Lesson 15's own-data exercise: its solution is the lesson example with the data file read, the excerpt is in the
// example, and the solution's stored output is what it prints on the data file.
const ownLesson = lessons[14];
if (ownLesson && ownLesson.ownData) {
  const o = ownLesson.ownData;
  const sol = path.join(samplesAiDir, `${o.file}.myc`);
  const example = fs.readFileSync(path.join(samplesAiDir, `${ownLesson.file}.myc`), "utf8");
  const excerpts = [...o.text.matchAll(/<pre class="static excerpt"><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  if (!excerpts.length || excerpts.some((ex) => !example.includes(ex))) dataFail("lesson 15 own-data excerpt is not in 15_tiny_gpt.myc");
  else console.log("  ✔ lesson 15 own-data excerpt is in 15_tiny_gpt.myc");
  if (!fs.existsSync(sol)) {
    dataFail(`${o.file}.myc missing`);
  } else {
    const solText = fs.readFileSync(sol, "utf8");
    if (solText !== projectFor(o.data, 20)) dataFail(`${o.file}.myc is not the lesson example reading ${o.data}`);
    const actual = runOwnData(o.file, o.data);
    if (actual === o.out.trim()) console.log(`  ✔ lesson 15 own-data exercise (${o.file}.myc on ${o.data}) prints its stored output`);
    else dataFail(`lesson 15 own-data exercise output differs\n--- ACTUAL ---\n${actual}\n--- EXPECTED ---\n${o.out.trim()}`);
  }
} else {
  dataFail("lesson 15 has no ownData exercise");
}

if (failed) {
  console.error(`AI track: ${failed} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`AI track: ${lessons.length} lessons and ${lessons.length} exercises verified against lang/bin/mycel output`);
}
