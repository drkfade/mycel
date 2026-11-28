// Renders site/public/mycel/learn/lessons.js into the static part of site/public/mycel/learn/index.html
// (between <!-- tour:start --> and <!-- tour:end -->), so every unit, node, lesson and challenge is readable without
// JavaScript and by search engines. `node lang/learn/build-tour.mjs` writes; check-tour.mjs verifies sync and stamps.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const learnDir = path.resolve(here, "../../site/public/mycel/learn");
export const pagePath = path.join(learnDir, "index.html");

export function loadLessons() {
  const ctx = { self: {} };
  vm.runInNewContext(fs.readFileSync(path.join(learnDir, "lessons.js"), "utf8"), ctx);
  return {
    levels: ctx.self.MYCEL_LEVELS || [],
    lessons: ctx.self.MYCEL_LESSONS,
    verdict: ctx.self.mycelLessonVerdict,
    codeVerdict: ctx.self.mycelCodeVerdict
  };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function render(lessons, levels = []) {
  const totalPts = lessons.reduce((a, l) => a + (l.points || 0), 0);
  const byLevel = levels.map((lv) => ({
    lv,
    items: lessons.map((l, idx) => ({ l, idx })).filter(({ l }) => l.level === lv.num)
  }));

  const pathUnitsHtml = byLevel.map(({ lv, items }) => {
    const lvPts = items.reduce((a, { l }) => a + (l.points || 0), 0);
    const lanes = [0, -1, 0, 1];
    const nodesHtml = items.map(({ l, idx }, stepIdx) => {
      const lane = lanes[stepIdx % lanes.length];
      const tag = l.challenge ? "Challenge" : `${l.points} XP`;
      return `<div class="path-row" data-lane="${lane}" data-node-row="${l.id}">
  <a href="#${l.id}" class="path-node${l.challenge ? " is-challenge" : ""}${lv.num > 0 ? " is-locked" : ""}" data-node="${l.id}" data-go="${idx}" data-level="${lv.num}">
    <span class="node-dot" aria-hidden="true">${l.challenge ? "★" : idx + 1}</span>
    <span class="node-info">
      <span class="node-title">${idx + 1}. ${esc(l.title)}</span>
      <span class="node-meta">Step ${stepIdx + 1} of ${items.length} &middot; ${tag}</span>
    </span>
    <span class="node-pill">${lv.num === 0 && stepIdx === 0 ? "Start" : lv.num > 0 ? "Locked" : "Ready"}</span>
  </a>
</div>`;
    }).join("\n");
    const skipBtn = lv.num > 0
      ? `<button type="button" class="skip-btn" data-unlock="${lv.num}" hidden>Skip ahead</button>`
      : "";
    return `<section class="unit-card${lv.num > 0 ? " is-locked" : ""}" data-level="${lv.num}" aria-labelledby="unit-h-${lv.num}">
<div class="unit-head">
  <div>
    <div class="unit-title" id="unit-h-${lv.num}"><span class="unit-kicker">Unit ${lv.num}</span> ${esc(lv.title)}</div>
    <p class="unit-desc">${esc(lv.desc)}</p>
  </div>
  <div class="unit-right">
    <span class="unit-count" data-unit-count="${lv.num}">0 / ${items.length} &middot; ${lvPts} XP</span>
    <span class="unit-award" data-badge="${lv.num}">${esc(lv.badge)} badge</span>
    ${skipBtn}
  </div>
</div>
<div class="unit-bar" aria-hidden="true"><div class="unit-fill" data-fill="${lv.num}"></div></div>
<div class="path-track">
${nodesHtml}
</div>
</section>`;
  }).join("\n");

  const body = lessons.map((l, i) => {
    const lv = levels.find((x) => x.num === l.level);
    const siblings = byLevel.find((b) => b.lv.num === l.level)?.items || [];
    const stepPos = siblings.findIndex((s) => s.l.id === l.id) + 1;
    const stepDots = siblings.map((_, sIdx) => `<span class="step-dot${sIdx + 1 === stepPos ? " cur" : ""}"></span>`).join("");
    const meta = lv
      ? `<p class="lesson-meta">Unit ${lv.num} (${esc(lv.title)}) &middot; ${l.challenge ? "<b>Challenge</b>" : "Lesson"} &middot; ${l.points} XP</p>`
      : "";
    return `<section class="lesson${l.challenge ? " is-challenge" : ""}" id="${l.id}" data-level="${l.level ?? 0}" data-step="${stepPos}" data-steps="${siblings.length}" aria-labelledby="h-${l.id}">
<div class="step-bar" data-step-bar="${l.id}">
  <span class="step-label">Unit ${lv ? lv.num : 0} &middot; Step ${stepPos} of ${siblings.length}</span>
  <span class="step-dots" aria-hidden="true">${stepDots}</span>
</div>
${meta}
<h2 id="h-${l.id}" tabindex="-1"><span class="num">${i + 1}.</span> ${esc(l.title)}</h2>
${l.text}
<pre class="static"><code>${esc(l.code)}</code></pre>
<p class="task"><b>${l.challenge ? "Challenge." : "Your turn."}</b> ${l.task}</p>
</section>`;
  }).join("\n");

  return `<!-- tour:start -->
<div id="learn-hud" class="learn-hud" hidden>
  <span id="points">0 / ${totalPts} XP</span>
  <span id="badges-summary">0 / ${levels.length} badges</span>
  <span id="progress"></span>
</div>
<div id="next-hero" class="next-hero" hidden>
  <div>
    <div class="next-hero-meta" id="hero-meta">Up next &middot; Unit 0</div>
    <h2 class="next-hero-title" id="hero-title">1. Print something</h2>
    <p class="next-hero-sub" id="hero-sub">Step 1 of 5 &middot; 10 XP</p>
  </div>
  <button type="button" class="big-go-btn" id="hero-go-btn">Start lesson &rarr;</button>
</div>
<div id="view-tabs" class="view-tabs" hidden>
  <button type="button" class="tab-btn active" id="tab-path" aria-pressed="true">Learning path (${lessons.length})</button>
  <button type="button" class="tab-btn" id="tab-lesson" aria-pressed="false">Current lesson</button>
</div>
<div id="learning-path" class="learning-path" data-total="${lessons.length}">
${pathUnitsHtml}
</div>
<div id="lessons-wrap">
${body}
</div>
<!-- tour:end -->`;
}

export function splice(html, block) {
  const a = html.indexOf("<!-- tour:start -->"), b = html.indexOf("<!-- tour:end -->");
  if (a < 0 || b < 0) throw new Error("index.html has no tour markers");
  return html.slice(0, a) + block + html.slice(b + "<!-- tour:end -->".length);
}

// .js/.css are served with a one-year immutable cache (site/firebase.json), so every link carries ?v=<content hash>.
export const mycelDir = path.resolve(learnDir, "..");
export const assetHash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
export function htmlPages(dir = mycelDir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlPages(p)); else if (e.name.endsWith(".html")) out.push(p);
  }
  return out.sort();
}
export function stamp(html) {
  // the tour runs the playground's worker; follow its build stamp so both pages load the same compiler
  const playV = (fs.readFileSync(path.join(mycelDir, "play/index.html"), "utf8").match(/worker\.js\?v=([0-9a-z]+)/) || [])[1];
  if (playV) html = html.replace(/data-worker="\/mycel\/play\/worker\.js\?v=[0-9a-z]+"/, `data-worker="/mycel/play/worker.js?v=${playV}"`);
  for (const a of [
    "site.css",
    "learn/learn.css",
    "learn/ide.css",
    "learn/ide.js",
    "learn/progress.js",
    "learn/lessons.js",
    "learn/tour.js",
    "learn/ai/ai-lessons.js",
    "learn/ai/ai-learn.js",
    "docs/docs.js"
  ]) {
    const filePath = path.join(mycelDir, a);
    if (!fs.existsSync(filePath)) continue;
    const v = assetHash(filePath);
    html = html.replace(new RegExp(`/mycel/${a.replace(/\./g, "\\.")}(\\?v=[0-9a-z]+)?\"`, "g"), `/mycel/${a}?v=${v}"`);
  }
  return html;
}
export function build() {
  const { lessons, levels } = loadLessons();
  const changed = [];
  for (const p of htmlPages()) {
    const html = fs.readFileSync(p, "utf8");
    let next = p === pagePath ? splice(html, render(lessons, levels)) : html;
    next = stamp(next);
    if (next !== html) { fs.writeFileSync(p, next); changed.push(path.relative(mycelDir, p)); }
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const changed = build();
  console.log(changed.length ? `updated: ${changed.join(", ")}` : "pages already up to date");
}
