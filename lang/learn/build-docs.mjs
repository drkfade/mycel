// Renders lang/docs/{SPEC.md, stdlib/*.md, HABITS.md} into site/public/mycel/docs/index.html
// between <!-- docs:start --> and <!-- docs:end --> so the reference never drifts from the compiler docs.
// Run: node lang/learn/build-docs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const docsDir = path.resolve(here, "../docs");
export const siteDocsDir = path.resolve(here, "../../site/public/mycel/docs");
export const docsPagePath = path.join(siteDocsDir, "index.html");

const STDLIB_ORDER = [
  "prelude", "json", "math", "re", "time", "task", "http", "web",
  "fs", "files", "io", "db", "sqlite", "crypto", "env", "process",
  "log", "test", "ui"
];

// Verified runnable samples shown alongside major spec sections and browser-safe stdlib modules.
// Every sample here is compiled and run against play/mycel.js by lang/learn/check-tour.mjs.
const SPEC_SAMPLES = {
  "1": {
    title: "lexical.myc",
    code: `# line comment
## doc comment
let count = 1_000
let ratio = 3.14
let msg = f"count={count}, ratio={ratio:.1f}"
print(msg)`
  },
  "2": {
    title: "types.myc",
    code: `let whole: Int = 7
let part: Float = 2
let ratio = whole / part
let wholeDiv = 7.div(2)
let maybe: Int? = "42".toInt()
print(ratio, wholeDiv, maybe ?? 0)`
  },
  "3": {
    title: "declarations.myc",
    code: `struct Point {
  let x: Int, y: Int
}

fn manhattan(Point{x, y}: Point) -> Int => x.abs + y.abs

let p = Point(x: 3, y: -4)
let q = p.with(y: 2)
print(manhattan(p), manhattan(q))`
  },
  "4": {
    title: "expressions.myc",
    code: `let nums = [1, 2, 3, 4, 5]
let doubledEvens = [n * 2 for n in nums if n % 2 == 0]
let lengths = {w: len(w) for w in ["mycel", "go", "rust"]}
fn addOne(x: Int) => x + 1
print(doubledEvens)
print(lengths)
print(41 |> addOne)`
  },
  "5": {
    title: "control.myc",
    code: `enum Status { Ok(Int), Fail(String) }

fn describe(s: Status) -> String {
  return match s {
    .Ok(code) => f"ok ({code})"
    .Fail(msg) => f"err: {msg}"
  }
}

outer: for r in 0..3 {
  for c in 0..3 {
    if r == 1 && c == 1 { break outer }
  }
}
print(describe(.Ok(200)), describe(.Fail("missing")))`
  },
  "6": {
    title: "errors.myc",
    code: `fn parsePositive(text: String) -> Result<Int, String> {
  if let n = text.toInt() {
    if n > 0 { return Ok(n) }
    return Err("must be > 0")
  }
  return Err("not an int")
}

print(parsePositive("12"), parsePositive("-3"), parsePositive("abc"))`
  },
  "7": {
    title: "concurrency.myc",
    code: `import task

async fn worker(name: String, ch: task.Channel<String>, ms: Int) {
  await task.sleep(ms)
  ch.send(name)
}

async fn main() {
  let a = task.Channel<String>()
  let b = task.Channel<String>()
  spawn worker("fast", a, 5)
  spawn worker("slow", b, 30)
  let (which, msg) = await task.select([a, b])
  print(which, msg ?? "closed")
}`
  },
  "8": {
    title: "modules.myc",
    code: `import math as m
from math import gcd

print(m.sqrt(25.0), gcd(18, 24))`
  },
  "9": {
    title: "capabilities.myc",
    code: `import fs

match fs.readText("secret.txt") {
  .Ok(text) => print(text)
  .Err(err) => print("sandbox blocked:", err.message.contains("denied"))
}`
  },
  "10": {
    title: "stdlib.myc",
    code: `import math
import time

print(math.gcd(24, 36), time.minutes(3).toSeconds())`
  }
};

const STDLIB_SAMPLES = {
  prelude: {
    title: "prelude.myc",
    code: `let items = ["tea", "cake", "pie"]
let upper = items.map(s => s.upper()).filter(s => len(s) >= 4)
print(upper.join(", "))
let tags = Set(["a", "b"]) | Set(["b", "c"])
print(tags.toArray().sorted())`
  },
  json: {
    title: "json_demo.myc",
    code: `import json

let order: json.Json = {"id": 42, "items": ["tea", "cake"], "paid": true}
print(order["items"][0].asString ?? "none")
print(order.stringify())`
  },
  math: {
    title: "math_demo.myc",
    code: `import math

print(f"{math.PI:.4f}")
print(math.gcd(36, 48), math.hypot(3.0, 4.0))`
  },
  re: {
    title: "regex_demo.myc",
    code: `import re

let rx = re.Regex.compile("[0-9]+").unwrap()
print(rx.isMatch("order 402"))
print(rx.replace("room 12", with: "99"))`
  },
  time: {
    title: "time_demo.myc",
    code: `import time

let d = time.minutes(2)
print(d.toSeconds(), time.iso(0))`
  },
  task: {
    title: "task_demo.myc",
    code: `import task

async fn work(n: Int) -> Int {
  await task.sleep(2)
  return n * 10
}

async fn main() {
  let results = await task.all([work(1), work(2), work(3)])
  print(results)
}`
  },
  http: {
    title: "http_demo.myc",
    code: `import http

let res = http.text("ok", status: 200)
print(res.status, res.ok, res.body)`
  },
  web: {
    title: "web_demo.myc",
    code: `import web
import http

let app = web.App()
app.get("/hi/:name", req => web.json({"hello": req.params["name"]}))

let res = app.handle(http.Request(method: "GET", path: "/hi/Ada", query: {}, headers: {}, body: ""))
print(res.status, res.body)`
  },
  fs: {
    title: "fs_demo.myc",
    code: `import fs

print(fs.join("src", "main.myc"), fs.extension("main.myc"))
match fs.readText("notes.txt") {
  .Ok(text) => print(text)
  .Err(err) => print("denied or missing")
}`
  },
  files: {
    title: "files_demo.myc",
    code: `import files

let p = files.path("src/main.myc")
print(p.name, p.stem, p.extension)`
  },
  db: {
    title: "db_demo.myc",
    code: `import db

match db.openKV() {
  .Ok(kv) => print(kv.count())
  .Err(_) => print("db requires CLI permissions")
}`
  },
  crypto: {
    title: "crypto_demo.myc",
    code: `import crypto

let enc = crypto.base64Encode("mycel")
print(enc, crypto.base64Decode(enc).unwrap())`
  },
  env: {
    title: "env_demo.myc",
    code: `import env

print(env.platform(), env.args())`
  },
  log: {
    title: "log_demo.myc",
    code: `import log

log.setLevel(.Info)
log.info("server ready")`
  },
  test: {
    title: "test_demo.myc",
    code: `import test

fn double(n: Int) -> Int => n * 2

test.assertEq(double(21), 42)
test.assertTrue(double(3) > 5)
print("checks passed")`
  },
  ui: {
    title: "ui_demo.myc",
    code: `import ui

let label = ui.text("Hello from ui")
print("created element")`
  }
};

const HABITS_SAMPLE = {
  title: "habits_ok.myc",
  code: `let nums = [1, 2, 3, 4]
let doubled = [n * 2 for n in nums if n > 1]
for i, n in doubled {
  print(f"{i}: {n}")
}`
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

function makeSlugger() {
  const seen = new Set();
  return (raw) => {
    const base = slug(raw);
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    return id;
  };
}

function renderInline(text) {
  // Tokenize code spans first so *, _, |, & inside `...` are never parsed as formatting.
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const dbl = text[i + 1] === "`";
      const fence = dbl ? "``" : "`";
      const end = text.indexOf(fence, i + fence.length);
      if (end >= 0) {
        const inner = text.slice(i + fence.length, end).replace(/\\\|/g, "|");
        out += `<code>${esc(inner)}</code>`;
        i = end + fence.length;
        continue;
      }
    }
    const nextTick = text.indexOf("`", i);
    const chunk = nextTick >= 0 ? text.slice(i, nextTick) : text.slice(i);
    out += formatPlain(chunk);
    if (nextTick < 0) break;
    i = nextTick;
  }
  return out;
}

function formatPlain(s) {
  let html = esc(s.replace(/\\\|/g, "|"));
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return html;
}

function splitTableRow(line) {
  // Split unescaped pipes
  const cells = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (line[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += line[i];
    }
  }
  cells.push(cur.trim());
  if (cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function renderSample(sample) {
  const b64 = Buffer.from(sample.code, "utf8").toString("base64url");
  return `<div class="sample" data-doc-entry>
<div class="cap"><span>${esc(sample.title)}</span><a class="run-btn" href="/mycel/play/#code=${b64}">run</a></div>
<pre data-run><code>${esc(sample.code)}</code></pre>
</div>`;
}

function renderMarkdownBlocks(lines, opts = {}) {
  const { makeId, parentPrefix, baseLevel = 2, splitEntries = false, markTableRows = false } = opts;
  const html = [];
  const headings = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Fenced code block (syntax / signature reference)
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      html.push(`<pre class="sig"><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      const depth = hm[1].length;
      const rawTitle = hm[2].trim();
      const tagNum = Math.min(4, Math.max(baseLevel, depth));
      const tag = `h${tagNum}`;
      const id = makeId(`${parentPrefix}-${rawTitle}`);
      headings.push({ level: tagNum, id, title: rawTitle });
      html.push(`<${tag} id="${id}">${renderInline(rawTitle)} <a class="anchor" href="#${id}" aria-label="Anchor for ${esc(rawTitle)}">#</a></${tag}>`);
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1].trim())) {
      const head = splitTableRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const hasHead = head.some((c) => c.length > 0);
      const thead = hasHead ? `<thead><tr>${head.map((c) => `<th>${renderInline(c)}</th>`).join("")}</tr></thead>` : "";
      const tbody = rows.map((r) => `<tr${markTableRows ? " data-doc-entry" : ""}>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`).join("\n");
      html.push(`<div class="tblwrap"><table>${thead}<tbody>\n${tbody}\n</tbody></table></div>`);
      continue;
    }

    // Unordered list
    if (/^\*\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\*\s+/.test(lines[i])) {
        let itemText = lines[i].replace(/^\*\s+/, "");
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\*\s+/.test(lines[i])) {
          itemText += " " + lines[i].trim();
          i++;
        }
        items.push(`<li${splitEntries ? " data-doc-entry" : ""}>${renderInline(itemText)}</li>`);
      }
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Paragraph
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !/^\*\s+/.test(lines[i]) &&
      !(lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1].trim()))
    ) {
      pLines.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${renderInline(pLines.join(" "))}</p>`);
  }

  return { html: html.join("\n"), headings };
}

function renderSpecSection(specText, makeId) {
  const lines = specText.split("\n");
  // Drop top-level `# Mycel language specification (v0.1)` and split by `## `
  const parts = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      parts.push(current);
      current = { heading: line.slice(3).trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  parts.push(current);

  const tocItems = [];
  const sectionsHtml = [];
  const intro = parts.shift();
  if (intro && intro.lines.some((l) => l.trim())) {
    const r = renderMarkdownBlocks(intro.lines, { makeId, parentPrefix: "spec" });
    sectionsHtml.push(`<div class="doc-intro">${r.html}</div>`);
  }

  for (const part of parts) {
    const secId = makeId(`spec-${part.heading}`);
    const secNum = (part.heading.match(/^(\d+)\./) || [])[1];
    tocItems.push({ id: secId, title: part.heading });
    const rendered = renderMarkdownBlocks(part.lines, { makeId, parentPrefix: secId, baseLevel: 3, splitEntries: true });
    const sample = secNum && SPEC_SAMPLES[secNum] ? renderSample(SPEC_SAMPLES[secNum]) : "";
    sectionsHtml.push(`<section class="doc-sec" id="${secId}" data-doc-section>
<h3 id="${secId}-h">${renderInline(part.heading)} <a class="anchor" href="#${secId}" aria-label="Anchor for ${esc(part.heading)}">#</a></h3>
<div class="doc-sec-body" data-doc-entry>
${rendered.html}
</div>
${sample}
</section>`);
  }

  return {
    tocItems,
    html: `<section class="doc-part" id="spec">
<h2>Language specification <a class="anchor" href="#spec" aria-label="Anchor for Language specification">#</a></h2>
${sectionsHtml.join("\n")}
</section>`
  };
}

function renderStdlibSection(makeId) {
  const files = fs.readdirSync(path.join(docsDir, "stdlib"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
  const ordered = [
    ...STDLIB_ORDER.filter((m) => files.includes(m)),
    ...files.filter((m) => !STDLIB_ORDER.includes(m)).sort()
  ];

  const tocItems = [];
  const modulesHtml = [];

  for (const mod of ordered) {
    const raw = fs.readFileSync(path.join(docsDir, "stdlib", `${mod}.md`), "utf8");
    const lines = raw.split("\n").filter((l) => !l.startsWith("# "));
    const modId = makeId(`std-${mod}`);
    const displayName = mod === "prelude" ? "prelude (built-ins)" : mod;
    tocItems.push({ id: modId, title: displayName });

    // Split module body by `## ` symbols so each function/type is an independently filterable entry
    const entries = [];
    let cur = { title: null, lines: [] };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (cur.title !== null || cur.lines.some((l) => l.trim())) entries.push(cur);
        cur = { title: line.slice(3).trim(), lines: [] };
      } else {
        cur.lines.push(line);
      }
    }
    if (cur.title !== null || cur.lines.some((l) => l.trim())) entries.push(cur);

    const entryHtml = [];
    for (const entry of entries) {
      if (entry.title === null) {
        const r = renderMarkdownBlocks(entry.lines, { makeId, parentPrefix: modId, baseLevel: 4 });
        entryHtml.push(r.html);
        continue;
      }
      // Split entry's `####` methods into sub-entries so filtering a method like `trim` or `select` hides unrelated methods!
      const subParts = [];
      let sub = { title: null, lines: [] };
      for (const l of entry.lines) {
        if (l.startsWith("#### ")) {
          subParts.push(sub);
          sub = { title: l.slice(5).trim(), lines: [] };
        } else {
          sub.lines.push(l);
        }
      }
      subParts.push(sub);

      const symId = makeId(`${modId}-${entry.title}`);
      const headRender = renderMarkdownBlocks(subParts[0].lines, { makeId, parentPrefix: symId, baseLevel: 4 });
      const methodsHtml = [];
      for (let k = 1; k < subParts.length; k++) {
        const m = subParts[k];
        const methId = makeId(`${symId}-${m.title}`);
        const mr = renderMarkdownBlocks(m.lines, { makeId, parentPrefix: methId, baseLevel: 4 });
        methodsHtml.push(`<div class="doc-method" id="${methId}" data-doc-entry>
<h5><code>${esc(m.title)}</code> <a class="anchor" href="#${methId}" aria-label="Anchor for ${esc(entry.title)}.${esc(m.title)}">#</a></h5>
${mr.html}
</div>`);
      }

      if (methodsHtml.length) {
        entryHtml.push(`<div class="doc-type" data-doc-group>
<h4 id="${symId}"><code>${esc(entry.title)}</code> <a class="anchor" href="#${symId}" aria-label="Anchor for ${esc(entry.title)}">#</a></h4>
<div class="doc-type-head" data-doc-entry>${headRender.html}</div>
${methodsHtml.join("\n")}
</div>`);
      } else {
        entryHtml.push(`<div class="doc-entry" id="${symId}" data-doc-entry>
<h4><code>${esc(entry.title)}</code> <a class="anchor" href="#${symId}" aria-label="Anchor for ${esc(entry.title)}">#</a></h4>
${headRender.html}
</div>`);
      }
    }

    const sample = STDLIB_SAMPLES[mod] ? renderSample(STDLIB_SAMPLES[mod]) : "";
    const browserNote = ["fs", "files", "db", "sqlite", "crypto", "env", "process"].includes(mod)
      ? `<p class="note-dim">Requires CLI capabilities (e.g. <code>--allow-read</code>) on your machine; denied or unavailable in the browser sandbox.</p>`
      : "";

    modulesHtml.push(`<section class="doc-sec" id="${modId}" data-doc-section>
<h3>${esc(displayName)} <a class="anchor" href="#${modId}" aria-label="Anchor for ${esc(displayName)}">#</a></h3>
${browserNote}${sample}
${entryHtml.join("\n")}
</section>`);
  }

  return {
    tocItems,
    html: `<section class="doc-part" id="stdlib">
<h2>Standard library <a class="anchor" href="#stdlib" aria-label="Anchor for Standard library">#</a></h2>
<p>Mycel ships ${ordered.length} standard modules. <code>prelude</code> is loaded automatically; every other module loads with <code>import &lt;name&gt;</code>.</p>
${modulesHtml.join("\n")}
</section>`
  };
}

function renderHabitsSection(habitsText, makeId) {
  const lines = habitsText.split("\n");
  const groups = [];
  let cur = { heading: null, lines: [] };
  for (const line of lines) {
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      groups.push(cur);
      cur = { heading: line.slice(3).trim(), lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  groups.push(cur);

  const tocItems = [];
  const blocks = [];
  const intro = groups.shift();
  if (intro && intro.lines.some((l) => l.trim())) {
    const r = renderMarkdownBlocks(intro.lines, { makeId, parentPrefix: "habits" });
    blocks.push(`<div class="doc-intro">${r.html}</div>`);
  }

  for (const g of groups) {
    const gid = makeId(`habits-${g.heading}`);
    tocItems.push({ id: gid, title: g.heading });
    const r = renderMarkdownBlocks(g.lines, { makeId, parentPrefix: gid, baseLevel: 4, markTableRows: true });
    blocks.push(`<section class="doc-sec" id="${gid}" data-doc-section>
<h3>${renderInline(g.heading)} <a class="anchor" href="#${gid}" aria-label="Anchor for ${esc(g.heading)}">#</a></h3>
${r.html}
</section>`);
  }

  return {
    tocItems,
    html: `<section class="doc-part" id="habits">
<h2>Habits from other languages <a class="anchor" href="#habits" aria-label="Anchor for Habits from other languages">#</a></h2>
${blocks.join("\n")}
${renderSample(HABITS_SAMPLE)}
</section>`
  };
}

export function renderDocs() {
  const makeId = makeSlugger();
  // Reserve top-level ids
  for (const id of ["spec", "stdlib", "habits", "docs-nav", "docs-body", "toc", "doc-filter", "doc-clear", "doc-count"]) {
    makeId(id);
  }
  const specText = fs.readFileSync(path.join(docsDir, "SPEC.md"), "utf8");
  const habitsText = fs.readFileSync(path.join(docsDir, "HABITS.md"), "utf8");

  const spec = renderSpecSection(specText, makeId);
  const stdlib = renderStdlibSection(makeId);
  const habits = renderHabitsSection(habitsText, makeId);

  const tocGroup = (title, href, items) => `<div class="toc-group">
<a class="toc-head" href="${href}">${esc(title)}</a>
<ul>${items.map((x) => `<li><a href="#${x.id}">${esc(x.title)}</a></li>`).join("")}</ul>
</div>`;

  const sidebar = `<aside id="docs-nav" aria-label="Documentation table of contents">
<div class="filter-box">
<input id="doc-filter" type="search" placeholder="Filter reference (e.g. match, split, Channel)..." aria-label="Filter documentation">
<button id="doc-clear" type="button" hidden>Clear</button>
<span id="doc-count" aria-live="polite"></span>
</div>
<details id="toc" open><summary>Contents (${spec.tocItems.length + stdlib.tocItems.length + habits.tocItems.length} sections)</summary>
<nav aria-label="Reference sections">
${tocGroup("Language spec", "#spec", spec.tocItems)}
${tocGroup("Standard library", "#stdlib", stdlib.tocItems)}
${tocGroup("Other languages", "#habits", habits.tocItems)}
</nav>
</details>
</aside>`;

  const body = `<div id="docs-body">
${spec.html}
${stdlib.html}
${habits.html}
</div>`;

  return {
    sectionCount: spec.tocItems.length + stdlib.tocItems.length + habits.tocItems.length,
    html: `<!-- docs:start -->\n<div class="docs-layout">\n${sidebar}\n${body}\n</div>\n<!-- docs:end -->`
  };
}

export function spliceDocs(html, block) {
  const a = html.indexOf("<!-- docs:start -->"), b = html.indexOf("<!-- docs:end -->");
  if (a < 0 || b < 0) throw new Error("docs/index.html has no docs markers");
  return html.slice(0, a) + block + html.slice(b + "<!-- docs:end -->".length);
}

export function buildDocs() {
  const html = fs.readFileSync(docsPagePath, "utf8");
  const { html: rendered, sectionCount } = renderDocs();
  const next = spliceDocs(html, rendered);
  const changed = next !== html;
  if (changed) fs.writeFileSync(docsPagePath, next);
  return { changed, sectionCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { changed, sectionCount } = buildDocs();
  console.log(changed ? `updated docs/index.html (${sectionCount} sections)` : `docs/index.html already up to date (${sectionCount} sections)`);
}
