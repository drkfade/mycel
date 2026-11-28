// Renders ai-course.mjs into site/public/mycel/learn/ai/index.html (static HTML, no script needed).
// `node lang/learn/build-ai.mjs` writes the page; check-ai.mjs fails when the page is out of date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { track, lessons } from "./ai-course.mjs";
import { mycelDir, stamp } from "./build-tour.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const samplesAiDir = path.join(here, "samples", "ai");
export const aiPagePath = path.join(mycelDir, "learn", "ai", "index.html");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const readSample = (file) => fs.readFileSync(path.join(samplesAiDir, `${file}.myc`), "utf8").replace(/\n+$/, "");
const readText = (file) => fs.readFileSync(path.join(samplesAiDir, `${file}.txt`), "utf8").replace(/\n+$/, "");

const NAV = `<nav class="mycel-nav" aria-label="Mycel"><div class="mycel-nav-inner"><a class="mycel-brand" href="/mycel/"><img src="/mycel/brand/mycel-128.png" alt=""><span>mycel</span></a><div class="mycel-links"><a href="/mycel/learn/" aria-current="page">learn</a><a href="/mycel/docs/">docs</a><a href="/mycel/play/">play</a><a href="/mycel/learn/#guides">guides</a><a class="mycel-download" href="/mycel/download/">download</a></div></div></nav>`;
const FOOTER = `<footer><a href="/">olix</a> &middot; <a href="/mycel/">Mycel programming language</a> &middot; <a href="/mycel/docs/">Docs</a> &middot; <a href="/mycel/play/">Playground</a> &middot; <a href="/mycel/fine-tune/">Fine-tuning</a> &middot; <a href="/mycel/ai-learn/">For AI</a> &middot; <a href="/provenance/">&copy; 2026 drky</a> &middot; <a href="https://github.com/drkfade/mycel">GitHub</a> &middot; <a href="https://discord.gg/FbsU8f5bCA">Discord</a></footer>`;

// The optional "train it on your own data" part of a lesson: a section after the exercise, with its own solution.
function ownDataHtml(l) {
  const o = l.ownData;
  const sol = readSample(o.file);
  return `<h3 class="own-data" id="${l.id}-own-data">Train it on your own data</h3>
${o.text}
<p class="task"><b>Your turn.</b> ${o.task}</p>
<details class="solution"><summary>Show the solution</summary>
<p class="lesson-meta">Save as <code>${o.file}.myc</code> &middot; run with <code>mycel run --allow-read=. ${o.file}.myc</code> from the folder that holds <code>${o.data}</code></p>
<pre class="static"><code>${esc(sol)}</code></pre>
<p class="lesson-meta">Output</p>
<pre class="static"><code>${esc(o.out)}</code></pre>
</details>`;
}

export function render() {
  const n = lessons.length;
  const toc = lessons.map((l, i) => `<li><a href="#${l.id}">${esc(l.title)}</a></li>`).join("");
  const body = lessons.map((l, i) => {
    const code = readSample(l.file);
    const sol = readSample(l.exercise.file);
    const flags = l.flags ? ` &middot; run with <code>mycel run ${esc(l.flags)} ${l.file}.myc</code>` : ` &middot; run with <code>mycel run ${l.file}.myc</code>`;
    const stdin = l.stdin ? `<p class="lesson-meta">Typed input, one line each</p>
<pre class="static"><code>${esc(l.stdin.replace(/\n$/, ""))}</code></pre>\n` : "";
    const solFlags = l.exercise.flags || l.flags;
    const fullRun = l.fullRun ? `<p class="lesson-meta">${esc(l.fullRun.label)}</p>
<pre class="static"><code>${esc(readText(l.fullRun.file))}</code></pre>
` : "";
    const solStdin = l.exercise.stdin ? `<p class="lesson-meta">Typed input, one line each</p>
<pre class="static"><code>${esc(l.exercise.stdin.replace(/\n$/, ""))}</code></pre>\n` : "";
    return `<section class="lesson" id="${l.id}" aria-labelledby="h-${l.id}">
<p class="lesson-meta">Lesson ${i + 1} of ${n} &middot; save as <code>${l.file}.myc</code>${flags}</p>
<h2 id="h-${l.id}" tabindex="-1"><span class="num">${i + 1}.</span> ${esc(l.title)}</h2>
${l.text}
<p class="lesson-meta">Example</p>
<pre class="static"><code>${esc(code)}</code></pre>
${stdin}<p class="lesson-meta">Output</p>
<pre class="static"><code>${esc(l.out)}</code></pre>
${fullRun}<p class="task"><b>Your turn.</b> ${l.task}</p>
<details class="solution"><summary>Show the solution</summary>
<p class="lesson-meta">Save as <code>${l.exercise.file}.myc</code>${solFlags ? ` &middot; run with <code>mycel run ${esc(solFlags)} ${l.exercise.file}.myc</code>` : ""}</p>
<pre class="static"><code>${esc(sol)}</code></pre>
${solStdin}<p class="lesson-meta">Output</p>
<pre class="static"><code>${esc(l.exercise.out)}</code></pre>
</details>
${l.ownData ? ownDataHtml(l) : ""}
</section>`;
  }).join("\n");

  const desc = "Fifteen lessons on AI development in Mycel: rules, counting words, nearest neighbour, a learning neuron, text as numbers, calling a language model, a chatbot app, testing an AI, and a tiny transformer built with the tensor package. Runnable examples.";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Learn AI development in Mycel: fifteen lessons with runnable examples</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0b0d10">
<link rel="icon" type="image/png" sizes="32x32" href="/mycel/brand/mycel-32.png">
<link rel="apple-touch-icon" href="/mycel/brand/mycel-256.png">
<link rel="canonical" href="https://ol1x.xyz/mycel/learn/ai/">
<meta property="og:type" content="article">
<meta property="og:url" content="https://ol1x.xyz/mycel/learn/ai/">
<meta property="og:title" content="Learn AI development in Mycel: fifteen lessons with runnable examples">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://ol1x.xyz/mycel/brand/mycel-512.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context": "https://schema.org", "@type": "Course", "name": "AI development in Mycel", "description": "Fifteen beginner lessons on AI development in the Mycel programming language, each with a runnable example and an exercise, ending with a tiny transformer built with the tensor package.", "url": "https://ol1x.xyz/mycel/learn/ai/", "inLanguage": "en", "numberOfCredits": 0, "provider": {"@type": "Organization", "name": "olix", "url": "https://ol1x.xyz/"}}</script>
<link rel="stylesheet" href="/mycel/site.css?v=2ba6e2e275">
<style>
body{overflow-x:hidden}
.wrap{max-width:1100px}
h1{font-size:clamp(28px,5vw,40px);margin:36px 0 10px}
.intro{color:var(--text-2);margin:0 0 18px}
.ai-toc{margin:0 0 18px;padding-left:20px}
.ai-toc li{margin:3px 0}
section.lesson{padding:18px 0 30px;border-top:1px solid var(--line)}
.lesson-meta{font:13px var(--mono);color:var(--text-3);margin:0 0 6px}
section.lesson h2{font-size:24px;margin:0 0 12px;outline:none}
.num{color:var(--text-3);font-weight:500}
section.lesson p{margin:0 0 12px}
pre.diagram{font:14px/1.5 var(--mono);background:var(--code-bg);border:1px solid var(--line);border-radius:6px;padding:12px 14px;overflow-x:auto;max-width:100%;margin:0 0 12px}
section.lesson ul{margin:0 0 12px;padding-left:22px}
.task{border-left:3px solid var(--accent);padding:2px 0 2px 12px}
pre.static{background:var(--code-bg);border:1px solid var(--line);border-radius:6px;padding:12px 14px;font:15px/1.6 var(--mono);overflow-x:auto;max-width:100%}
details.solution{margin:0 0 12px}
details.solution summary{cursor:pointer;font-weight:600;margin-bottom:8px}
</style>
</head>
<body>
${NAV}

<main class="wrap">
<p class="lesson-meta"><a href="/mycel/learn/">Learn Mycel</a> &middot; AI track</p>
<h1>${esc(track.title)}</h1>
<p class="intro">${esc(track.intro)}</p>
<p>New to Mycel? Start with the <a href="/mycel/learn/">Mycel tour</a>.</p>
<p>Want real data to train the lesson 15 model on? <a href="/mycel/learn/ai/data/">Download the training data</a>: five free text sets, with the real loss and sample from training on each.</p>
<p>Save each example in a file with the name shown, then run it with the <code>mycel</code> command (see the <a href="/mycel/download/">download page</a>). The output under each example is what the program prints.</p>

<h2>Lessons</h2>
<ol class="ai-toc">${toc}</ol>

${body}

<section class="lesson" id="next" aria-labelledby="h-next">
<h2 id="h-next" tabindex="-1">What you built</h2>
<p>Lessons 1 to 10 built a rule bot, a learning spam filter, a nearest-neighbour classifier, a learning neuron, word
similarity, a call to a language model, a chatbot app and a fair test. Lessons 11 to 15 built the parts of a transformer
and put them together:</p>
<ul>
<li>tensors (lesson 11): shapes, broadcasting and matmul, checked against a loop,</li>
<li>autograd (lesson 12): the chain rule by hand, then a neuron trained with <code>backward()</code> and Adam,</li>
<li>a bigram name generator (lesson 13): counts, smoothing, training with <code>crossEntropy</code>, sampling,</li>
<li>one attention head (lesson 14): queries, keys, values, the causal mask and softmax,</li>
<li>a tiny GPT (lesson 15): embeddings, two blocks of attention and a small network, training and generation,</li>
<li>training on your own data: a download of plain text, one line at a time, with the real results on the <a href="/mycel/learn/ai/data/">training data page</a>.</li>
</ul>
<p><b>What to try next.</b></p>
<ul>
<li>In lesson 15, change <code>embed</code>, <code>heads</code> or <code>context</code> and watch the loss. Keep
<code>embed</code> a multiple of <code>heads</code>, because each head gets an equal share of the numbers.</li>
<li>Run the full 600 steps and compare the held-out loss with the training loss, as lesson 10 taught you to do.</li>
<li>Make the names more or less random with temperature: divide the scores by a number before the softmax, as in
<code>(logits / 0.8).softmax()</code>.</li>
<li>Train on your own list of words instead of <code>names.txt</code>, or on one of the <a href="/mycel/learn/ai/data/">training data</a> sets.</li>
<li>Save the trained weights with <code>tensor.save</code> (it needs <code>--allow-write</code>) and load them with
<code>tensor.load</code>, then read the tensor package's README for every function it has.</li>
</ul>
</section>
</main>

${FOOTER}
</body>
</html>
`;
  return stamp(html);
}

export function build() {
  fs.mkdirSync(path.dirname(aiPagePath), { recursive: true });
  const next = render();
  const prev = fs.existsSync(aiPagePath) ? fs.readFileSync(aiPagePath, "utf8") : "";
  if (next !== prev) fs.writeFileSync(aiPagePath, next);
  return next !== prev;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(build() ? `wrote ${path.relative(mycelDir, aiPagePath)}` : "AI track page already up to date");
}
