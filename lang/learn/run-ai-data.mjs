// Trains the lesson-15 tiny GPT (samples/ai/15_tiny_gpt.myc, unchanged except the file it reads and the step count)
// on each downloadable dataset in site/public/mycel/learn/ai/data/, with lang/bin/mycel, and stores the real output
// in samples/ai-data/<id>.txt. build-ai-data.mjs prints those transcripts on the data page; check-ai.mjs checks they
// exist. Run it again only when the data or the example changes: one run takes about 30 s per dataset.
// Run: node lang/learn/run-ai-data.mjs [id ...]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { datasets, dataDir, transcriptDir, trainSteps } from "./ai-data.mjs";
import { samplesAiDir } from "./build-ai.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const mycelBin = path.resolve(here, "../bin/mycel");

export function projectFor(file, steps) {
  const src = fs.readFileSync(path.join(samplesAiDir, "15_tiny_gpt.myc"), "utf8");
  const edited = src
    .replace('fs.readText("names.txt")', `fs.readText("${file}")`)
    .replace("let steps = 20", `let steps = ${steps}`);
  if (!src.includes('fs.readText("names.txt")') || !src.includes("let steps = 20")) throw new Error("15_tiny_gpt.myc changed: update run-ai-data.mjs");
  return edited;
}

export function runDataset(file, steps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-data-"));
  try {
    fs.writeFileSync(path.join(dir, "main.myc"), projectFor(file, steps));
    fs.copyFileSync(path.join(dataDir, file), path.join(dir, file));
    fs.copyFileSync(path.join(samplesAiDir, "ply.json"), path.join(dir, "ply.json"));
    fs.mkdirSync(path.join(dir, "ply_modules"));
    fs.symlinkSync(fs.realpathSync(path.join(samplesAiDir, "ply_modules", "tensor")), path.join(dir, "ply_modules", "tensor"));
    const started = Date.now();
    const out = execFileSync(mycelBin, ["run", "--allow-read=.", "main.myc"], { cwd: dir, encoding: "utf8", timeout: 600000 }).trim();
    return { out, seconds: (Date.now() - started) / 1000 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const only = process.argv.slice(2);
  fs.mkdirSync(transcriptDir, { recursive: true });
  for (const d of datasets) {
    if (only.length && !only.includes(d.id)) continue;
    const { out, seconds } = runDataset(d.file, trainSteps);
    fs.writeFileSync(path.join(transcriptDir, `${d.id}.txt`), out + "\n");
    console.log(`${d.id} (${d.file}): ${seconds.toFixed(1)} s`);
    console.log(out);
  }
}
