// Renders SWITCH_LANGS (lang/learn/switch-course.mjs) + samples/switch/<lang>/* into:
//   - site/public/mycel/for/<lang>/lessons/index.html (all 8 languages)
//   - site/public/mycel/for/csharp/index.html and site/public/mycel/for/cpp/index.html
//   - updates the "5-part switching lesson" CTA and 8-language pills on existing for/<lang>/index.html pages
// Run: node lang/learn/build-switch.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SWITCH_LANGS } from "./switch-course.mjs";
import { mycelDir, stamp } from "./build-tour.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const samplesSwitchDir = path.join(here, "samples", "switch");
export const siteForDir = path.join(mycelDir, "for");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const readSample = (slug, file) => fs.readFileSync(path.join(samplesSwitchDir, slug, file), "utf8").replace(/\n+$/, "");
const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");

const NAV = `<nav class="mycel-nav" aria-label="Mycel"><div class="mycel-nav-inner"><a class="mycel-brand" href="/mycel/"><img src="/mycel/brand/mycel-128.png" alt=""><span>mycel</span></a><div class="mycel-links"><a href="/mycel/learn/">learn</a><a href="/mycel/docs/">docs</a><a href="/mycel/play/">play</a><a href="/mycel/learn/#guides">guides</a><a class="mycel-download" href="/mycel/download/">download</a></div></div></nav>`;
const FOOTER = `<footer><a href="/">olix</a> &middot; <a href="/mycel/">Mycel programming language</a> &middot; <a href="/mycel/learn/">Learn Mycel</a> &middot; Mycel 0.2 alpha &middot; open source &middot; <a href="/provenance/">&copy; 2026 drky</a> &middot; <a href="https://github.com/drkfade/mycel">GitHub</a> &middot; <a href="https://discord.gg/FbsU8f5bCA">Discord</a></footer>`;

const PAGE_CSS = `:root{
 --bg:#0a0a0a;--bg-2:#101010;--bg-3:#171717;
 --surface:rgba(255,255,255,.035);--raised:rgba(255,255,255,.055);
 --hair:rgba(255,255,255,.11);--stroke:rgba(255,255,255,.08);
 --text:rgba(255,255,255,.92);--text-2:rgba(255,255,255,.62);--text-3:rgba(255,255,255,.4);
 --code-bg:#050505;--accent:#4085ff;--ok:#30d158;--warn:#ff9f0a;
 --sans:Inter,system-ui,-apple-system,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace;
 --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:40px;
 --r-sm:6px;--r-md:6px;--r-lg:6px;--r-pill:999px;
}
@media(prefers-color-scheme:light){:root{
 --bg:#f6f6f4;--bg-2:#fff;--bg-3:#ececea;
 --surface:rgba(0,0,0,.03);--raised:rgba(0,0,0,.05);
 --hair:rgba(0,0,0,.14);--stroke:rgba(0,0,0,.09);
 --text:rgba(0,0,0,.9);--text-2:rgba(0,0,0,.62);--text-3:rgba(0,0,0,.42);
 --code-bg:#fff;--accent:#1d5fe0;--ok:#1a8f3c;--warn:#b86a00}}
*{box-sizing:border-box;margin:0}
html{background:var(--bg);color-scheme:dark light}
body{background:var(--bg);color:var(--text);font:400 17px/1.65 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
.wrap{max-width:1920px;margin:0 auto;padding:0 var(--s4)}
code{font:400 .9em var(--mono)}
a{color:var(--accent)}
.hero{padding:var(--s6) 0 var(--s4)}
.crumbs{font:13px var(--mono);color:var(--text-3);margin-bottom:var(--s3)}
.crumbs a{color:var(--text-2);text-decoration:none}.crumbs a:hover{color:var(--text)}
h1.page{font-size:clamp(28px,5vw,44px);font-weight:700;letter-spacing:-.02em;line-height:1.15;margin:var(--s3) 0 var(--s3)}
.lead{font-size:18px;color:var(--text-2);max-width:68ch;margin-bottom:var(--s4)}
.lead b{color:var(--text);font-weight:600}
section{padding:var(--s5) 0;border-top:1px solid var(--stroke)}
.eyebrow{font:600 13px var(--mono);color:var(--text-3);margin-bottom:var(--s2)}
h2{font-size:clamp(22px,3.2vw,28px);font-weight:700;line-height:1.25;margin-bottom:var(--s3)}
h3{font-size:18px;font-weight:600;margin:var(--s4) 0 var(--s2)}
p{color:var(--text-2);max-width:68ch;margin-bottom:var(--s3)}
p,li{overflow-wrap:anywhere}
a.try{display:inline-block;padding:8px 16px;border-radius:6px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;margin:0 var(--s2) var(--s2) 0}
a.alt-btn{display:inline-block;padding:8px 14px;border-radius:6px;border:1px solid var(--hair);color:var(--text);text-decoration:none;font-weight:500;margin:0 var(--s2) var(--s2) 0}
.toc{margin:var(--s4) 0;padding-left:22px;color:var(--text-2)}
.toc li{margin:4px 0}
.progress-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 14px;border:1px solid var(--stroke);border-radius:6px;background:var(--bg-2);margin:var(--s3) 0;font:14px var(--mono);color:var(--text-2)}
.compare{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4);margin-top:var(--s3)}
@media(min-width:860px){.compare{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.habits-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4);margin-top:var(--s4)}
.habits-grid .sample{margin-top:0!important}
@media(min-width:1200px){.habits-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));align-items:start}}
@media(min-width:1100px){.hero .toc{display:none}}
.reading-grid.has-ide{grid-template-columns:minmax(0,1fr)}
.reading-grid.has-ide>.ide{margin-top:var(--s4)}
.has-ide .compare{grid-template-columns:minmax(0,1fr)}
@media(min-width:1100px){
  .reading-grid.has-ide{grid-template-columns:210px minmax(0,1fr) minmax(440px,42%);gap:28px}
  .reading-grid.has-ide>.ide{margin-top:0;grid-column:3;grid-row:1}
}
@media(min-width:1500px){.reading-grid.has-ide{grid-template-columns:240px minmax(0,1fr) minmax(560px,44%);gap:36px}}
@media(min-width:2100px){.has-ide .compare{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.toc-done-mark{color:var(--ok);font-family:var(--mono);font-size:12px;margin-left:6px}
.sample{border:1px solid var(--stroke);border-radius:6px;background:var(--code-bg);overflow:hidden;max-width:100%}
.sample .cap{display:flex;justify-content:space-between;align-items:center;gap:var(--s2);flex-wrap:wrap;padding:8px var(--s4);border-bottom:1px solid var(--stroke);background:var(--bg-3);font:12px var(--mono);color:var(--text-2)}
.sample .cap a{color:var(--accent);text-decoration:none}
pre{font:400 14px/1.6 var(--mono);padding:var(--s4);overflow-x:auto;color:var(--text);margin:0;tab-size:2}
.outl{display:block;padding:6px var(--s4) 0;font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);background:var(--surface);border-top:1px dashed var(--stroke)}
pre.out{color:var(--ok);background:var(--surface);border-top:0}
pre.out.err{color:var(--warn)}
pre.out.dim{color:var(--text-3)}
.part-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.done-btn{font:13px var(--mono);padding:5px 12px;border-radius:6px;border:1px solid var(--hair);background:var(--bg-2);color:var(--text-2);cursor:pointer}
.done-btn[aria-pressed="true"]{border-color:var(--ok);color:var(--ok)}
details.solution{margin-top:var(--s3);border:1px solid var(--stroke);border-radius:6px;padding:10px 14px;background:var(--bg-2)}
details.solution summary{cursor:pointer;font-weight:600;color:var(--text)}
details.solution .sample{margin-top:var(--s3)}
ul.pts{list-style:none;padding:0;margin-top:var(--s3);display:grid;gap:var(--s2)}
ul.pts li{position:relative;padding-left:18px;color:var(--text-2)}
ul.pts li::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);position:absolute;left:0;top:11px}
.tblwrap{margin-top:var(--s4);overflow-x:auto;border:1px solid var(--stroke);border-radius:6px}
table{border-collapse:collapse;width:100%;min-width:460px;font-size:15px}
th,td{text-align:left;padding:10px var(--s4);border-bottom:1px solid var(--stroke);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font:600 12px var(--mono);color:var(--text-3);text-transform:uppercase}
td code{padding:1px 6px;border:1px solid var(--stroke);border-radius:4px;background:var(--raised)}
.pills{display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s3)}
.pills a{padding:6px 14px;border:1px solid var(--hair);border-radius:4px;text-decoration:none;font:14px var(--mono);color:var(--text-2)}
.pills a:hover,.pills a[aria-current]{color:var(--text);background:var(--raised)}
footer{padding:var(--s6) var(--s4);text-align:center;color:var(--text-2);font-size:14px;border-top:1px solid var(--stroke);margin-top:var(--s5)}
footer a{color:var(--text-2)}`;

function pillsHtml(activeSlug, suffix = "") {
  const links = [
    `<a href="/mycel/learn/">Learn Mycel</a>`,
    ...SWITCH_LANGS.map((l) => `<a href="/mycel/for/${l.slug}/${suffix}"${l.slug === activeSlug ? ' aria-current="page"' : ""}>${esc(l.name)}</a>`)
  ];
  return `<div class="pills">${links.join("")}</div>`;
}

function renderPartComparison(lang, part) {
  const mycCode = readSample(lang.slug, part.mycFile);
  const otherCode = readSample(lang.slug, part.otherFile);
  const playHref = `/mycel/play/#code=${b64url(mycCode)}`;
  const otherOutHtml = part.otherOut !== null
    ? `<span class="outl">output (${esc(lang.toolchain)})</span><pre class="out">${esc(part.otherOut)}</pre>`
    : `<span class="outl">not run here (${esc(lang.toolchain)} not installed)</span><pre class="out dim">Save as ${esc(part.otherFile)} and run locally with ${esc(lang.toolchain)}.</pre>`;

  return `<div class="compare">
<div class="sample"><div class="cap"><span>${esc(part.otherFile)}</span><span>${esc(lang.name)}</span></div><pre>${esc(otherCode)}</pre>${otherOutHtml}</div>
<div class="sample"><div class="cap"><span>${esc(part.mycFile)}</span><span>Mycel &middot; <a href="${playHref}">open in playground</a></span></div><pre>${esc(mycCode)}</pre><span class="outl">output (mycel)</span><pre class="out">${esc(part.mycOut)}</pre></div>
</div>`;
}

function renderPart5(lang, part) {
  const habitsHtml = part.habits.map((h) => {
    const code = readSample(lang.slug, h.file);
    return `<div class="sample" style="margin-top:var(--s4)"><div class="cap"><span>${esc(h.file)}</span><span>${esc(h.label)} &middot; <a href="/mycel/play/#code=${b64url(code)}">test in playground</a></span></div><pre>${esc(code)}</pre><span class="outl">compiler says (mycel check)</span><pre class="out err">${esc(h.diag)}</pre></div>`;
  }).join("\n");

  const starterCode = readSample(lang.slug, part.starterFile);
  const solCode = readSample(lang.slug, part.solutionFile);

  return `<h3>Real habit diagnostics from the compiler</h3>
<p>When a ${esc(lang.name)} spelling slips in, Mycel names the habit and shows the Mycel form instead of a generic parse error.</p>
<div class="habits-grid">
${habitsHtml}
</div>
<h3>${esc(part.projectTitle)}</h3>
<p>${part.projectPrompt}</p>
<div class="sample"><div class="cap"><span>${esc(part.starterFile)}</span><span>starter &middot; <a href="/mycel/play/#code=${b64url(starterCode)}">open in playground</a></span></div><pre>${esc(starterCode)}</pre><span class="outl">starter output</span><pre class="out">${esc(part.starterOut)}</pre></div>
<details class="solution"><summary>Show solution (${esc(part.solutionFile)})</summary>
<p style="margin-top:var(--s3)">Run with defaults: <code>mycel run ${esc(part.solutionFile)}</code>. Pass custom CLI arguments after <code>--</code>: <code>mycel run ${esc(part.solutionFile)} -- ${esc(part.cliTestArgs.join(" "))}</code>.</p>
<div class="sample"><div class="cap"><span>${esc(part.solutionFile)}</span><span>solution &middot; <a href="/mycel/play/#code=${b64url(solCode)}">open in playground</a></span></div><pre>${esc(solCode)}</pre><span class="outl">output (mycel run)</span><pre class="out">${esc(part.solutionOut)}</pre></div>
</details>`;
}

export function renderLessonPage(lang) {
  const canonical = `https://ol1x.xyz/mycel/for/${lang.slug}/lessons/`;
  const title = `Switching from ${lang.name} to Mycel: 5-part lesson`;
  const desc = `A 5-part hands-on lesson for ${lang.titleName} switching to Mycel: side-by-side code, brace closures, .extract(Int), Result/?, ply, compiler habit diagnostics, and a CLI mini project.`;

  const toc = lang.parts.map((p) => `<li><a href="#${p.id}">Part ${p.num}: ${esc(p.title)}</a></li>`).join("");
  const sideToc = lang.parts.map((p) => `<li><a href="#${p.id}" data-toc-part="${esc(lang.slug)}:${p.num}"><span>${p.num}. ${esc(p.title)}</span></a></li>`).join("");

  const sections = lang.parts.map((p) => {
    const body = p.num < 5
      ? `<p><b>Same:</b> ${p.same}</p>\n<p><b>Simpler or different:</b> ${p.simpler}</p>\n${renderPartComparison(lang, p)}`
      : renderPart5(lang, p);

    return `<section id="${p.id}" data-part="${p.num}" aria-labelledby="h-${p.id}">
<div class="part-head">
  <div><div class="eyebrow">Part ${p.num} of 5</div><h2 id="h-${p.id}">${esc(p.title)}</h2></div>
  <button type="button" class="done-btn" data-mark="${esc(lang.slug)}:${p.num}" aria-pressed="false">Mark part ${p.num} done</button>
</div>
${body}
</section>`;
  }).join("\n");

  const pkgNote = lang.foreignFlag
    ? `Native Mycel packages (like <code>tensor</code>) install with <code>ply install tensor</code> (no flag). Foreign packages from ${esc(lang.pkgManager)} use <code>ply install &lt;pkg&gt; ${esc(lang.foreignFlag)}</code> (Python <code>--python</code> and npm <code>--npm</code> work in dev; <code>${esc(lang.foreignFlag)}</code> is recognised by <code>ply</code> and planned).`
    : `Native Mycel packages (like <code>tensor</code>) install with <code>ply install tensor</code> (no flag) and record exact dependencies in <code>ply.json</code> and <code>ply.lock</code>, replacing ${esc(lang.pkgManager)} manifests for Mycel code.`;

  const script = `<script>
(function () {
  var KEY = "mycel.switch.v1";
  var slug = ${JSON.stringify(lang.slug)};
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function notifyHost(partId, done) {
    if (typeof window.mycelProgress === "undefined" || !window.mycelProgress) return;
    try {
      var p = window.mycelProgress;
      if (done && typeof p.complete === "function") p.complete(partId);
      else if (done && typeof p.markDone === "function") p.markDone(partId);
      else if (typeof p.record === "function") p.record("switch", partId, done);
    } catch (_) {}
  }
  function sync() {
    var btns = document.querySelectorAll(".done-btn[data-mark]");
    var doneCount = 0;
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute("data-mark");
      var on = !!state[id];
      if (on) doneCount++;
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
      btns[i].textContent = on ? "Completed" : "Mark part " + (i + 1) + " done";
    }
    var status = document.getElementById("switch-progress");
    if (status) status.textContent = doneCount + " / " + btns.length + " parts done";
    var sideStatus = document.getElementById("switch-progress-side");
    if (sideStatus) sideStatus.textContent = doneCount + " / " + btns.length + " done";
    var tocLinks = document.querySelectorAll("[data-toc-part]");
    for (var j = 0; j < tocLinks.length; j++) {
      var pid = tocLinks[j].getAttribute("data-toc-part");
      var existing = tocLinks[j].querySelector(".toc-done-mark");
      if (state[pid]) {
        if (!existing) {
          var mark = document.createElement("span");
          mark.className = "toc-done-mark";
          mark.textContent = "done";
          tocLinks[j].appendChild(mark);
        }
      } else if (existing) {
        existing.remove();
      }
    }
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".done-btn[data-mark]");
    if (!btn) return;
    var id = btn.getAttribute("data-mark");
    state[id] = !state[id];
    save();
    notifyHost(id, !!state[id]);
    sync();
  });
  sync();
})();
</script>`;

  const html = `<!doctype html>
<html lang="en" data-worker="/mycel/play/worker.js?v=0">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" type="image/png" sizes="32x32" href="/mycel/brand/mycel-32.png">
<link rel="apple-touch-icon" href="/mycel/brand/mycel-256.png">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://ol1x.xyz/mycel/brand/mycel-512.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description: desc,
    url: canonical,
    mainEntityOfPage: canonical,
    inLanguage: "en",
    datePublished: "2026-11-28",
    dateModified: "2026-11-28",
    image: "https://ol1x.xyz/mycel/brand/mycel-512.png",
    about: { "@type": "ComputerLanguage", name: "Mycel", url: "https://ol1x.xyz/mycel/" },
    publisher: { "@type": "Organization", name: "olix", url: "https://ol1x.xyz/" }
  })}</script>
<style>
${PAGE_CSS}
</style>
<link rel="stylesheet" href="/mycel/site.css?v=2ba6e2e275">
<link rel="stylesheet" href="/mycel/learn/ide.css?v=0">
</head>
<body data-switch-lesson>
${NAV}
<header class="hero"><div class="wrap">
 <div class="crumbs"><a href="/">olix</a> / <a href="/mycel/">Mycel</a> / <a href="/mycel/for/${esc(lang.slug)}/">${esc(lang.name)}</a> / Switching lesson</div>
 <h1 class="page">${esc(title)}</h1>
 <p class="lead"><b>Written for ${esc(lang.titleName)}.</b> ${esc(lang.summary)}</p>
 <p>${pkgNote}</p>
 <p><a class="try" href="/mycel/play/">Open playground &rarr;</a> <a class="alt-btn" href="/mycel/for/${esc(lang.slug)}/">${esc(lang.name)} habit guide</a> <a class="alt-btn" href="/mycel/learn/">Full beginner tour</a></p>
 <div class="progress-bar"><span id="switch-progress">0 / 5 parts done</span><span>5 parts &middot; runnable samples &middot; CLI mini project</span></div>
 <ol class="toc">${toc}</ol>
</div></header>
<main><div class="wrap">
<div class="reading-grid">
<aside class="page-toc" id="switch-toc" aria-label="Lesson parts">
 <div class="page-toc-title">${esc(lang.name)} lesson &middot; <span id="switch-progress-side">0 / 5 done</span></div>
 <ol>${sideToc}<li><a href="#other-languages">Other languages</a></li></ol>
 <div class="toc-actions">
  <a href="/mycel/for/${esc(lang.slug)}/">${esc(lang.name)} habit guide</a>
  <a href="/mycel/play/">Open playground</a>
  <a href="/mycel/learn/">Full beginner tour</a>
 </div>
</aside>
<div class="reading-main">
${sections}
<section id="other-languages" aria-labelledby="h-other-languages">
 <div class="eyebrow">All switching lessons</div>
 <h2 id="h-other-languages">Switch from another language</h2>
 <p>Pick the 5-part switching lesson for another language, or read the <a href="/mycel/docs/">full Mycel docs</a>.</p>
 ${pillsHtml(lang.slug, "lessons/")}
</section>
</div>
</div>
</div></main>
${FOOTER}
<script src="/mycel/learn/ide.js?v=0"></script>
${script}
</body>
</html>
`;
  return stamp(html);
}

const EXTRA_GUIDES = {
  csharp: {
    lead: "<b>Static types, <code>??</code>, <code>?.</code>, classes, and LINQ-style chains will feel familiar right away.</b> Drop <code>Console.WriteLine</code>, <code>foreach</code>, and <code>.csproj</code> boilerplate, and get exact fix-its when C# habits slip in.",
    same: "<code>class Foo { }</code>, <code>interface</code>, <code>enum</code>, <code>??</code>, <code>?.</code>, <code>=&gt;</code> expressions, and <code>try { } catch e { }</code> all carry over. Comments start with <code>#</code> because <code>//</code> is floor division.",
    diff: [
      "No <code>using</code> namespace ceremony or <code>Program.cs</code> wrappers needed; imports are plain: <code>import http</code>, <code>import json</code>.",
      "Types follow a colon in PascalCase: <code>Int</code>, <code>Float</code> (not <code>double</code>), <code>String</code> (not <code>string</code>), <code>Bool</code> (not <code>bool</code>).",
      "<code>let</code> is immutable and <code>var</code> is mutable; <code>nil</code> replaces <code>null</code>; <code>for item in items</code> replaces <code>foreach</code>.",
      "<code>Result&lt;T, E&gt;</code> with <code>?</code> replaces <code>TryParse(..., out ...)</code> patterns, and <code>nums.filter { it &gt; 5 }</code> replaces LINQ <code>.Where(...).ToList()</code>.",
      "<code>ply install tensor</code> adds Mycel packages with <code>ply.json</code> and <code>ply.lock</code> instead of NuGet."
    ],
    sampleFile: "03_collections.myc",
    sampleOut: "big=[6, 9, 8], doubled=[12, 18, 16], total=23\npens: 12\npads: 4\n0 true\n[12, 8]",
    habitFile: "05_habit_1.myc",
    habitDiag: "error [E0101]: `foreach` — Mycel writes `for item in items { ... }`\n  --> 05_habit_1.myc:1:1\n  |\n1 | foreach x in [1, 2, 3] {\n  | ^^^^^^^\n  why: this word comes from another language\n  fix: see `mycel help habits`\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0101` explains this error with an example",
    rows: [
      ["foreach x in items", "`foreach` — Mycel writes `for item in items { ... }`"],
      ["string / bool / double", "`string` — Mycel writes `String`; `bool` is `Bool`; `double` is `Float`"],
      ["null", "`null` is JavaScript/Java — Mycel writes `nil`"],
      ["void f()", "`void` is Java/C — Mycel needs no return type for a function that returns nothing"],
      ["// comments", "comments start with `#` in Mycel (`//` is floor division)"],
      ["x?.y and x ?? y", "works: the same"],
      ["x => x + 1", "works: the same (and brace closures `xs.filter { it > 5 }`)"]
    ],
    packagesTitle: "Mycel packages with ply",
    packagesDesc: "Mycel packages install directly with <code>ply install tensor</code> (no flag) and lock versions in <code>ply.lock</code>. For C# developers moving scripts and services over, standard modules like <code>http</code>, <code>json</code>, <code>files</code>, and <code>db</code> are built in."
  },
  cpp: {
    lead: "<b>Value-semantic <code>struct</code>s, static type checking, and crisp native-feeling syntax without headers or pointers.</b> Drop <code>#include</code>, <code>::</code>, and iterator boilerplate, and get exact compiler hints when C/C++ habits appear.",
    same: "Static types catch errors before anything runs, <code>struct</code> keeps value semantics, and <code>for (k, v) in map</code> mirrors C++17 structured bindings. Comments start with <code>#</code> because <code>//</code> is whole-number division.",
    diff: [
      "No header files, <code>#include</code>, or <code>int main()</code> required; imports are plain module names like <code>import math</code> and <code>import json</code>.",
      "Types follow a colon: <code>Int</code> (64-bit), <code>Float</code> (not <code>double</code>), <code>String</code>, <code>Bool</code>. <code>let</code> replaces <code>const</code>; <code>var</code> is mutable.",
      "Paths use <code>.</code> instead of <code>::</code> (<code>Color.Red</code>, not <code>Color::Red</code>), and <code>nil</code> replaces <code>NULL</code> / <code>nullptr</code>.",
      "<code>i += 1</code> replaces <code>i++</code>; <code>nums.filter { it &gt; 5 }</code> replaces <code>begin()/end()</code> iterator algorithms; <code>.extract(Int)</code> replaces <code>&lt;regex&gt;</code>.",
      "<code>ply install tensor</code> installs Mycel packages with one command instead of CMake + vcpkg."
    ],
    sampleFile: "02_basics.myc",
    sampleOut: "1 5.0",
    habitFile: "05_habit_1.myc",
    habitDiag: "error [E0100]: `::` is Rust/C++ — Mycel writes `.` (`String.from`, `Color.Red`)\n  --> 05_habit_1.myc:1:4\n  |\n1 | std::cout << \"hi\"\n  |    ^\n  why: statements are separated by a newline or `;`\n  fix: put the next statement on its own line\n\n1 error, 0 warnings\n\nhelp: `mycel explain E0100` explains this error with an example",
    rows: [
      ["std::cout / Color::Red", "`::` is Rust/C++ — Mycel writes `.` (`String.from`, `Color.Red`)"],
      ["int x = 5; / double", "`int` is Java/C — Mycel writes `let x: Int = 5`; `double` is `Float`"],
      ["NULL", "`NULL` is C — Mycel writes `nil`"],
      ["/* block comment */", "comments start with `#` in Mycel — there are no `/* */` block comments"],
      ["i++", "`x++` — Mycel writes `x += 1`"],
      ["struct Vec2 { ... }", "works: value-type structs with methods"],
      ["// comments", "comments start with `#` in Mycel (`//` is whole-number division)"]
    ],
    packagesTitle: "Mycel packages with ply",
    packagesDesc: "Mycel packages install directly with <code>ply install tensor</code> (no CMakeLists or vcpkg manifest). Built-in modules like <code>math</code>, <code>files</code>, <code>http</code>, and <code>json</code> are always available with plain <code>import</code>."
  }
};

export function renderExtraGuidePage(lang) {
  const g = EXTRA_GUIDES[lang.slug];
  const canonical = `https://ol1x.xyz/mycel/for/${lang.slug}/`;
  const title = `Mycel programming language for ${lang.titleName}: what's the same, what's different`;
  const desc = `Coming from ${lang.name}? ${lang.summary}`;
  const sampleCode = readSample(lang.slug, g.sampleFile);
  const habitCode = readSample(lang.slug, g.habitFile);
  const rowsHtml = g.rows.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td></tr>`).join("\n");
  const ptsHtml = g.diff.map((d) => `<li>${d}</li>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" type="image/png" sizes="32x32" href="/mycel/brand/mycel-32.png">
<link rel="apple-touch-icon" href="/mycel/brand/mycel-256.png">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://ol1x.xyz/mycel/brand/mycel-512.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `Mycel for ${lang.titleName}`,
    description: desc,
    url: canonical,
    mainEntityOfPage: canonical,
    inLanguage: "en",
    datePublished: "2026-11-28",
    dateModified: "2026-11-28",
    image: "https://ol1x.xyz/mycel/brand/mycel-512.png",
    about: { "@type": "ComputerLanguage", name: "Mycel", url: "https://ol1x.xyz/mycel/" },
    publisher: { "@type": "Organization", name: "olix", url: "https://ol1x.xyz/" }
  })}</script>
<style>
${PAGE_CSS}
</style>
<link rel="stylesheet" href="/mycel/site.css?v=2ba6e2e275">
</head>
<body>
${NAV}
<header class="hero"><div class="wrap">
 <div class="crumbs"><a href="/">olix</a> / <a href="/mycel/">Mycel</a> / ${esc(lang.titleName)}</div>
 <h1 class="page">Mycel for ${esc(lang.titleName)}</h1>
 <p class="lead">${g.lead}</p>
 <p style="margin-top:var(--s4)"><a class="try" href="/mycel/for/${esc(lang.slug)}/lessons/">5-part switching lesson &rarr;</a> <a class="alt-btn" href="/mycel/play/">Try Mycel in your browser &rarr;</a></p>
</div></header>
<main><div class="wrap">
<div class="reading-grid">
<aside class="page-toc" aria-label="On this page">
 <div class="page-toc-title">On this page</div>
 <ul>
  <li><a href="#same">What is the same</a></li>
  <li><a href="#different">What is different</a></li>
  <li><a href="#habits">${esc(lang.name)} habit fix-its</a></li>
  <li><a href="#packages">Packages with ply</a></li>
  <li><a href="#switching-lesson">5-part switching lesson</a></li>
  <li><a href="#other-languages">Other languages</a></li>
 </ul>
 <div class="toc-actions">
  <a href="/mycel/for/${esc(lang.slug)}/lessons/">5-part switching lesson &rarr;</a>
  <a href="/mycel/play/">Open playground</a>
 </div>
</aside>
<div class="reading-main">
<section id="same" class="sec-split">
 <div class="sec-prose">
  <div class="eyebrow">Same</div>
  <h2>What is the same</h2>
  <p>${g.same}</p>
 </div>
 <div class="sec-wide">
  <div class="sample"><div class="cap"><span>${esc(g.sampleFile)}</span><span><a href="/mycel/play/#code=${b64url(sampleCode)}">open in playground</a></span></div><pre>${esc(sampleCode)}</pre><span class="outl">output</span><pre class="out">${esc(g.sampleOut)}</pre></div>
 </div>
</section>
<section id="different">
 <div class="eyebrow">Different</div>
 <h2>What is different</h2>
 <ul class="pts">${ptsHtml}</ul>
</section>
<section id="habits">
 <div class="eyebrow">Habit fix-its</div>
 <h2>${esc(lang.name)} habits and what Mycel says</h2>
 <p>Mycel recognises common ${esc(lang.name)} keywords, types, and operators and tells you the Mycel spelling.</p>
 <div class="sample"><div class="cap"><span>${esc(g.habitFile)}</span><span><a href="/mycel/play/#code=${b64url(habitCode)}">open in playground</a></span></div><pre>${esc(habitCode)}</pre><span class="outl">compiler says</span><pre class="out err">${esc(g.habitDiag)}</pre></div>
 <div class="tblwrap"><table><thead><tr><th>You write</th><th>Mycel says</th></tr></thead><tbody>
${rowsHtml}
 </tbody></table></div>
</section>
<section id="packages">
 <div class="eyebrow">Packages</div>
 <h2>${esc(g.packagesTitle)}</h2>
 <p>${g.packagesDesc}</p>
</section>
<section id="switching-lesson">
 <div class="eyebrow">Switching lesson</div>
 <h2>Go through the 5-part ${esc(lang.name)} switching lesson</h2>
 <p>Walk through side-by-side examples, brace closures, <code>.extract(Int)</code>, <code>Result</code>/<code>?</code>, real compiler diagnostics, and a CLI mini project in the <a href="/mycel/for/${esc(lang.slug)}/lessons/">5-part ${esc(lang.name)} to Mycel lesson</a>.</p>
</section>
<section id="other-languages">
 <div class="eyebrow">More</div>
 <h2>Other starting points</h2>
 <p>Pick the guide closest to the language you know, or take the full tour.</p>
 ${pillsHtml(lang.slug)}
</section>
</div>
</div>
</div></main>
${FOOTER}
</body>
</html>`;
  return stamp(html);
}

// Updates an existing site/public/mycel/for/<lang>/index.html cleanly so it links to lessons/ and includes all 8 pills.
export function updateExistingGuideHtml(slug, html) {
  const lessonHref = `/mycel/for/${slug}/lessons/`;
  let next = html;
  if (!next.includes(lessonHref)) {
    next = next.replace(
      `<a class="try" href="/mycel/play/">Try Mycel in your browser &rarr;</a>`,
      `<a class="try" href="${lessonHref}">5-part switching lesson &rarr;</a> <a class="try" href="/mycel/play/">Try Mycel in your browser &rarr;</a>`
    );
  }
  const pillsRe = /<div class="pills">[\s\S]*?<\/div>/;
  if (pillsRe.test(next)) {
    next = next.replace(pillsRe, pillsHtml(slug));
  }
  return stamp(next);
}

export function build() {
  const changed = [];
  for (const lang of SWITCH_LANGS) {
    const lessonPath = path.join(siteForDir, lang.slug, "lessons", "index.html");
    fs.mkdirSync(path.dirname(lessonPath), { recursive: true });
    const nextLesson = renderLessonPage(lang);
    const prevLesson = fs.existsSync(lessonPath) ? fs.readFileSync(lessonPath, "utf8") : "";
    if (nextLesson !== prevLesson) {
      fs.writeFileSync(lessonPath, nextLesson);
      changed.push(path.relative(mycelDir, lessonPath));
    }

    const guidePath = path.join(siteForDir, lang.slug, "index.html");
    fs.mkdirSync(path.dirname(guidePath), { recursive: true });
    let nextGuide;
    if (EXTRA_GUIDES[lang.slug]) {
      nextGuide = renderExtraGuidePage(lang);
    } else {
      const prevGuide = fs.readFileSync(guidePath, "utf8");
      nextGuide = updateExistingGuideHtml(lang.slug, prevGuide);
    }
    const prevGuideOnDisk = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, "utf8") : "";
    if (nextGuide !== prevGuideOnDisk) {
      fs.writeFileSync(guidePath, nextGuide);
      changed.push(path.relative(mycelDir, guidePath));
    }
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const changed = build();
  console.log(changed.length ? `wrote ${changed.join(", ")}` : "switching lesson pages already up to date");
}
