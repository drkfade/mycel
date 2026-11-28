// Renders site/public/mycel/learn/lessons.js into the static part of site/public/mycel/learn/index.html
// (between <!-- tour:start --> and <!-- tour:end -->), so every level, lesson and challenge is readable without
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

  const levelListHtml = byLevel.map(({ lv, items }) => {
    const lvPts = items.reduce((a, { l }) => a + (l.points || 0), 0);
    const lis = items.map(({ l, idx }) => {
      const chTag = l.challenge ? ` <span class="ch-tag">challenge</span>` : "";
      const ptsTag = `<span class="pts-tag">${l.points} pts</span>`;
      return `<li><a href="#${l.id}">${idx + 1}. ${esc(l.title)}</a>${chTag} ${ptsTag}</li>`;
    }).join("");
    const skipBtn = lv.num > 0
      ? ` <button type="button" class="skip-btn" data-unlock="${lv.num}" hidden>Skip ahead</button>`
      : "";
    return `<div class="lvl-card" data-level="${lv.num}">
<div class="lvl-head">
  <div class="lvl-title"><b>Level ${lv.num} · ${esc(lv.title)}</b> <span class="lvl-pts">0 / ${lvPts} pts</span></div>
  <div class="lvl-meta"><span class="lvl-badge" data-badge="${lv.num}">${esc(lv.badge)} badge</span>${skipBtn}</div>
</div>
<p class="lvl-desc">${esc(lv.desc)}</p>
<div class="lvl-bar" aria-hidden="true"><div class="lvl-fill" data-fill="${lv.num}"></div></div>
<ol>${lis}</ol>
</div>`;
  }).join("\n");

  const body = lessons.map((l, i) => {
    const lv = levels.find((x) => x.num === l.level);
    const meta = lv
      ? `<p class="lesson-meta">Level ${lv.num} (${esc(lv.title)}) &middot; ${l.challenge ? "<b>Challenge</b>" : "Lesson"} &middot; ${l.points} pts</p>`
      : "";
    return `<section class="lesson${l.challenge ? " is-challenge" : ""}" id="${l.id}" data-level="${l.level ?? 0}" aria-labelledby="h-${l.id}">
${meta}
<h2 id="h-${l.id}" tabindex="-1"><span class="num">${i + 1}.</span> ${esc(l.title)}</h2>
${l.text}
<pre class="static"><code>${esc(l.code)}</code></pre>
<p class="task"><b>${l.challenge ? "Challenge." : "Your turn."}</b> ${l.task}</p>
</section>`;
  }).join("\n");

  return `<!-- tour:start -->
<div id="tour-status" class="tour-status" hidden>
  <span id="points">0 / ${totalPts} pts</span>
  <span id="badges-summary">0 / ${levels.length} badges</span>
  <span id="progress"></span>
</div>
<div id="level-strip" class="level-strip" hidden></div>
<details id="toc"><summary>All levels &amp; ${lessons.length} lessons <span id="toc-progress"></span></summary>
<div class="levels-grid">
${levelListHtml}
</div>
</details>
${body}
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
  for (const a of ["site.css", "learn/lessons.js", "learn/tour.js", "docs/docs.js"]) {
    const filePath = path.join(mycelDir, a);
    if (!fs.existsSync(filePath)) continue;
    const v = assetHash(filePath);
    html = html.replace(new RegExp(`/mycel/${a.replace(".", "\\.")}(\\?v=[0-9a-z]+)?"`, "g"), `/mycel/${a}?v=${v}"`);
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
