// Checks the 5-part "Switching to Mycel" lessons (lang/learn/switch-course.mjs, samples/switch/, site/public/mycel/for/<lang>/).
//   1. Every language has exactly 5 parts;
//   2. Every .myc snippet (Parts 1-4 + Part 5 starter & solution + CLI arg test) runs with lang/bin/mycel and matches recorded output;
//   3. Every Part 5 habit snippet fails `lang/bin/mycel check` with the exact recorded compiler diagnostic;
//   4. Every other-language snippet runs on installed toolchains (python3, node, javac, swiftc, clang++, go, rustc, dotnet);
//      missing toolchains are explicitly marked as unrun and never claimed as run;
//   5. Generated HTML under site/public/mycel/for/<lang>/ matches build-switch.mjs and links from for/ and learn/.
// Run: node lang/learn/check-switch.mjs   (also run from check.mjs)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { SWITCH_LANGS } from "./switch-course.mjs";
import {
  samplesSwitchDir,
  siteForDir,
  renderLessonPage,
  renderExtraGuidePage,
  updateExistingGuideHtml
} from "./build-switch.mjs";
import { mycelDir } from "./build-tour.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const mycelBin = path.resolve(here, "../bin/mycel");

console.log("--- Switching to Mycel lessons (lang/learn/check-switch.mjs) ---");
assert.ok(fs.existsSync(mycelBin), "lang/bin/mycel must exist");
assert.ok(fs.existsSync(path.join(samplesSwitchDir, "ply.json")), "samples/switch/ply.json must exist");
assert.ok(fs.existsSync(path.join(samplesSwitchDir, "ply_modules", "tensor", "ply.json")), "samples/switch/ply_modules/tensor must exist");

function hasCmd(cmd, probeArgs = ["--version"]) {
  try {
    execFileSync(cmd, probeArgs, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const toolchains = {
  python3: hasCmd("python3", ["--version"]),
  node: hasCmd("node", ["--version"]),
  javac: hasCmd("javac", ["-version"]) && hasCmd("java", ["-version"]),
  swiftc: hasCmd("swiftc", ["--version"]),
  "clang++": hasCmd("clang++", ["--version"]),
  go: hasCmd("go", ["version"]),
  rustc: hasCmd("rustc", ["--version"]),
  dotnet: hasCmd("dotnet", ["--version"])
};

function runMycel(langSlug, file, extraArgs = []) {
  const target = path.join(samplesSwitchDir, langSlug, file);
  const args = ["run", target, ...(extraArgs.length ? ["--", ...extraArgs] : [])];
  return execFileSync(mycelBin, args, { cwd: samplesSwitchDir, encoding: "utf8", timeout: 60000 })
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function checkMycel(langSlug, file) {
  const cwd = path.join(samplesSwitchDir, langSlug);
  try {
    execFileSync(mycelBin, ["check", file], { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 });
    return { ok: true, stderr: "" };
  } catch (e) {
    return { ok: false, stderr: String(e.stderr || "").replace(/\r\n/g, "\n").trimEnd() };
  }
}

function runOther(ext, filePath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-switch-other-"));
  try {
    if (ext === "py") {
      return execFileSync("python3", [filePath], { encoding: "utf8", timeout: 20000 }).trimEnd();
    }
    if (ext === "ts") {
      return execFileSync("node", [filePath], { encoding: "utf8", timeout: 20000 }).trimEnd();
    }
    if (ext === "java") {
      fs.copyFileSync(filePath, path.join(tmp, "Main.java"));
      execFileSync("javac", ["Main.java"], { cwd: tmp, encoding: "utf8", timeout: 20000 });
      return execFileSync("java", ["Main"], { cwd: tmp, encoding: "utf8", timeout: 20000 }).trimEnd();
    }
    if (ext === "swift") {
      const bin = path.join(tmp, "prog");
      execFileSync("swiftc", [filePath, "-o", bin], { encoding: "utf8", timeout: 30000 });
      return execFileSync(bin, [], { encoding: "utf8", timeout: 20000 }).trimEnd();
    }
    if (ext === "cpp") {
      const bin = path.join(tmp, "prog");
      execFileSync("clang++", ["-std=c++17", filePath, "-o", bin], { encoding: "utf8", timeout: 20000 });
      return execFileSync(bin, [], { encoding: "utf8", timeout: 20000 }).trimEnd();
    }
    if (ext === "go") {
      return execFileSync("go", ["run", filePath], { encoding: "utf8", timeout: 30000 }).trimEnd();
    }
    if (ext === "rs") {
      const bin = path.join(tmp, "prog");
      execFileSync("rustc", [filePath, "-o", bin], { encoding: "utf8", timeout: 30000 });
      return execFileSync(bin, [], { encoding: "utf8", timeout: 20000 }).trimEnd();
    }
    throw new Error(`Unsupported extension: ${ext}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let failed = 0;
let mycelVerified = 0;
let habitsVerified = 0;
let otherRunVerified = 0;
const unrunLangs = [];

const fail = (msg) => { failed++; console.error(`  ✘ ${msg}`); };

for (const lang of SWITCH_LANGS) {
  if (lang.parts.length !== 5) {
    fail(`${lang.slug}: expected 5 parts, found ${lang.parts.length}`);
    continue;
  }

  const hasTool = !!toolchains[lang.toolchain];
  if (!hasTool) unrunLangs.push(`${lang.name} (${lang.toolchain} not installed)`);

  for (const part of lang.parts) {
    if (part.num < 5) {
      const mycPath = path.join(samplesSwitchDir, lang.slug, part.mycFile);
      const otherPath = path.join(samplesSwitchDir, lang.slug, part.otherFile);
      if (!fs.existsSync(mycPath)) { fail(`${lang.slug}: missing ${part.mycFile}`); continue; }
      if (!fs.existsSync(otherPath)) { fail(`${lang.slug}: missing ${part.otherFile}`); continue; }

      // No // comments in .myc samples (comments use #; // is floor division)
      const mycText = fs.readFileSync(mycPath, "utf8");
      if (/^\s*\/\//m.test(mycText)) fail(`${lang.slug}/${part.mycFile}: has // comment line`);

      const actual = runMycel(lang.slug, part.mycFile);
      if (actual === part.mycOut) {
        mycelVerified++;
        console.log(`  ✔ ${lang.slug}/${part.mycFile}`);
      } else {
        fail(`${lang.slug}/${part.mycFile} output mismatch:\n--- ACTUAL ---\n${actual}\n--- EXPECTED ---\n${part.mycOut}`);
      }

      if (hasTool) {
        const otherActual = runOther(lang.ext, otherPath);
        if (part.otherOut !== null && otherActual !== part.otherOut) {
          fail(`${lang.slug}/${part.otherFile} output mismatch:\n--- ACTUAL ---\n${otherActual}\n--- EXPECTED ---\n${part.otherOut}`);
        } else {
          otherRunVerified++;
          console.log(`  ✔ ${lang.slug}/${part.otherFile} (${lang.toolchain})`);
        }
      } else {
        console.log(`  • ${lang.slug}/${part.otherFile}: unrun (${lang.toolchain} not installed)`);
      }
    } else {
      for (const h of part.habits) {
        const res = checkMycel(lang.slug, h.file);
        if (res.ok) {
          fail(`${lang.slug}/${h.file}: expected habit error, compiled OK`);
        } else if (res.stderr !== h.diag) {
          fail(`${lang.slug}/${h.file} diagnostic mismatch:\n--- ACTUAL ---\n${res.stderr}\n--- EXPECTED ---\n${h.diag}`);
        } else {
          habitsVerified++;
          console.log(`  ✔ ${lang.slug}/${h.file} diagnostic`);
        }
      }

      const starterOut = runMycel(lang.slug, part.starterFile);
      if (starterOut === part.starterOut) {
        mycelVerified++;
        console.log(`  ✔ ${lang.slug}/${part.starterFile}`);
      } else {
        fail(`${lang.slug}/${part.starterFile} output mismatch`);
      }

      const solOut = runMycel(lang.slug, part.solutionFile);
      if (solOut === part.solutionOut) {
        mycelVerified++;
        console.log(`  ✔ ${lang.slug}/${part.solutionFile}`);
      } else {
        fail(`${lang.slug}/${part.solutionFile} output mismatch:\n--- ACTUAL ---\n${solOut}\n--- EXPECTED ---\n${part.solutionOut}`);
      }

      const cliOut = runMycel(lang.slug, part.solutionFile, part.cliTestArgs);
      if (cliOut === part.cliTestOut) {
        mycelVerified++;
        console.log(`  ✔ ${lang.slug}/${part.solutionFile} (CLI args)`);
      } else {
        fail(`${lang.slug}/${part.solutionFile} CLI args mismatch:\n--- ACTUAL ---\n${cliOut}\n--- EXPECTED ---\n${part.cliTestOut}`);
      }
    }
  }

  // Verify generated lesson page & guide page
  const lessonPath = path.join(siteForDir, lang.slug, "lessons", "index.html");
  if (!fs.existsSync(lessonPath) || fs.readFileSync(lessonPath, "utf8") !== renderLessonPage(lang)) {
    fail(`for/${lang.slug}/lessons/index.html is out of date: run node lang/learn/build-switch.mjs`);
  } else {
    console.log(`  ✔ for/${lang.slug}/lessons/index.html matches build-switch.mjs`);
  }

  const guidePath = path.join(siteForDir, lang.slug, "index.html");
  const guideHtml = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, "utf8") : "";
  if (!guideHtml.includes(`/mycel/for/${lang.slug}/lessons/`)) {
    fail(`for/${lang.slug}/index.html does not link to /mycel/for/${lang.slug}/lessons/`);
  }
  if (lang.slug === "csharp" || lang.slug === "cpp") {
    if (guideHtml !== renderExtraGuidePage(lang)) {
      fail(`for/${lang.slug}/index.html is out of date: run node lang/learn/build-switch.mjs`);
    }
  } else if (updateExistingGuideHtml(lang.slug, guideHtml) !== guideHtml) {
    fail(`for/${lang.slug}/index.html needs update: run node lang/learn/build-switch.mjs`);
  }
}

// Verify learn/index.html links to the switching lessons
const learnIndex = fs.readFileSync(path.join(mycelDir, "learn", "index.html"), "utf8");
for (const lang of SWITCH_LANGS) {
  if (!learnIndex.includes(`/mycel/for/${lang.slug}/lessons/`)) {
    fail(`learn/index.html missing link to /mycel/for/${lang.slug}/lessons/`);
  }
}

if (failed) {
  console.error(`Switching lessons: ${failed} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(
    `Switching lessons PASSED: ${SWITCH_LANGS.length} languages x 5 parts | ` +
    `${mycelVerified} Mycel runs | ${habitsVerified} habit diagnostics | ` +
    `${otherRunVerified} other-language runs` +
    (unrunLangs.length ? ` | unrun: ${unrunLangs.join(", ")}` : "")
  );
}
