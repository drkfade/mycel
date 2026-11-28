// Renders the training data page (site/public/mycel/learn/ai/data/index.html) and its README.md from ai-data.mjs and
// the real training transcripts in samples/ai-data/. `node lang/learn/build-ai-data.mjs` writes both;
// check-ai.mjs fails when either is out of date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { datasets, dataDir, transcriptDir, settings, trainSteps, maxFileBytes, maxTotalBytes } from "./ai-data.mjs";
import { stamp } from "./build-tour.mjs";

export const dataPagePath = path.join(dataDir, "index.html");
export const readmePath = path.join(dataDir, "README.md");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// The numbers a run printed: the header line, the loss at step 0 and at the last step, and the sample lines.
export function parseRun(d) {
  const text = fs.readFileSync(path.join(transcriptDir, `${d.id}.txt`), "utf8").replace(/\n+$/, "");
  const lines = text.split("\n");
  const steps = lines.map((l) => l.match(/^step\s+(\d+)\s+train loss ([\d.]+)\s+held-out loss ([\d.]+)$/)).filter(Boolean);
  const first = steps[0];
  const last = steps[steps.length - 1];
  const lastIndex = lines.findIndex((l) => l === last[0]);
  const sample = lines.slice(lastIndex + 1);
  return {
    text,
    header: lines[0],
    startTrain: first[2], startHeld: first[3],
    endStep: Number(last[1]), endTrain: last[2], endHeld: last[3],
    sample,
  };
}

export function renderDataPage() {
  const runs = Object.fromEntries(datasets.map((d) => [d.id, parseRun(d)]));
  const total = datasets.reduce((n, d) => n + d.bytes, 0);
  const NAV = `<nav class="mycel-nav" aria-label="Mycel"><div class="mycel-nav-inner"><a class="mycel-brand" href="/mycel/"><img src="/mycel/brand/mycel-128.png" alt=""><span>mycel</span></a><div class="mycel-links"><a href="/mycel/learn/" aria-current="page">learn</a><a href="/mycel/docs/">docs</a><a href="/mycel/play/">play</a><a href="/mycel/learn/#guides">guides</a><a class="mycel-download" href="/mycel/download/">download</a></div></div></nav>`;
  const FOOTER = `<footer><a href="/">olix</a> &middot; <a href="/mycel/">Mycel programming language</a> &middot; <a href="/mycel/docs/">Docs</a> &middot; <a href="/mycel/play/">Playground</a> &middot; <a href="/mycel/fine-tune/">Fine-tuning</a> &middot; <a href="/mycel/ai-learn/">For AI</a> &middot; <a href="/provenance/">&copy; 2026 drky</a> &middot; <a href="https://github.com/drkfade/mycel">GitHub</a> &middot; <a href="https://discord.gg/FbsU8f5bCA">Discord</a></footer>`;
  const desc = "Free training data for the tiny transformer in lesson 15 of the AI track: five plain-text sets with their size, licence and the real loss and sample from training on each.";
  const rows = datasets.map((d) => `<tr><td><a href="${d.file}" download>${d.file}</a></td><td>${num(d.bytes)}</td><td>${num(d.chars)}</td><td>${esc(d.title)}</td></tr>`).join("");
  const sections = datasets.map((d) => {
    const r = runs[d.id];
    return `<section class="ds" id="${d.id}" aria-labelledby="h-${d.id}">
<h2 id="h-${d.id}" tabindex="-1">${esc(d.title)}</h2>
<p class="lesson-meta"><a href="${d.file}" download>${d.file}</a> &middot; ${num(d.bytes)} bytes &middot; ${num(d.chars)} characters</p>
<p><b>Licence and source.</b> ${esc(d.licence)}</p>
<p><b>What it is.</b> ${esc(d.what)}</p>
<p><b>What a model trained on it produces.</b> ${esc(d.produces)}</p>
<p><b>Settings.</b> Lesson 15's tiny GPT, unchanged, except that it reads <code>${d.file}</code> and runs ${trainSteps} steps: ${esc(settings)}.</p>
<p><b>Real result.</b> The first line of the run reads <code>${esc(r.header)}</code>. The training loss goes from ${r.startTrain} at step 0 to ${r.endTrain} at step ${r.endStep}, and the held-out loss from ${r.startHeld} to ${r.endHeld}. These are the printed numbers, not rounded further. Sample lines:</p>
<pre class="static"><code>${esc(r.sample.join("\n"))}</code></pre>
<details class="log"><summary>Full training log</summary>
<pre class="static"><code>${esc(r.text)}</code></pre>
</details>
</section>`;
  }).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Training data for the AI track: five free text sets</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0b0d10">
<link rel="icon" type="image/png" sizes="32x32" href="/mycel/brand/mycel-32.png">
<link rel="apple-touch-icon" href="/mycel/brand/mycel-256.png">
<link rel="canonical" href="https://ol1x.xyz/mycel/learn/ai/data/">
<meta property="og:type" content="article">
<meta property="og:url" content="https://ol1x.xyz/mycel/learn/ai/data/">
<meta property="og:title" content="Training data for the AI track: five free text sets">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://ol1x.xyz/mycel/brand/mycel-512.png">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/mycel/site.css?v=2ba6e2e275">
<style>
body{overflow-x:hidden}
.wrap{max-width:1100px}
h1{font-size:clamp(28px,5vw,40px);margin:36px 0 10px}
.intro{color:var(--text-2);margin:0 0 18px}
.lesson-meta{font:13px var(--mono);color:var(--text-3);margin:0 0 6px}
section.ds{padding:18px 0 30px;border-top:1px solid var(--line)}
section.ds h2{font-size:24px;margin:0 0 12px;outline:none}
section.ds p{margin:0 0 12px}
.task{border-left:3px solid var(--accent);padding:2px 0 2px 12px}
pre.static{background:var(--code-bg);border:1px solid var(--line);border-radius:6px;padding:12px 14px;font:15px/1.6 var(--mono);overflow-x:auto;max-width:100%}
details.log{margin:0 0 12px}
details.log summary{cursor:pointer;font-weight:600;margin-bottom:8px}
table{border-collapse:collapse;width:100%;font-size:15px;margin:0 0 12px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td:nth-child(2),td:nth-child(3),th:nth-child(2),th:nth-child(3){text-align:right;font-variant-numeric:tabular-nums}
</style>
</head>
<body>
${NAV}

<main class="wrap">
<p class="lesson-meta"><a href="/mycel/learn/">Learn Mycel</a> &middot; <a href="/mycel/learn/ai/">AI track</a> &middot; training data</p>
<h1>Training data</h1>
<p class="intro">Five small plain-text files for the tiny transformer in lesson 15. Download one, train the model on it, and see
what it learns. Every file is safe to share: a script made it, the Mycel project wrote it, or it is written for this course.
Together they are ${num(total)} bytes, and each file is under ${num(maxFileBytes / 1024)} KB.</p>
<p>New here? Start with <a href="/mycel/learn/ai/">the AI track</a>, and do lesson 15 first, so the example and its settings make sense.</p>

<div class="reading-grid" style="margin-top:24px">
<aside class="page-toc" aria-label="Training data contents">
 <div class="page-toc-title">On this page</div>
 <ul>
  <li><a href="#how-to-use">How to use a file</a></li>
  <li><a href="#the-sets">The sets</a></li>
  ${datasets.map((d) => `<li><a href="#${d.id}">${esc(d.title)}</a></li>`).join("\n  ")}
  <li><a href="#next">Back to the course</a></li>
 </ul>
 <div class="toc-actions">
  <a href="/mycel/learn/ai/">AI track lessons &rarr;</a>
  <a href="/mycel/learn/">Mycel beginner tour</a>
 </div>
</aside>
<div class="reading-main">
<h2 id="how-to-use">How to use a file</h2>
<ol>
<li>Download a file from the table below and save it in the same folder as your lesson 15 file.</li>
<li>In that file, change the name in <code>fs.readText("names.txt")</code> to the name of the file you downloaded.</li>
<li>Run it with <code>mycel run --allow-read=. main.myc</code>. For the full run, change <code>let steps = 20</code> to <code>let steps = 600</code>. A full run takes 30 to 60 seconds on a laptop.</li>
</ol>
<p>The example prints one line for each non-empty line of the file, so the count it prints is the number of lines, even when it says "names". Each file's
numbers below come from a full 600-step run on the Mac this page was built on. Your loss may differ a little, because the
computer's arithmetic and the random numbers can vary between machines.</p>

<h2 id="the-sets">The sets</h2>
<div class="tblwrap"><table>
<thead><tr><th>File</th><th>Bytes</th><th>Characters</th><th>What it is</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<p>The set you train on is up to you. A short set trains fast and repeats itself; a long set takes longer and the model learns more varied text.</p>

${sections}

<section class="ds" id="next" aria-labelledby="h-next">
<h2 id="h-next" tabindex="-1">Back to the course</h2>
<p>Lesson 15 of the <a href="/mycel/learn/ai/">AI track</a> has an exercise that trains on one of these files. You can also
make your own file: any plain text with one item per line works, and the tiny GPT learns its letters and patterns.</p>
</section>
</div>
</div>
</main>

${FOOTER}
</body>
</html>
`;
  return stamp(html);
}

export function renderReadme() {
  const rows = datasets.map((d) => {
    const r = parseRun(d);
    return `| [${d.file}](${d.file}) | ${num(d.bytes)} | ${num(d.chars)} | ${d.title} | ${r.startTrain} to ${r.endTrain} | ${r.startHeld} to ${r.endHeld} |`;
  }).join("\n");
  const sections = datasets.map((d) => {
    const r = parseRun(d);
    return `## ${d.title} (\`${d.file}\`)

- Size: ${num(d.bytes)} bytes, ${num(d.chars)} characters.
- Licence and source: ${d.licence}
- What it is: ${d.what}
- What a model trained on it produces: ${d.produces}
- Settings: lesson 15's tiny GPT, unchanged, except that it reads \`${d.file}\` and runs ${trainSteps} steps (${settings}).
- Real result: first line \`${r.header}\`. Training loss ${r.startTrain} at step 0 and ${r.endTrain} at step ${r.endStep}; held-out loss ${r.startHeld} and ${r.endHeld}.

Sample at step ${r.endStep}:

\`\`\`
${r.sample.join("\n")}
\`\`\``;
  }).join("\n\n");
  return `# Training data for the AI track

Five small plain-text files for the tiny transformer in lesson 15 of the AI track
(https://ol1x.xyz/mycel/learn/ai/). Each file is under ${num(maxFileBytes / 1024)} KB and all of them together are under 1 MB. Each file is one training set: the lesson 15 example reads it, one line at a time.

Download a file, save it next to your \`main.myc\`, change the file name in \`fs.readText("names.txt")\` and run
\`mycel run --allow-read=. main.myc\`. For the full run, set \`let steps = 600\`.

| File | Bytes | Characters | Set | Training loss | Held-out loss |
| --- | ---: | ---: | --- | --- | --- |
${rows}

The loss columns show step 0 and step ${trainSteps} from the run on this page.

${sections}
`;
}

export function buildData() {
  fs.mkdirSync(dataDir, { recursive: true });
  const outputs = [[dataPagePath, renderDataPage()], [readmePath, renderReadme()]];
  const changed = [];
  for (const [file, text] of outputs) {
    const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (text !== prev) {
      fs.writeFileSync(file, text);
      changed.push(file);
    }
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const changed = buildData();
  console.log(changed.length ? `wrote ${changed.map((f) => path.relative(dataDir, f)).join(", ")}` : "AI training data page already up to date");
}
