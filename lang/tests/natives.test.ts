import { test } from "node:test";
import * as assert from "node:assert/strict";
import { compile } from "../src/host";
import { createRuntime, newCtx } from "../src/runtime";
import { preludeNatives } from "../src/natives";
import { stdNatives } from "../src/stdlib";
import { FnInfo } from "../src/types";

const ALL_STD = ["task", "math", "json", "fs", "env", "process", "time", "re", "log", "test", "crypto", "io", "http", "sqlite", "web", "ui", "db", "files"];

test("every extern declared in the prelude and std has a native implementation (and no native is orphaned)", () => {
  const src = ALL_STD.map((m) => `import ${m}`).join("\n") + "\nfn main() {}\n";
  const c = compile({ source: src, file: "all.olx" });
  assert.equal(c.program.ok, true, c.program.diagnostics.map((d) => d.message).join("\n"));
  const rt = createRuntime(newCtx({}, () => {}), (r) => ({ ...preludeNatives(r), ...stdNatives(r, {}, []) }));
  const declared = new Set<string>();
  const collect = (f: FnInfo) => { if (f.native) declared.add(f.native); };
  for (const m of c.program.modules) {
    for (const g of m.fns.values()) g.forEach(collect);
    for (const d of m.types.values()) {
      for (const l of [...d.methods.values(), ...d.statics.values()]) l.forEach(collect);
      d.getters.forEach(collect); d.setters.forEach(collect); d.ctors.forEach(collect);
    }
  }
  assert.ok(declared.size > 150, `only ${declared.size} natives declared?`);
  const missing = [...declared].filter((k) => typeof rt.natives[k] !== "function");
  assert.deepEqual(missing, [], "declared in .olx but not implemented");
  // natives the checker emits for syntax that has no declaration: `text.extract(kind)`
  const SYNTHETIC = new Set(["String.extract"]);
  const orphan = Object.keys(rt.natives).filter((k) => !declared.has(k) && !SYNTHETIC.has(k));
  assert.deepEqual(orphan, [], "implemented but not declared (unreachable)");
});
