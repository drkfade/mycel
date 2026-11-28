"use strict";
// Mycel bindings for the `tensor` package. The maths is in core.cjs; this file only converts values
// (Int = bigint, Float = number, lists = arrays) and turns TensorError into a friendly Mycel panic.

const fs = require("node:fs");
const core = require("./core.cjs");
const { Tensor, TensorError } = core;

const ints = (xs) => Array.from(xs, (x) => Number(x));
const big = (xs) => Array.from(xs, (x) => BigInt(x));

function createNatives(rt, helpers) {
  const rng = new core.Rng((Date.now() ^ (process.pid << 8)) >>> 0);

  const guard = (fn) => (...args) => {
    try { return fn(...args); }
    catch (e) {
      if (e instanceof TensorError) throw new helpers.Panic(e.message);
      throw e;
    }
  };
  const guardResult = (fn) => (...args) => {
    try { return helpers.ok(fn(...args)); }
    catch (e) {
      if (e instanceof TensorError) return helpers.err("Error", e.message);
      return helpers.err("IoError", String(e && e.message || e));
    }
  };
  const opt = (v) => (v === undefined || v === null ? undefined : Number(v));

  const table = {
    "tensor.seed": (n) => { rng.seed(Number(n)); },
    "tensor.random": () => rng.random(),
    "tensor.zeros": (s) => core.zeros(ints(s)),
    "tensor.ones": (s) => core.ones(ints(s)),
    "tensor.full": (s, v) => core.full(ints(s), Number(v)),
    "tensor.randn": (s) => core.randn(rng, ints(s)),
    "tensor.randnStd": (s, std) => core.randn(rng, ints(s), Number(std)),
    "tensor.rand": (s) => core.rand(rng, ints(s)),
    "tensor.arange": (n) => core.arange(Number(n)),
    "tensor.scalar": (x) => core.scalar(x),
    "tensor.array": (v) => core.fromData(v, [v.length]),
    "tensor.fromList": (v, s) => core.fromData(v, ints(s)),
    "tensor.table": (r) => core.fromNested(r),
    "tensor.causalMask": (n) => core.causalMask(Number(n)),
    "tensor.sample": (p) => BigInt(core.sample(rng, p.data)),
    "tensor.sampleList": (p) => BigInt(core.sample(rng, Array.from(p, Number))),
    "tensor.sgd": (ps, lr) => new core.SGD(ps, Number(lr)),
    "tensor.sgdMomentum": (ps, lr, m) => new core.SGD(ps, Number(lr), Number(m)),
    "tensor.adam": (ps, lr) => new core.Adam(ps, Number(lr)),
    "tensor.clipGradNorm": (ps, m) => core.clipGradNorm(ps, Number(m)),

    "tensor.Tensor.get_shape": (t) => big(t.shape),
    "tensor.Tensor.get_ndim": (t) => BigInt(t.ndim),
    "tensor.Tensor.get_size": (t) => BigInt(t.size),
    "tensor.Tensor.get_requiresGrad": (t) => t.requiresGrad,
    "tensor.Tensor.get_grad": (t) => {
      // zeros until backward() has run (or when the tensor is not tracked), so beginners never meet nil
      return new Tensor(t.gdata ? t.gdata.slice() : new Float64Array(t.size), t.shape.slice());
    },
    "tensor.Tensor.item": (t) => {
      if (t.size !== 1) throw new TensorError(`item() needs a tensor holding exactly one number, but this one is ${core.describeShape(t.shape)}. Use toList() to get all the numbers.`);
      return t.data[0];
    },
    "tensor.Tensor.toList": (t) => Array.from(t.data),
    "tensor.Tensor.toString": (t) => core.format(t),
    "tensor.Tensor.requireGrad": (t) => core.requireGrad(t),
    "tensor.Tensor.detach": (t) => core.detach(t),
    "tensor.Tensor.backward": (t) => core.backward(t),
    "tensor.Tensor.zeroGrad": (t) => core.zeroGrad(t),
    "tensor.Tensor.reshape": (t, s) => core.reshape(t, ints(s)),
    "tensor.Tensor.transpose": (t) => core.transpose(t),
    "tensor.Tensor.permute": (t, a) => core.permute(t, ints(a)),
    "tensor.Tensor.rows": (t, a, b) => core.rows(t, Number(a), Number(b)),
    "tensor.Tensor.indexSelect": (t, ids) => core.indexSelect(t, ints(ids)),
    "tensor.Tensor.matmul": (a, b) => core.matmul(a, b),
    "tensor.Tensor.sum": (t, ax, keep) => core.sum(t, opt(ax), !!keep),
    "tensor.Tensor.mean": (t, ax, keep) => core.mean(t, opt(ax), !!keep),
    "tensor.Tensor.max": (t, ax, keep) => core.max(t, opt(ax), !!keep),
    "tensor.Tensor.argmax": (t) => BigInt(core.argmax(t)),
    "tensor.Tensor.exp": core.exp,
    "tensor.Tensor.log": core.log,
    "tensor.Tensor.sqrt": core.sqrt,
    "tensor.Tensor.tanh": core.tanh,
    "tensor.Tensor.sigmoid": core.sigmoid,
    "tensor.Tensor.relu": core.relu,
    "tensor.Tensor.gelu": core.gelu,
    "tensor.Tensor.pow": (t, p) => core.pow(t, Number(p)),
    "tensor.Tensor.softmax": (t, ax) => core.softmax(t, ax === undefined ? -1 : Number(ax)),
    "tensor.Tensor.logSoftmax": (t, ax) => core.logSoftmax(t, ax === undefined ? -1 : Number(ax)),
    "tensor.Tensor.crossEntropy": (t, y) => core.crossEntropy(t, ints(y)),
    "tensor.Tensor.layerNorm": (t, g, b) => core.layerNorm(t, g, b),
    "tensor.Tensor.+": (a, b) => core.add(a, b instanceof Tensor ? b : Number(b)),
    "tensor.Tensor.-": (a, b) => (b === undefined ? core.neg(a) : core.sub(a, b instanceof Tensor ? b : Number(b))),
    "tensor.Tensor.*": (a, b) => core.mul(a, b instanceof Tensor ? b : Number(b)),
    "tensor.Tensor./": (a, b) => core.div(a, b instanceof Tensor ? b : Number(b)),

    "tensor.Optimizer.step": (o) => o.step(),
    "tensor.Optimizer.zeroGrad": (o) => o.zeroGrad(),
    "tensor.Optimizer.setLr": (o, lr) => { o.lr = Number(lr); },
  };
  const out = {};
  for (const [k, f] of Object.entries(table)) out[k] = guard(f);

  out["tensor.save"] = (path, params) => {
    const chk = helpers.checkFsWrite(path);
    if ("why" in chk) return helpers.denied(`fs.write of ${JSON.stringify(path)}`, chk.why);
    return guardResult(() => { fs.writeFileSync(chk.path, core.serialize(params)); })();
  };
  out["tensor.load"] = (path, params) => {
    const chk = helpers.checkFsRead(path);
    if ("why" in chk) return helpers.denied(`fs.read of ${JSON.stringify(path)}`, chk.why);
    return guardResult(() => { core.deserializeInto(fs.readFileSync(chk.path), params, path); })();
  };
  return out;
}

module.exports = createNatives;
module.exports.createNatives = createNatives;
module.exports.core = core;
