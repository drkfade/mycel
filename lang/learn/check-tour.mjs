// Checks the interactive tour on /mycel/learn/, the reference on /mycel/docs/, and the Mycel site pages,
// using the playground bundle that visitors actually run (site/public/mycel/play/mycel.js):
//   1. every lesson & challenge starting code runs and prints what the lesson says it prints;
//   2. every exercise & challenge check REJECTS the untouched starting code and ACCEPTS its solution across all tests;
//   3. learn/index.html matches lessons.js, docs/index.html matches build-docs.mjs, and ?v= stamps are current;
//   4. every runnable code sample on /mycel/ and /mycel/docs/ compiles and runs cleanly in the playground bundle;
//   5. every internal link and #anchor resolves; every page's tags balance, ids are unique, and nav links /mycel/docs/.
// Run: node lang/learn/check-tour.mjs [--online]   (also run at the end of check.mjs)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadLessons, render, splice, pagePath, mycelDir, htmlPages, stamp } from "./build-tour.mjs";
import { renderDocs, spliceDocs, docsPagePath } from "./build-docs.mjs";

const require = createRequire(import.meta.url);
require(path.join(mycelDir, "play/mycel.js"));
const Mycel = globalThis.Mycel;
const publicDir = path.resolve(mycelDir, "..");
const online = process.argv.includes("--online");
const siteOrigin = (process.env.MYCEL_SITE_ORIGIN || "https://ol1x.xyz").replace(/\/+$/, "");
const RELEASE_ARTIFACT_RE = /^mycel\/download\/[^/]+\.(?:zip|pkg|tar\.gz)$/;
const SEED = 7;
const fails = [];
const fail = (m) => { fails.push(m); console.log("  ✘ " + m); };
const ok = (m) => console.log("  ✔ " + m);
const run = (code, inputs = []) => Mycel.runSource(code, { inputs, seed: SEED, maxMillis: 5000 });
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

console.log("--- Mycel tour + docs + site (lang/learn/check-tour.mjs) ---");
const { levels, lessons, verdict, codeVerdict } = loadLessons();
if (levels.length !== 5) fail(`expected 5 levels, found ${levels.length}`);
if (lessons.length < 28 || lessons.length > 32) fail(`expected 28-32 lessons/challenges, found ${lessons.length}`);
for (const lv of levels) {
  const items = lessons.filter((l) => l.level === lv.num);
  if (!items.length) fail(`level ${lv.num} has no lessons`);
  else if (!items[items.length - 1].challenge || items[items.length - 1].id !== lv.challengeId) {
    fail(`level ${lv.num} must end with challenge ${lv.challengeId}`);
  }
}

async function grade(L, code) {
  const why = codeVerdict(L, code);
  if (why) return why;
  for (const t of L.tests) {
    const r = await run(code + (t.append || ""), t.inputs || []);
    const v = verdict(t, r);
    if (v) return v + (r.diagnosticsText ? `\n${r.diagnosticsText}` : "");
  }
  return "";
}

let interactive = 0;
let challengeCount = 0;
for (const [i, L] of lessons.entries()) {
  if (L.challenge) challengeCount++;
  const tag = `${i + 1}/${lessons.length} ${L.id}${L.challenge ? " [challenge]" : ""}`;
  const before = fails.length;
  const r = await run(L.code, L.inputs || []);
  const outp = (r.output || "").replace(/\s+$/, "");
  if (typeof L.out === "string") {
    if (!r.ok || outp !== L.out) fail(`${tag}: starting code printed ${JSON.stringify(outp)}${r.diagnosticsText ? " / " + r.diagnosticsText : r.error ? " / " + r.error.human : ""}, lesson says ${JSON.stringify(L.out)}`);
  } else if (L.id === "errors") {
    // the starting code is meant to fail, with the habit messages the lesson tells the reader to read
    if (r.ok || !/E0101|E0352/.test(r.diagnosticsText)) fail(`${tag}: starting code should fail with habit errors, got ${JSON.stringify(r.diagnosticsText || outp)}`);
  } else if (!r.ok || r.needInput) fail(`${tag}: starting code did not finish: ${r.diagnosticsText || (r.error && r.error.human) || "needs input"}`);
  const starter = await grade(L, L.code);
  if (!starter) fail(`${tag}: the exercise check accepts the untouched starting code`);
  const sol = await grade(L, L.solution);
  if (sol) fail(`${tag}: the lesson's own solution fails its check: ${sol}`);
  if (!L.hints || L.hints.length < 2) fail(`${tag}: needs at least two hints`);
  if (!L.points || L.points <= 0) fail(`${tag}: missing positive points`);
  if (fails.length === before) { interactive++; ok(`${tag}: starter output ok; check rejects starter ("${starter.split("\n")[0]}"); solution passes (${L.tests.length} test${L.tests.length === 1 ? "" : "s"})`); }
}

// 3. pages in sync with generators, assets stamped
const page = fs.readFileSync(pagePath, "utf8");
if (splice(page, render(lessons, levels)) !== page) fail("learn/index.html is out of date with lessons.js: run node lang/learn/build-tour.mjs");
else ok("learn/index.html static levels + lessons match lessons.js");

const docsPage = fs.readFileSync(docsPagePath, "utf8");
const builtDocs = renderDocs();
if (spliceDocs(docsPage, builtDocs.html) !== docsPage) fail("docs/index.html is out of date with lang/docs/: run node lang/learn/build-docs.mjs");
else ok(`docs/index.html matches lang/docs/ (${builtDocs.sectionCount} sections)`);

const pages = htmlPages();
for (const p of pages) {
  const h = fs.readFileSync(p, "utf8");
  if (stamp(h) !== h) fail(`${path.relative(mycelDir, p)}: stale ?v= stamp (run build-tour.mjs)`);
  if (!h.includes('href="/mycel/docs/"')) fail(`${path.relative(mycelDir, p)}: missing /mycel/docs/ link in nav`);
}
const playPage = fs.readFileSync(path.join(mycelDir, "play/index.html"), "utf8");
const playV = (playPage.match(/worker\.js\?v=([0-9a-z]+)/) || [])[1];
const tourV = (page.match(/data-worker="\/mycel\/play\/worker\.js\?v=([0-9a-z]+)"/) || [])[1];
if (!playV || playV !== tourV) fail(`learn page worker version ${tourV} != playground's ${playV}`); else ok(`learn page uses the playground's worker (v=${playV})`);

// 4. home page + docs page runnable samples
const home = fs.readFileSync(path.join(mycelDir, "index.html"), "utf8");
let samples = 0;
for (const m of home.matchAll(/<pre data-(run|check)(?:="([^"]*)")?>([\s\S]*?)<\/pre><pre class="out( err)?">([\s\S]*?)<\/pre>/g)) {
  const [, kind, code, src, , shown] = m;
  const r = await run(unescape(src));
  const want = unescape(shown).replace(/\s+$/, "");
  if (kind === "run") { const got = (r.output || "").replace(/\s+$/, ""); if (!r.ok || got !== want) fail(`home sample prints ${JSON.stringify(got)}, page shows ${JSON.stringify(want)}`); else samples++; }
  else { const got = (r.diagnosticsText || "").replace(/main\.myc/g, "habit.myc").replace(/\s+$/, ""); if (r.ok || !got.includes(`[${code}]`) || got !== want) fail(`home error sample: compiler says ${JSON.stringify(got)}, page shows ${JSON.stringify(want)}`); else samples++; }
}
const link = home.match(/\/mycel\/play\/#code=([A-Za-z0-9_-]+)/);
const first = home.match(/<pre data-run>([\s\S]*?)<\/pre>/);
if (!link || Buffer.from(link[1], "base64url").toString("utf8") !== unescape(first[1])) fail("home 'edit and run' link does not open the sample shown next to it"); else samples++;
if (samples < 4) fail(`only ${samples} home samples verified`); else ok(`home page: ${samples} samples/links verified against the bundle`);

let docSamples = 0;
for (const m of docsPage.matchAll(/<a class="run-btn" href="\/mycel\/play\/#code=([A-Za-z0-9_-]+)">run<\/a><\/div>\s*<pre data-run><code>([\s\S]*?)<\/code><\/pre>/g)) {
  const [, b64, shown] = m;
  const src = unescape(shown);
  if (Buffer.from(b64, "base64url").toString("utf8") !== src) {
    fail(`docs sample run link does not match displayed code: ${src.slice(0, 40)}`);
    continue;
  }
  const r = await run(src);
  if (!r.ok) {
    fail(`docs sample failed to compile/run: ${src.slice(0, 40)} -> ${r.diagnosticsText || (r.error && r.error.human)}`);
    continue;
  }
  docSamples++;
}
const docsPreRunCount = [...docsPage.matchAll(/<pre data-run>/g)].length;
if (docSamples === 0 || docSamples !== docsPreRunCount) fail(`docs runnable samples mismatch: verified ${docSamples} of ${docsPreRunCount}`);
else ok(`docs page: ${docSamples}/${docsPreRunCount} code samples + playground links verified against the bundle`);

// 5. links, anchors, tag balance, unique ids
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const idsOf = (h) => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
let links = 0;
const releaseUrls = new Set();
for (const p of pages) {
  const rel = path.relative(mycelDir, p);
  const h = fs.readFileSync(p, "utf8");
  const body = h.replace(/<script[\s\S]*?<\/script>/g, "<script></script>").replace(/<style[\s\S]*?<\/style>/g, "<style></style>").replace(/<!--[\s\S]*?-->/g, "");
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, close, name0] = m, name = name0.toLowerCase();
    if (VOID.has(name)) continue;
    if (!close) { stack.push(name); continue; }
    // <p> and <li> may be closed implicitly; pop them before matching
    while (stack.length && stack[stack.length - 1] !== name && ["p", "li", "summary"].includes(stack[stack.length - 1])) stack.pop();
    if (stack[stack.length - 1] === name) stack.pop(); else { fail(`${rel}: </${name}> closes <${stack[stack.length - 1] || "nothing"}>`); break; }
  }
  const left = stack.filter((t) => !["p", "li", "html", "head", "body"].includes(t));
  if (left.length) fail(`${rel}: unclosed <${left.join("> <")}>`);
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail(`${rel}: duplicate id ${dup.join(", ")}`);
  for (const m of h.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    let u = m[1];
    if (/^(https?:|mailto:|data:)/.test(u) || u.startsWith("#code=")) continue;
    const [pathPart, hash] = u.split("#");
    const target = pathPart ? (pathPart.startsWith("/") ? path.join(publicDir, pathPart.split("?")[0]) : path.resolve(path.dirname(p), pathPart.split("?")[0])) : p;
    let file = target;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    const relPublic = path.relative(publicDir, file).split(path.sep).join("/");
    if (RELEASE_ARTIFACT_RE.test(relPublic)) {
      if (online) releaseUrls.add(`${siteOrigin}/${relPublic}`);
      links++;
      continue;
    }
    if (!fs.existsSync(file)) { fail(`${rel}: broken link ${u}`); continue; }
    if (hash && !hash.startsWith("code=") && !hash.startsWith("ex=") && file.endsWith(".html") && !idsOf(fs.readFileSync(file, "utf8")).has(hash)) fail(`${rel}: link ${u} points at a missing #${hash}`);
    links++;
  }
}
ok(`${pages.length} pages: ${links} internal links resolve, tags balance, ids unique`);
if (online && releaseUrls.size) {
  let verifiedOnline = 0;
  for (const url of releaseUrls) {
    try {
      let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
      if (res.status === 405 || res.status === 501) res = await fetch(url, { method: "GET", headers: { range: "bytes=0-0" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) fail(`online release artifact ${url}: HTTP ${res.status}`);
      else verifiedOnline++;
    } catch (e) {
      fail(`online release artifact ${url}: ${e.message}`);
    }
  }
  if (verifiedOnline === releaseUrls.size) ok(`online: ${verifiedOnline} release artifact(s) reachable on ${siteOrigin}`);
}

console.log(`\ntour: ${interactive}/${lessons.length} lessons+challenges verified (${lessons.length - challengeCount} lessons, ${challengeCount} challenges)`);
if (fails.length) { console.log(`FAILED: ${fails.length} problem(s)`); process.exit(1); }
console.log("tour + site checks PASSED");
