import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { execFileSync } from "node:child_process";

// WO111 item 19: the playground's bundle (site/public/mycel/play/mycel.js, rebuilt here from dist/) runs every starter
// example in a bare V8 context with only browser-like globals — no require, process, Buffer or fs.
const lang = path.resolve(__dirname, "..", "..");
const play = path.resolve(lang, "..", "site", "public", "mycel", "play");
const have = fs.existsSync(play);
const EXPECT: Record<string, string> = {
  hello: "hi\n",
  fstrings: "Hello Ada!\n3 coffees cost 13.50\ncount=3\n",
  loops: "0 apple\n1 pear\n2 fig\ntotal: 108 biggest: 42\n[4, 8, 16, 42]\n",
  function: "Hi Sam!\nHi Jo! Hi Jo! Hi Jo!\n",
  class: "Mia has 42.50\n",
  match: "3.14\n6.00\n",
  words: "the 3\ncat 1\nand 2\nhat 1\nbat 1\n",
  guess: "I'm thinking of a number from 1 to 100.\nYour guess: 50\nHigher!\nYour guess: 75\nLower!\nYour guess: 63\nYes! It was 63. You needed 3 tries.\n",
  counter: "",
  todo: "",
};
function load(dir: string) {
  const ctx: any = vm.createContext({ console, setTimeout, clearTimeout, queueMicrotask, crypto: globalThis.crypto, TextEncoder, TextDecoder });
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(dir, "mycel.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(play, "examples.js"), "utf8"), ctx);
  return ctx;
}
test("playground: every starter example runs in the browser bundle with the expected output", { skip: have ? false : "site/ not present" }, async () => {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "mycel-play-"));
  execFileSync("node", [path.join(lang, "web", "build.mjs"), tmp]);
  const ctx = load(tmp);
  const ids = ctx.MYCEL_EXAMPLES.map((e: any) => e.id);
  assert.ok(ids.length >= 8 && ids.length <= 12, `8-12 examples, have ${ids.length}`);
  for (const e of ctx.MYCEL_EXAMPLES) {
    const r = await ctx.Mycel.runSource(e.code, { inputs: e.inputs, seed: 1 });
    if (e.id === "oops") { assert.match(r.diagnosticsText, /`elif` is Python — Mycel writes `else if`[\s\S]*main\.myc:5:1/); continue; }
    assert.equal(r.diagnosticsText, "", `${e.id}: ${r.diagnosticsText}`);
    assert.equal(r.output, EXPECT[e.id], e.id);
    assert.equal(r.needInput, false, e.id);
    if (e.id === "counter") {
      assert.ok(r.ui, "counter should produce a UI tree");
      assert.equal(r.ui.title, "Counter");
      const plusBtn = r.ui.content.children[1].children[1];
      assert.equal(plusBtn.text, "+");
      const u1 = ctx.Mycel.handleUiEvent({ id: plusBtn.id, event: "click" });
      assert.equal(u1.content.children[0].text, "Count: 1");
      const u2 = ctx.Mycel.handleUiEvent({ id: plusBtn.id, event: "click" });
      assert.equal(u2.content.children[0].text, "Count: 2");
    }
    if (e.id === "todo") {
      assert.ok(r.ui, "todo should produce a UI tree");
      assert.equal(r.ui.title, "Todo List");
      const row = r.ui.content.children[1];
      const inp = row.children[0];
      const addBtn = row.children[1];
      assert.equal(addBtn.text, "Add");
      ctx.Mycel.handleUiEvent({ id: inp.id, event: "input", value: "Ship item 21b" });
      const u1 = ctx.Mycel.handleUiEvent({ id: addBtn.id, event: "click" });
      const items = u1.content.children[2].children;
      assert.equal(items.length, 3);
      assert.equal(items[2].text, "• Ship item 21b");
    }
  }
  // input() with no answer yet stops and asks; the sandbox has no file access; an endless loop hits the time limit
  const ask = await ctx.Mycel.runSource('let n = input("n? ")\nprint(n)', { inputs: [] });
  assert.equal(ask.needInput, true); assert.equal(ask.output, "n? ");
  const fsr = await ctx.Mycel.runSource('import std.fs\nprint(fs.readText("/etc/hosts"))', {});
  assert.match(fsr.output, /CapabilityError: fs\.read of "\/etc\/hosts" denied/);
  const loop = await ctx.Mycel.runSource("while true { }", { maxMillis: 300 });
  assert.match(loop.error.message, /time limit of 300 ms exceeded|step limit of \d+ exceeded/); // whichever trips first; the page also kills the worker
  const panic = await ctx.Mycel.runSource("let xs = [1]\nprint(xs[5])", {});
  assert.equal(panic.error.line, 2, `panic trace should map to line 2: ${panic.error.human}`);
});
test("playground: the deployed bundle is the current build", { skip: have ? false : "site/ not present" }, () => {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "mycel-play-"));
  execFileSync("node", [path.join(lang, "web", "build.mjs"), tmp]);
  assert.equal(fs.readFileSync(path.join(play, "mycel.js"), "utf8"), fs.readFileSync(path.join(tmp, "mycel.js"), "utf8"), "run `node web/build.mjs` after changing the compiler");
});
