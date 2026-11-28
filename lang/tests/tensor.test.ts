import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const core = require(path.resolve(__dirname, "..", "..", "packages", "tensor", "native", "core.cjs"));
const T = core;

const rng = new core.Rng(123);
const rnd = (shape: number[], std = 1) => T.randn(rng, shape, std);
const leaf = (shape: number[], std = 1) => T.requireGrad(rnd(shape, std));
const positive = (shape: number[]) => { const t = T.requireGrad(T.rand(rng, shape)); for (let i = 0; i < t.data.length; i++) t.data[i] += 0.5; return t; };

/** loss = sum(f(inputs) * fixed random weights): a non-trivial scalar so every output element matters */
function check(name: string, inputs: any[], f: (...xs: any[]) => any, tol = 1e-5) {
  const probe = f(...inputs);
  const weights = T.randn(new core.Rng(7), probe.shape);
  const lossOf = () => T.sum(T.mul(f(...inputs), weights));
  for (const x of inputs) T.zeroGrad(x);
  T.backward(lossOf());
  const analytic = inputs.map((x) => Float64Array.from(x.gdata));
  const eps = 1e-6;
  inputs.forEach((x, k) => {
    for (let i = 0; i < x.data.length; i++) {
      const old = x.data[i];
      x.data[i] = old + eps; const up = lossOf().data[0];
      x.data[i] = old - eps; const down = lossOf().data[0];
      x.data[i] = old;
      const numeric = (up - down) / (2 * eps);
      const err = Math.abs(numeric - analytic[k][i]) / Math.max(1, Math.abs(numeric));
      assert.ok(err < tol, `${name}: input ${k} element ${i}: autograd ${analytic[k][i]} vs numeric ${numeric}`);
    }
  });
}

test("gradient check: elementwise binary ops with and without broadcasting", () => {
  check("add", [leaf([3, 4]), leaf([3, 4])], T.add);
  check("add bcast row", [leaf([3, 4]), leaf([4])], T.add);
  check("add bcast col", [leaf([3, 1]), leaf([1, 4])], T.add);
  check("sub", [leaf([2, 3]), leaf([3])], T.sub);
  check("sub 3d bias", [leaf([2, 3, 4]), leaf([3, 4])], T.sub);
  check("mul bcast row", [leaf([3, 4]), leaf([4])], T.mul);
  check("mul same shape", [leaf([3, 4]), leaf([3, 4])], T.mul);
  check("sub same shape", [leaf([3, 4]), leaf([3, 4])], T.sub);
  check("mul", [leaf([2, 3, 4]), leaf([3, 1])], T.mul);
  check("mul scalar", [leaf([2, 3]), T.requireGrad(T.scalar(1.7))], T.mul);
  check("div", [leaf([3, 4]), positive([4])], T.div);
  check("maximum", [leaf([3, 4]), leaf([4])], T.maximum);
});

test("gradient check: unary ops", () => {
  check("neg", [leaf([3, 4])], T.neg);
  check("exp", [leaf([3, 4], 0.5)], T.exp);
  check("log", [positive([3, 4])], T.log);
  check("sqrt", [positive([3, 4])], T.sqrt);
  check("tanh", [leaf([3, 4])], T.tanh);
  check("sigmoid", [leaf([3, 4])], T.sigmoid);
  check("relu", [leaf([3, 4])], T.relu);
  check("gelu", [leaf([3, 4])], T.gelu);
  check("pow", [positive([3, 4])], (x: any) => T.pow(x, 3));
});

test("gradient check: matmul (2-d, batched, shared right side, vectors)", () => {
  check("matmul 2d", [leaf([3, 4]), leaf([4, 5])], T.matmul);
  check("matmul batched", [leaf([2, 3, 4]), leaf([2, 4, 5])], T.matmul);
  check("matmul shared", [leaf([2, 3, 4]), leaf([4, 5])], T.matmul);
  check("matmul 4d", [leaf([2, 2, 3, 4]), leaf([2, 2, 4, 3])], T.matmul);
  check("matmul vec-mat", [leaf([4]), leaf([4, 3])], T.matmul);
  check("matmul mat-vec", [leaf([3, 4]), leaf([4])], T.matmul);
  check("matmul dot", [leaf([4]), leaf([4])], T.matmul);
});

test("gradient check: shape ops", () => {
  check("reshape", [leaf([2, 6])], (x: any) => T.reshape(x, [3, -1]));
  check("transpose", [leaf([2, 3, 4])], T.transpose);
  check("permute", [leaf([2, 3, 4])], (x: any) => T.permute(x, [2, 0, 1]));
  check("rows", [leaf([5, 3])], (x: any) => T.rows(x, 1, 4));
  check("indexSelect (repeated ids)", [leaf([5, 3])], (x: any) => T.indexSelect(x, [4, 0, 4, 2]));
});

test("gradient check: reductions", () => {
  check("sum all", [leaf([3, 4])], (x: any) => T.sum(x));
  check("sum axis 0", [leaf([3, 4])], (x: any) => T.sum(x, 0));
  check("sum axis -1 keep", [leaf([3, 4, 2])], (x: any) => T.sum(x, -1, true));
  check("sum middle axis", [leaf([3, 4, 2])], (x: any) => T.sum(x, 1));
  check("mean all", [leaf([3, 4])], (x: any) => T.mean(x));
  check("mean axis 1", [leaf([3, 4, 2])], (x: any) => T.mean(x, 1));
  check("max all", [leaf([3, 4])], (x: any) => T.max(x));
  check("max axis 1", [leaf([3, 4, 2])], (x: any) => T.max(x, 1));
});

test("gradient check: softmax family, cross-entropy, layer norm", () => {
  check("softmax last", [leaf([3, 5])], (x: any) => T.softmax(x));
  check("softmax axis 0", [leaf([3, 5])], (x: any) => T.softmax(x, 0));
  check("softmax 3d middle", [leaf([2, 4, 3])], (x: any) => T.softmax(x, 1));
  check("logSoftmax", [leaf([3, 5])], (x: any) => T.logSoftmax(x));
  check("crossEntropy", [leaf([4, 6])], (x: any) => T.crossEntropy(x, [0, 5, 2, 2]));
  check("crossEntropy 3d", [leaf([2, 3, 4])], (x: any) => T.crossEntropy(x, [0, 1, 2, 3, 0, 1]));
  check("layerNorm", [leaf([3, 5]), leaf([5]), leaf([5])], (x: any, g: any, b: any) => T.layerNorm(x, g, b), 1e-4);
  check("layerNorm 3d", [leaf([2, 3, 4]), leaf([4]), leaf([4])], (x: any, g: any, b: any) => T.layerNorm(x, g, b), 1e-4);
});

test("gradient check: a whole one-head attention block", () => {
  const T_ = 4, D = 6;
  const mask = T.causalMask(T_);
  check("attention", [leaf([T_, D]), leaf([D, D], 0.5), leaf([D, D], 0.5), leaf([D, D], 0.5)], (x: any, wq: any, wk: any, wv: any) => {
    const q = T.matmul(x, wq), k = T.matmul(x, wk), v = T.matmul(x, wv);
    const scores = T.add(T.mul(T.matmul(q, T.transpose(k)), 1 / Math.sqrt(D)), mask);
    return T.matmul(T.softmax(scores), v);
  }, 1e-4);
});

test("hand maths: y = (3x + 2)^2 has gradient 6 * (3x + 2) at x = 1, i.e. 30", () => {
  const x = T.requireGrad(T.scalar(1));
  const y = T.pow(T.add(T.mul(x, 3), 2), 2);
  T.backward(y);
  assert.equal(y.data[0], 25);
  assert.equal(x.gdata[0], 30);
});

test("forward values", () => {
  const a = T.fromNested([[1, 2], [3, 4]]);
  const b = T.fromNested([[5, 6], [7, 8]]);
  assert.deepEqual(Array.from(T.matmul(a, b).data), [19, 22, 43, 50]);
  assert.deepEqual(Array.from(T.add(a, T.fromData([10, 20], [2])).data), [11, 22, 13, 24]);
  assert.deepEqual(Array.from(T.sum(a, 0).data), [4, 6]);
  assert.deepEqual(Array.from(T.mean(a, 1).data), [1.5, 3.5]);
  assert.deepEqual(Array.from(T.max(a, 0).data), [3, 4]);
  assert.deepEqual(Array.from(T.transpose(a).data), [1, 3, 2, 4]);
  assert.deepEqual(T.reshape(T.arange(6), [2, -1]).shape, [2, 3]);
  assert.deepEqual(Array.from(T.indexSelect(a, [1, 1, 0]).data), [3, 4, 3, 4, 1, 2]);
  const sm = T.softmax(T.fromData([1, 2, 3], [3]));
  assert.ok(Math.abs(sm.data[0] + sm.data[1] + sm.data[2] - 1) < 1e-12);
  assert.ok(Math.abs(sm.data[2] - 0.6652409557748219) < 1e-12);
  const mask = T.causalMask(3);
  assert.equal(mask.data[0], 0); assert.equal(mask.data[1], -1e9); assert.equal(mask.data[3], 0);
  const ln = T.layerNorm(T.fromData([1, 2, 3, 4], [1, 4]), T.ones([4]), T.zeros([4]));
  const mu = ln.data.reduce((s: number, v: number) => s + v, 0) / 4;
  assert.ok(Math.abs(mu) < 1e-12);
  assert.ok(Math.abs(T.crossEntropy(T.zeros([2, 4]), [1, 3]).data[0] - Math.log(4)) < 1e-12);
});

test("gradient accumulates across uses and zeroGrad resets it", () => {
  const x = T.requireGrad(T.scalar(2));
  T.backward(T.add(T.mul(x, x), x)); // x^2 + x -> 2x + 1 = 5
  assert.equal(x.gdata[0], 5);
  T.zeroGrad(x);
  assert.equal(x.gdata[0], 0);
  T.backward(T.mul(x, 3));
  assert.equal(x.gdata[0], 3);
});

test("random numbers: same seed, same numbers; different seed, different numbers", () => {
  const a = new core.Rng(42), b = new core.Rng(42), c = new core.Rng(43);
  const xs = [a.random(), a.random(), a.normal()], ys = [b.random(), b.random(), b.normal()];
  assert.deepEqual(xs, ys);
  assert.notEqual(c.random(), xs[0]);
  const r = new core.Rng(1);
  let s = 0, s2 = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const v = r.normal(); s += v; s2 += v * v; }
  assert.ok(Math.abs(s / n) < 0.03);
  assert.ok(Math.abs(s2 / n - 1) < 0.05);
  const u = new core.Rng(9);
  for (let i = 0; i < 1000; i++) { const v = u.random(); assert.ok(v >= 0 && v < 1); }
});

test("sample follows the probabilities and rejects bad ones", () => {
  const r = new core.Rng(5);
  const counts = [0, 0, 0];
  for (let i = 0; i < 20000; i++) counts[T.sample(r, [0.1, 0.0, 0.9])]++;
  assert.equal(counts[1], 0);
  assert.ok(Math.abs(counts[0] / 20000 - 0.1) < 0.01);
  assert.throws(() => T.sample(r, [0, 0]), /at least one probability above 0/);
  assert.throws(() => T.sample(r, [-1, 2]), /0 or more/);
});

test("optimizers: hand-computed SGD and Adam steps, and both fit a line", () => {
  const w = T.requireGrad(T.fromData([1, 2], [2]));
  w.gdata.set([0.5, -1]);
  new T.SGD([w], 0.1).step();
  assert.deepEqual(Array.from(w.data), [0.95, 2.1]);
  const p = T.requireGrad(T.fromData([1], [1]));
  p.gdata.set([4]);
  new T.Adam([p], 0.1).step(); // first Adam step moves by lr * sign(g)
  assert.ok(Math.abs(p.data[0] - 0.9) < 1e-6);
  for (const make of [(ps: any[]) => new T.SGD(ps, 0.1), (ps: any[]) => new T.Adam(ps, 0.1)]) {
    const m = T.requireGrad(T.scalar(0)), c = T.requireGrad(T.scalar(0));
    const opt = make([m, c]);
    const xs = T.fromData([0, 1, 2, 3], [4]), ys = T.fromData([1, 3, 5, 7], [4]); // y = 2x + 1
    for (let i = 0; i < 400; i++) {
      opt.zeroGrad();
      const err = T.sub(T.add(T.mul(xs, m), c), ys);
      T.backward(T.mean(T.mul(err, err)));
      opt.step();
    }
    assert.ok(Math.abs(m.data[0] - 2) < 0.01 && Math.abs(c.data[0] - 1) < 0.02, `slope ${m.data[0]} intercept ${c.data[0]}`);
  }
});

test("clipGradNorm shrinks big gradients and reports the old norm", () => {
  const w = T.requireGrad(T.zeros([2]));
  w.gdata.set([3, 4]);
  assert.equal(T.clipGradNorm([w], 1), 5);
  assert.ok(Math.abs(w.gdata[0] - 0.6) < 1e-12 && Math.abs(w.gdata[1] - 0.8) < 1e-12);
});

test("save and load round-trip exactly, and mismatches are explained", () => {
  const a = T.requireGrad(rnd([3, 2])), b = T.requireGrad(rnd([4]));
  const buf = T.serialize([a, b]);
  const a2 = T.requireGrad(T.zeros([3, 2])), b2 = T.requireGrad(T.zeros([4]));
  T.deserializeInto(buf, [a2, b2], "w.bin");
  assert.deepEqual(Array.from(a2.data), Array.from(a.data));
  assert.deepEqual(Array.from(b2.data), Array.from(b.data));
  assert.throws(() => T.deserializeInto(buf, [a2], "w.bin"), /holds 2 tensors but you asked to load 1/);
  assert.throws(() => T.deserializeInto(buf, [b2, a2], "w.bin"), /Tensor number 0 in w.bin is a table of 3 rows and 2 columns, but the tensor you are loading into is a list of 4 numbers/);
  assert.throws(() => T.deserializeInto(Buffer.from("hello world, not weights"), [a2], "x.bin"), /not a tensor weights file/);
});

test("error messages are plain words with both shapes", () => {
  const a = T.zeros([2, 3]), b = T.zeros([4]);
  assert.throws(() => T.add(a, b), /Cannot add these two tensors: the left side is a table of 2 rows and 3 columns and the right side is a list of 4 numbers/);
  assert.throws(() => T.matmul(a, T.zeros([2, 5])), /number of columns on the left \(3\) must equal the number of rows on the right \(2\)/);
  assert.throws(() => T.reshape(a, [4, 2]), /Cannot reshape a table of 2 rows and 3 columns \(6 numbers\) into a table of 4 rows and 2 columns \(8 numbers\)/);
  assert.throws(() => T.sum(a, 2), /There is no axis 2/);
  assert.throws(() => T.backward(a), /single number/);
  assert.throws(() => T.backward(T.scalar(1)), /nothing to do/);
  assert.throws(() => T.indexSelect(a, [0, 9]), /item 1 of the id list is 9/);
  assert.throws(() => T.crossEntropy(T.zeros([3, 4]), [0, 1]), /3 predictions\) but you gave 2 correct answers/);
  assert.throws(() => T.crossEntropy(T.zeros([1, 4]), [7]), /only 4 classes/);
  assert.throws(() => T.fromData([1, 2, 3], [2, 2]), /needs 4 numbers\) from a list of 3 numbers/);
  assert.throws(() => new T.Adam([a], 0.1), /not marked with .requireGrad/);
  assert.throws(() => T.rows(a, 1, 5), /rows 0 to 1/);
});

test("printing is readable", () => {
  assert.equal(core.format(T.scalar(2.5)), "tensor(2.5)");
  assert.equal(core.format(T.fromData([1, 2.5, 0.3333333], [3])), "tensor([1.0, 2.5, 0.3333])");
  assert.equal(core.format(T.fromNested([[1, 2], [3, 4]])), "tensor([[1.0, 2.0],\n        [3.0, 4.0]])");
  assert.match(core.format(T.requireGrad(T.zeros([1]))), /requires_grad\)$/);
  assert.match(core.format(T.arange(100)), /\.\.\./);
});

test("a tiny network learns XOR with autograd + Adam", () => {
  const r = new core.Rng(3);
  const w1 = T.requireGrad(T.randn(r, [2, 8])), b1 = T.requireGrad(T.zeros([8]));
  const w2 = T.requireGrad(T.randn(r, [8, 2])), b2 = T.requireGrad(T.zeros([2]));
  const x = T.fromNested([[0, 0], [0, 1], [1, 0], [1, 1]]), y = [0, 1, 1, 0];
  const opt = new T.Adam([w1, b1, w2, b2], 0.05);
  let last = 0;
  for (let i = 0; i < 300; i++) {
    opt.zeroGrad();
    const loss = T.crossEntropy(T.add(T.matmul(T.tanh(T.add(T.matmul(x, w1), b1)), w2), b2), y);
    T.backward(loss); opt.step(); last = loss.data[0];
  }
  assert.ok(last < 0.05, `loss ${last}`);
});

test("the Mycel package compiles, runs with no permissions, and saves weights only with permission", async () => {
  const { run } = require("../src/host");
  const PKG = path.resolve(__dirname, "..", "..", "packages", "tensor");
  const src = `
import tensor
fn main() {
  tensor.seed(1)
  let a = tensor.table([[1.0, 2.0], [3.0, 4.0]])
  let w = tensor.ones([2, 2]).requireGrad()
  let loss = (a.matmul(w)).sum()
  loss.backward()
  print(w.grad.toList())
  print(tensor.save("w.bin", [w]).isErr)
}
`;
  const lines: string[] = [];
  const r = await run({ source: src, file: "main.myc", packages: { tensor: PKG }, capabilities: {}, onOutput: (t: string) => lines.push(t) });
  assert.equal(r.ok, true, JSON.stringify(r.error ?? r));
  const out = lines.join("");
  assert.match(out, /\[4\.0, 4\.0, 6\.0, 6\.0\]/);
  assert.match(out, /^true$/m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tensor-"));
  try {
    const lines2: string[] = [];
    await run({ source: src, file: "main.myc", packages: { tensor: PKG }, capabilities: { fs: { read: [dir], write: [dir] } }, onOutput: (t: string) => lines2.push(t) });
    assert.match(lines2.join(""), /^true$/m); // "w.bin" is relative to cwd, outside dir: still denied
    const abs = path.join(dir, "w.bin");
    const lines3: string[] = [];
    await run({
      source: src.replace('"w.bin"', JSON.stringify(abs)).replace("isErr", "isOk"),
      file: "main.myc", packages: { tensor: PKG }, capabilities: { fs: { read: [dir], write: [dir] } }, onOutput: (t: string) => lines3.push(t),
    });
    assert.match(lines3.join(""), /^true$/m);
    assert.ok(fs.existsSync(abs));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the Mycel-level tests in packages/tensor/tests pass in a project that installs the package", () => {
  const { spawnCli } = require("./helpers");
  const PKG = path.resolve(__dirname, "..", "..", "packages", "tensor");
  const MYCEL = path.resolve(__dirname, "..", "..", "bin", "mycel");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tensor-proj-"));
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, "tests"));
    fs.writeFileSync(path.join(dir, "ply.json"), JSON.stringify({ name: "tt", version: "0.1.0", main: "src/main.myc", dependencies: { tensor: "path:" + PKG } }));
    fs.writeFileSync(path.join(dir, "src", "main.myc"), "fn main() { print(1) }\n");
    fs.copyFileSync(path.join(PKG, "tests", "tensor_pkg_test.myc"), path.join(dir, "tests", "tensor_pkg_test.myc"));
    fs.cpSync(PKG, path.join(dir, "ply_modules", "tensor"), { recursive: true });
    const r = spawnCli(MYCEL, ["test"], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, String(r.stdout) + String(r.stderr));
    assert.match(String(r.stdout), /6 passed, 0 failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("official package index: ply install tensor verifies sha256, the tarball is current, and it runs with no permission flags", () => {
  const crypto = require("node:crypto");
  const { pathToFileURL } = require("node:url");
  const { spawnCli } = require("./helpers");
  const { createTarGz } = require("../src/project");
  const PLY = path.resolve(__dirname, "..", "..", "bin", "ply");
  const PKG = path.resolve(__dirname, "..", "..", "packages", "tensor");
  const SITE = path.resolve(__dirname, "..", "..", "..", "site", "public", "mycel", "packages");
  const index = JSON.parse(fs.readFileSync(path.join(SITE, "index.json"), "utf8"));
  const entry = index.packages.tensor.versions["0.1.0"];
  // a stale tarball would install old code: rebuild from the package folder and compare
  const tmpTar = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tensor-tar-")), "t.tar.gz");
  createTarGz(PKG, tmpTar);
  const fresh = crypto.createHash("sha256").update(fs.readFileSync(tmpTar)).digest("hex");
  assert.equal(entry.sha256, fresh, "site tarball is out of date: rebuild site/public/mycel/packages/tensor-0.1.0.tar.gz and update index.json");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tensor-idx-")), reg = fs.mkdtempSync(path.join(os.tmpdir(), "tensor-reg-"));
  try {
    const app = path.join(work, "demo");
    fs.mkdirSync(path.join(app, "src"), { recursive: true });
    fs.writeFileSync(path.join(app, "ply.json"), JSON.stringify({ name: "demo", version: "0.1.0", main: "src/main.myc" }));
    fs.writeFileSync(path.join(app, "src", "main.myc"), 'import tensor\nfn main() {\n  print(tensor.ones([2]) * 3.0)\n}\n');
    const env = { ...process.env, PLY_REGISTRY: reg, PLY_PACKAGE_INDEX: pathToFileURL(path.join(SITE, "index.json")).href };
    const inst = spawnCli(PLY, ["install", "tensor"], { cwd: app, encoding: "utf8", env });
    assert.equal(inst.status, 0, String(inst.stderr) + String(inst.stdout));
    assert.match(String(inst.stdout), /added tensor \^0\.1\.0/);
    const MYCEL = path.resolve(__dirname, "..", "..", "bin", "mycel");
    const r = spawnCli(MYCEL, ["run"], { cwd: app, encoding: "utf8", env });
    assert.equal(r.status, 0, String(r.stderr));
    assert.match(String(r.stdout), /tensor\(\[3\.0, 3\.0\]\)/);
  } finally { fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(reg, { recursive: true, force: true }); }
});
