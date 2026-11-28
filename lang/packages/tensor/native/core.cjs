"use strict";
// The maths behind the `tensor` package: n-d arrays of 64-bit floats with reverse-mode autograd.
// Pure JavaScript, no dependencies, no I/O. index.cjs wires these into Mycel.
// Every error thrown here is a TensorError whose message is written for a beginner.

class TensorError extends Error {
  constructor(message) { super(message); this.name = "TensorError"; }
}

// ---------- plain-words helpers ----------

function describeShape(shape) {
  const n = shape.length;
  if (n === 0) return "a single number";
  if (n === 1) return shape[0] === 1 ? "a list of 1 number" : `a list of ${shape[0]} numbers`;
  if (n === 2) return `a table of ${shape[0]} row${shape[0] === 1 ? "" : "s"} and ${shape[1]} column${shape[1] === 1 ? "" : "s"}`;
  return `a ${n}-d array with shape [${shape.join(", ")}]`;
}
const sizeOf = (shape) => shape.reduce((a, b) => a * b, 1);
const sameShape = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkShape(shape, what = "shape") {
  if (!Array.isArray(shape)) throw new TensorError(`${what} must be a list of whole numbers like [2, 3], but got ${String(shape)}.`);
  for (const d of shape) {
    if (!Number.isInteger(d) || d < 0) throw new TensorError(`${what} must hold whole numbers that are 0 or more, like [2, 3], but got [${shape.join(", ")}].`);
  }
  return shape;
}

function normAxis(axis, ndim, shape) {
  const ax = axis < 0 ? axis + ndim : axis;
  if (!Number.isInteger(axis) || ax < 0 || ax >= ndim) {
    const names = ndim === 0 ? "none (it is a single number)" : ndim === 1 ? "just axis 0" : `axes 0 to ${ndim - 1}`;
    throw new TensorError(`There is no axis ${axis}: this tensor is ${describeShape(shape)}, so it has ${names}. Axis -1 means the last one.`);
  }
  return ax;
}

// ---------- seeded random numbers ----------

class Rng {
  constructor(seed) { this.seed(seed); }
  seed(seed) {
    // splitmix32 to spread the seed, then xoshiro128** (all integer maths: identical on every machine)
    let s = (Number(seed) | 0) >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next(); this.s1 = next(); this.s2 = next(); this.s3 = next();
    this.spare = null;
  }
  u32() {
    const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0; this.s3 ^= this.s1; this.s1 ^= this.s2; this.s0 ^= this.s3;
    this.s2 ^= t; this.s3 = rotl(this.s3, 11);
    this.s0 >>>= 0; this.s1 >>>= 0; this.s2 >>>= 0; this.s3 >>>= 0;
    return result;
  }
  /** uniform in [0, 1) with 53 random bits */
  random() { return ((this.u32() >>> 5) * 67108864 + (this.u32() >>> 6)) / 9007199254740992; }
  /** standard normal (Box-Muller) */
  normal() {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    let u = 0;
    while (u === 0) u = this.random();
    const v = this.random();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
}

// ---------- the Tensor ----------

class Tensor {
  constructor(data, shape) {
    this.data = data;            // Float64Array, row-major
    this.shape = shape;          // plain array of numbers
    this.requiresGrad = false;
    this.gdata = null;           // Float64Array, same size, allocated when needed
    this._prev = null;           // parent tensors, only when this came from a tracked op
    this._back = null;           // () => void, pushes this.gdata into the parents
    this._op = "";
  }
  get size() { return this.data.length; }
  get ndim() { return this.shape.length; }
  needGrad() { if (!this.gdata) this.gdata = new Float64Array(this.data.length); return this.gdata; }
}

function make(data, shape, parents, op, back) {
  const t = new Tensor(data, shape);
  if (parents && parents.some((p) => p.requiresGrad) && !noGrad.on) {
    t.requiresGrad = true; t._prev = parents; t._op = op; t._back = back(t);
  }
  return t;
}
const noGrad = { on: false };

// ---------- creation ----------

function fromData(values, shape) {
  checkShape(shape);
  const n = sizeOf(shape);
  if (values.length !== n) {
    throw new TensorError(`Cannot make ${describeShape(shape)} (that needs ${n} numbers) from a list of ${values.length} numbers.`);
  }
  const data = new Float64Array(n);
  for (let i = 0; i < n; i++) data[i] = Number(values[i]);
  return new Tensor(data, shape.slice());
}
const zeros = (shape) => new Tensor(new Float64Array(sizeOf(checkShape(shape))), shape.slice());
function full(shape, v) { const t = zeros(shape); t.data.fill(v); return t; }
const ones = (shape) => full(shape, 1);
function scalar(x) { return new Tensor(Float64Array.of(Number(x)), []); }
function arange(n) {
  if (!Number.isInteger(n) || n < 0) throw new TensorError(`arange(n) needs a whole number that is 0 or more, but got ${n}.`);
  const t = new Tensor(new Float64Array(n), [n]);
  for (let i = 0; i < n; i++) t.data[i] = i;
  return t;
}
function randn(rng, shape, std = 1) {
  const t = zeros(shape);
  for (let i = 0; i < t.data.length; i++) t.data[i] = rng.normal() * std;
  return t;
}
function rand(rng, shape) {
  const t = zeros(shape);
  for (let i = 0; i < t.data.length; i++) t.data[i] = rng.random();
  return t;
}
function fromNested(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TensorError("table(rows) needs a list of rows, like [[1.0, 2.0], [3.0, 4.0]].");
  const w = rows[0].length;
  const flat = [];
  for (const [i, r] of rows.entries()) {
    if (r.length !== w) throw new TensorError(`Every row must be the same length: row 0 has ${w} numbers but row ${i} has ${r.length}.`);
    for (const x of r) flat.push(x);
  }
  return fromData(flat, [rows.length, w]);
}
function causalMask(n) {
  const t = zeros([n, n]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) t.data[i * n + j] = -1e9;
  return t;
}
function detach(a) { return new Tensor(a.data.slice(), a.shape.slice()); }
function copyOf(a) { return detach(a); }

// ---------- broadcasting ----------

function broadcastShape(sa, sb, opName) {
  const n = Math.max(sa.length, sb.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const da = i < n - sa.length ? 1 : sa[i - (n - sa.length)];
    const db = i < n - sb.length ? 1 : sb[i - (n - sb.length)];
    if (da !== db && da !== 1 && db !== 1) {
      throw new TensorError(
        `Cannot ${opName}: the left side is ${describeShape(sa)} and the right side is ${describeShape(sb)}. ` +
        `Shapes [${sa.join(", ")}] and [${sb.join(", ")}] do not line up: the sizes ${da} and ${db} differ at position ${i - n} ` +
        `(counting from the end). Two sizes fit when they are equal or one of them is 1.`);
    }
    out[i] = Math.max(da, db);
  }
  return out;
}

/** For each element of the output, which element of an input of `shape` it reads (null when shapes are equal). */
function indexMap(shape, outShape) {
  if (sameShape(shape, outShape)) return null;
  const n = outShape.length, size = sizeOf(outShape);
  const strides = new Array(n).fill(0);
  let st = 1;
  for (let i = shape.length - 1; i >= 0; i--) {
    const oi = i + (n - shape.length);
    strides[oi] = shape[i] === 1 ? 0 : st;
    st *= shape[i];
  }
  const map = new Int32Array(size);
  const idx = new Array(n).fill(0);
  let cur = 0;
  for (let k = 0; k < size; k++) {
    map[k] = cur;
    for (let d = n - 1; d >= 0; d--) {
      idx[d]++; cur += strides[d];
      if (idx[d] < outShape[d]) break;
      cur -= strides[d] * outShape[d]; idx[d] = 0;
    }
  }
  return map;
}

function binary(a, b, name, verb, f, dfa, dfb, kind) {
  const shape = broadcastShape(a.shape, b.shape, verb);
  const n = sizeOf(shape);
  const ma = indexMap(a.shape, shape), mb = indexMap(b.shape, shape);
  const out = new Float64Array(n), x = a.data, y = b.data;
  const suffixRows = !!kind && !ma && !!mb && y.length > 1 && b.ndim <= shape.length && b.shape.every((d, i) => d === shape[shape.length - b.ndim + i]);
  if (!ma && !mb && kind) { // same shape: plain loops
    if (kind === "add") for (let i = 0; i < n; i++) out[i] = x[i] + y[i];
    else if (kind === "sub") for (let i = 0; i < n; i++) out[i] = x[i] - y[i];
    else for (let i = 0; i < n; i++) out[i] = x[i] * y[i];
  } else if (suffixRows) { // e.g. table + bias row: the right side repeats along the leading axes
    const bs = y.length;
    for (let r = 0; r < n; r += bs) {
      if (kind === "add") for (let j = 0; j < bs; j++) out[r + j] = x[r + j] + y[j];
      else if (kind === "sub") for (let j = 0; j < bs; j++) out[r + j] = x[r + j] - y[j];
      else for (let j = 0; j < bs; j++) out[r + j] = x[r + j] * y[j];
    }
  } else if (!ma && b.data.length === 1 && kind) { // tensor with a single number
    const s = y[0];
    if (kind === "add") for (let i = 0; i < n; i++) out[i] = x[i] + s;
    else if (kind === "sub") for (let i = 0; i < n; i++) out[i] = x[i] - s;
    else for (let i = 0; i < n; i++) out[i] = x[i] * s;
  } else {
    for (let i = 0; i < n; i++) out[i] = f(x[ma ? ma[i] : i], y[mb ? mb[i] : i]);
  }
  return make(out, shape, [a, b], name, (t) => () => {
    const g = t.gdata;
    if (!ma && !mb && kind) {
      if (a.requiresGrad) { const ga = a.needGrad(); if (kind === "mul") for (let i = 0; i < n; i++) ga[i] += g[i] * y[i]; else for (let i = 0; i < n; i++) ga[i] += g[i]; }
      if (b.requiresGrad) {
        const gb = b.needGrad();
        if (kind === "mul") for (let i = 0; i < n; i++) gb[i] += g[i] * x[i];
        else if (kind === "sub") for (let i = 0; i < n; i++) gb[i] -= g[i];
        else for (let i = 0; i < n; i++) gb[i] += g[i];
      }
      return;
    }
    if (suffixRows) {
      const bs = y.length;
      if (a.requiresGrad) { const ga = a.needGrad(); if (kind === "mul") for (let r = 0; r < n; r += bs) for (let j = 0; j < bs; j++) ga[r + j] += g[r + j] * y[j]; else for (let i = 0; i < n; i++) ga[i] += g[i]; }
      if (b.requiresGrad) {
        const gb = b.needGrad(), sg = kind === "sub" ? -1 : 1;
        if (kind === "mul") for (let r = 0; r < n; r += bs) for (let j = 0; j < bs; j++) gb[j] += g[r + j] * x[r + j];
        else for (let r = 0; r < n; r += bs) for (let j = 0; j < bs; j++) gb[j] += sg * g[r + j];
      }
      return;
    }
    if (a.requiresGrad) { const ga = a.needGrad(); for (let i = 0; i < n; i++) { const ia = ma ? ma[i] : i; ga[ia] += g[i] * dfa(x[ia], y[mb ? mb[i] : i], out[i]); } }
    if (b.requiresGrad) { const gb = b.needGrad(); for (let i = 0; i < n; i++) { const ib = mb ? mb[i] : i; gb[ib] += g[i] * dfb(x[ma ? ma[i] : i], y[ib], out[i]); } }
  });
}

const asT = (v) => (v instanceof Tensor ? v : scalar(v));
const add = (a, b) => binary(a, asT(b), "add", "add these two tensors", (x, y) => x + y, () => 1, () => 1, "add");
const sub = (a, b) => binary(a, asT(b), "sub", "subtract these two tensors", (x, y) => x - y, () => 1, () => -1, "sub");
const mul = (a, b) => binary(a, asT(b), "mul", "multiply these two tensors", (x, y) => x * y, (x, y) => y, (x) => x, "mul");
const div = (a, b) => binary(a, asT(b), "div", "divide these two tensors", (x, y) => x / y, (x, y) => 1 / y, (x, y) => -x / (y * y));
const maximum = (a, b) => binary(a, asT(b), "maximum", "take the larger of these two tensors", (x, y) => (x >= y ? x : y), (x, y) => (x >= y ? 1 : 0), (x, y) => (x >= y ? 0 : 1));

function unary(a, name, f, df) {
  const n = a.data.length, out = new Float64Array(n), x = a.data;
  for (let i = 0; i < n; i++) out[i] = f(x[i]);
  return make(out, a.shape.slice(), [a], name, (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let i = 0; i < n; i++) ga[i] += g[i] * df(x[i], out[i]);
  });
}
const neg = (a) => unary(a, "neg", (x) => -x, () => -1);
const exp = (a) => unary(a, "exp", Math.exp, (x, y) => y);
const log = (a) => unary(a, "log", Math.log, (x) => 1 / x);
const sqrt = (a) => unary(a, "sqrt", Math.sqrt, (x, y) => 0.5 / y);
const tanh = (a) => unary(a, "tanh", Math.tanh, (x, y) => 1 - y * y);
const sigmoid = (a) => unary(a, "sigmoid", (x) => 1 / (1 + Math.exp(-x)), (x, y) => y * (1 - y));
const relu = (a) => unary(a, "relu", (x) => (x > 0 ? x : 0), (x) => (x > 0 ? 1 : 0));
const GC = Math.sqrt(2 / Math.PI);
const gelu = (a) => unary(a, "gelu",
  (x) => 0.5 * x * (1 + Math.tanh(GC * (x + 0.044715 * x * x * x))),
  (x) => {
    const u = GC * (x + 0.044715 * x * x * x), th = Math.tanh(u);
    return 0.5 * (1 + th) + 0.5 * x * (1 - th * th) * GC * (1 + 3 * 0.044715 * x * x);
  });
function pow(a, p) { return unary(a, "pow", (x) => Math.pow(x, p), (x) => p * Math.pow(x, p - 1)); }

// ---------- matmul ----------

function mmForward(A, ao, B, bo, C, co, m, k, n) {
  for (let i = 0; i < m; i++) {
    const crow = co + i * n, arow = ao + i * k;
    let p = 0;
    for (; p + 3 < k; p += 4) {
      const a0 = A[arow + p], a1 = A[arow + p + 1], a2 = A[arow + p + 2], a3 = A[arow + p + 3];
      const b0 = bo + p * n, b1 = b0 + n, b2 = b1 + n, b3 = b2 + n;
      for (let j = 0; j < n; j++) C[crow + j] += a0 * B[b0 + j] + a1 * B[b1 + j] + a2 * B[b2 + j] + a3 * B[b3 + j];
    }
    for (; p < k; p++) {
      const a0 = A[arow + p], b0 = bo + p * n;
      for (let j = 0; j < n; j++) C[crow + j] += a0 * B[b0 + j];
    }
  }
}
/** copy of the rows x cols block at `off`, transposed (cols x rows) */
function transposed(X, off, rows_, cols) {
  const out = new Float64Array(rows_ * cols);
  for (let i = 0; i < rows_; i++) for (let j = 0; j < cols; j++) out[j * rows_ + i] = X[off + i * cols + j];
  return out;
}

function matmul(a, b) {
  if (a.ndim === 0 || b.ndim === 0) throw new TensorError(`matmul needs lists or tables, but one side is a single number. Use * to multiply by a single number.`);
  if (a.ndim === 1 && b.ndim === 1) {
    if (a.shape[0] !== b.shape[0]) throw new TensorError(`Cannot matmul ${describeShape(a.shape)} with ${describeShape(b.shape)}: a dot product needs both lists to be the same length.`);
    return sum(mul(a, b));
  }
  if (a.ndim === 1) return reshape(matmul(reshape(a, [1, a.shape[0]]), b), b.shape.slice(0, -2).concat([b.shape[b.ndim - 1]]));
  if (b.ndim === 1) return reshape(matmul(a, reshape(b, [b.shape[0], 1])), a.shape.slice(0, -1));
  const m = a.shape[a.ndim - 2], k = a.shape[a.ndim - 1], k2 = b.shape[b.ndim - 2], n = b.shape[b.ndim - 1];
  if (k !== k2) {
    throw new TensorError(
      `Cannot matmul: the left side is ${describeShape(a.shape)} and the right side is ${describeShape(b.shape)}. ` +
      `To multiply, the number of columns on the left (${k}) must equal the number of rows on the right (${k2}). ` +
      `Tip: a.transpose() swaps rows and columns.`);
  }
  const batchA = a.shape.slice(0, -2), batchB = b.shape.slice(0, -2);
  let batch;
  if (batchB.length === 0) batch = batchA;
  else if (sameShape(batchA, batchB)) batch = batchA;
  else throw new TensorError(`Cannot matmul ${describeShape(a.shape)} with ${describeShape(b.shape)}: the leading (batch) sizes [${batchA.join(", ")}] and [${batchB.join(", ")}] must be equal, or the right side must be a plain table.`);
  // a plain table on the right is shared by every batch item, so the batch folds into one tall matmul
  const shared = batchB.length === 0;
  const nb = shared ? 1 : sizeOf(batch), mm = shared ? sizeOf(batch) * m : m;
  const out = new Float64Array(nb * mm * n);
  for (let t = 0; t < nb; t++) mmForward(a.data, t * mm * k, b.data, shared ? 0 : t * k * n, out, t * mm * n, mm, k, n);
  return make(out, batch.concat([m, n]), [a, b], "matmul", (res) => () => {
    const G = res.gdata;
    if (a.requiresGrad) { // dA = G times B^T
      const ga = a.needGrad();
      for (let t = 0; t < nb; t++) mmForward(G, t * mm * n, transposed(b.data, shared ? 0 : t * k * n, k, n), 0, ga, t * mm * k, mm, n, k);
    }
    if (b.requiresGrad) { // dB = A^T times G
      const gb = b.needGrad();
      for (let t = 0; t < nb; t++) mmForward(transposed(a.data, t * mm * k, mm, k), 0, G, t * mm * n, gb, shared ? 0 : t * k * n, k, mm, n);
    }
  });
}

// ---------- shape ops ----------

function reshape(a, shape) {
  checkShape(shape.map((d) => (d === -1 ? 0 : d)), "the new shape");
  const unknown = shape.filter((d) => d === -1).length;
  if (unknown > 1) throw new TensorError("reshape can have at most one -1 (it means: work this size out for me).");
  let sh = shape.slice();
  if (unknown === 1) {
    const known = sh.reduce((x, d) => (d === -1 ? x : x * d), 1);
    if (known === 0 || a.size % known !== 0) throw new TensorError(`Cannot reshape ${describeShape(a.shape)} (${a.size} numbers) into [${shape.join(", ")}]: ${a.size} is not divisible by ${known}.`);
    sh = sh.map((d) => (d === -1 ? a.size / known : d));
  }
  if (sizeOf(sh) !== a.size) {
    throw new TensorError(`Cannot reshape ${describeShape(a.shape)} (${a.size} numbers) into ${describeShape(sh)} (${sizeOf(sh)} numbers). Both must hold the same count of numbers.`);
  }
  return make(a.data, sh, [a], "reshape", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let i = 0; i < g.length; i++) ga[i] += g[i];
  });
}

function permute(a, axes) {
  const n = a.ndim;
  if (!Array.isArray(axes) || axes.length !== n || [...axes].sort((x, y) => x - y).some((v, i) => v !== i)) {
    throw new TensorError(`permute needs each axis 0 to ${n - 1} exactly once (this tensor is ${describeShape(a.shape)}), but got [${axes.join(", ")}].`);
  }
  const outShape = axes.map((ax) => a.shape[ax]);
  const inStr = new Array(n); let st = 1;
  for (let i = n - 1; i >= 0; i--) { inStr[i] = st; st *= a.shape[i]; }
  const map = new Int32Array(a.size);
  const idx = new Array(n).fill(0);
  const str = axes.map((ax) => inStr[ax]);
  let cur = 0;
  for (let k = 0; k < map.length; k++) {
    map[k] = cur;
    for (let d = n - 1; d >= 0; d--) {
      idx[d]++; cur += str[d];
      if (idx[d] < outShape[d]) break;
      cur -= str[d] * outShape[d]; idx[d] = 0;
    }
  }
  const out = new Float64Array(a.size);
  for (let k = 0; k < out.length; k++) out[k] = a.data[map[k]];
  return make(out, outShape, [a], "permute", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let k = 0; k < g.length; k++) ga[map[k]] += g[k];
  });
}
function transpose(a) {
  if (a.ndim < 2) throw new TensorError(`transpose swaps the last two axes (rows and columns), but this tensor is ${describeShape(a.shape)}.`);
  const axes = a.shape.map((_, i) => i);
  const n = a.ndim;
  axes[n - 1] = n - 2; axes[n - 2] = n - 1;
  return permute(a, axes);
}

/** rows start..end-1 along axis 0 */
function rows(a, start, end) {
  if (a.ndim === 0) throw new TensorError("rows needs a list or table, but this is a single number.");
  const len = a.shape[0];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > len || start > end) {
    throw new TensorError(`rows(${start}, ${end}) is outside this tensor: ${describeShape(a.shape)} has rows 0 to ${len - 1}, so the range must satisfy 0 <= start <= end <= ${len}.`);
  }
  const inner = a.size / (len || 1);
  const out = a.data.slice(start * inner, end * inner);
  return make(out, [end - start].concat(a.shape.slice(1)), [a], "rows", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad(), off = start * inner;
    for (let i = 0; i < g.length; i++) ga[off + i] += g[i];
  });
}

/** gather rows by index along axis 0 (embedding lookup) */
function indexSelect(a, ids) {
  if (a.ndim === 0) throw new TensorError("indexSelect needs a list or table, but this is a single number.");
  const len = a.shape[0], inner = a.size / (len || 1), n = ids.length;
  const out = new Float64Array(n * inner);
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    if (!Number.isInteger(id) || id < 0 || id >= len) {
      throw new TensorError(`indexSelect: item ${i} of the id list is ${id}, but this tensor (${describeShape(a.shape)}) only has rows 0 to ${len - 1}.`);
    }
    out.set(a.data.subarray(id * inner, (id + 1) * inner), i * inner);
  }
  return make(out, [n].concat(a.shape.slice(1)), [a], "indexSelect", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let i = 0; i < n; i++) { const o = ids[i] * inner, s = i * inner; for (let j = 0; j < inner; j++) ga[o + j] += g[s + j]; }
  });
}

// ---------- reductions ----------

function split3(shape, ax) {
  let outer = 1, inner = 1;
  for (let i = 0; i < ax; i++) outer *= shape[i];
  for (let i = ax + 1; i < shape.length; i++) inner *= shape[i];
  return [outer, shape[ax], inner];
}
function reducedShape(shape, ax, keep) { return keep ? shape.map((d, i) => (i === ax ? 1 : d)) : shape.filter((_, i) => i !== ax); }

function sum(a, axis, keep = false) {
  if (axis === undefined || axis === null) {
    let s = 0;
    for (let i = 0; i < a.data.length; i++) s += a.data[i];
    return make(Float64Array.of(s), keep ? a.shape.map(() => 1) : [], [a], "sum", (t) => () => {
      if (!a.requiresGrad) return;
      const ga = a.needGrad(), g = t.gdata[0];
      for (let i = 0; i < ga.length; i++) ga[i] += g;
    });
  }
  const ax = normAxis(axis, a.ndim, a.shape);
  const [outer, len, inner] = split3(a.shape, ax);
  const out = new Float64Array(outer * inner);
  for (let o = 0; o < outer; o++) for (let l = 0; l < len; l++) {
    const base = (o * len + l) * inner;
    for (let i = 0; i < inner; i++) out[o * inner + i] += a.data[base + i];
  }
  return make(out, reducedShape(a.shape, ax, keep), [a], "sum", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let o = 0; o < outer; o++) for (let l = 0; l < len; l++) {
      const base = (o * len + l) * inner;
      for (let i = 0; i < inner; i++) ga[base + i] += g[o * inner + i];
    }
  });
}
function mean(a, axis, keep = false) {
  if (axis === undefined || axis === null) {
    if (a.size === 0) throw new TensorError("Cannot take the mean of an empty tensor.");
    return mul(sum(a, undefined, keep), 1 / a.size);
  }
  const ax = normAxis(axis, a.ndim, a.shape);
  return mul(sum(a, ax, keep), 1 / a.shape[ax]);
}
function max(a, axis, keep = false) {
  if (a.size === 0) throw new TensorError("Cannot take the max of an empty tensor.");
  if (axis === undefined || axis === null) {
    let bi = 0;
    for (let i = 1; i < a.data.length; i++) if (a.data[i] > a.data[bi]) bi = i;
    return make(Float64Array.of(a.data[bi]), keep ? a.shape.map(() => 1) : [], [a], "max", (t) => () => {
      if (a.requiresGrad) a.needGrad()[bi] += t.gdata[0];
    });
  }
  const ax = normAxis(axis, a.ndim, a.shape);
  const [outer, len, inner] = split3(a.shape, ax);
  const out = new Float64Array(outer * inner), arg = new Int32Array(outer * inner);
  for (let o = 0; o < outer; o++) for (let i = 0; i < inner; i++) {
    let best = -Infinity, bl = 0;
    for (let l = 0; l < len; l++) { const v = a.data[(o * len + l) * inner + i]; if (v > best) { best = v; bl = l; } }
    out[o * inner + i] = best; arg[o * inner + i] = (o * len + bl) * inner + i;
  }
  return make(out, reducedShape(a.shape, ax, keep), [a], "max", (t) => () => {
    if (!a.requiresGrad) return;
    const ga = a.needGrad(), g = t.gdata;
    for (let k = 0; k < g.length; k++) ga[arg[k]] += g[k];
  });
}
function argmax(a) {
  if (a.size === 0) throw new TensorError("Cannot take the argmax of an empty tensor.");
  let bi = 0;
  for (let i = 1; i < a.data.length; i++) if (a.data[i] > a.data[bi]) bi = i;
  return bi;
}

// ---------- softmax family ----------

function softmaxData(a, ax) {
  const [outer, len, inner] = split3(a.shape, ax);
  const out = new Float64Array(a.size);
  for (let o = 0; o < outer; o++) for (let i = 0; i < inner; i++) {
    let mx = -Infinity;
    for (let l = 0; l < len; l++) mx = Math.max(mx, a.data[(o * len + l) * inner + i]);
    let s = 0;
    for (let l = 0; l < len; l++) { const e = Math.exp(a.data[(o * len + l) * inner + i] - mx); out[(o * len + l) * inner + i] = e; s += e; }
    for (let l = 0; l < len; l++) out[(o * len + l) * inner + i] /= s;
  }
  return [out, outer, len, inner];
}
function softmax(a, axis = -1) {
  const ax = normAxis(axis, a.ndim, a.shape);
  const [out, outer, len, inner] = softmaxData(a, ax);
  return make(out, a.shape.slice(), [a], "softmax", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let o = 0; o < outer; o++) for (let i = 0; i < inner; i++) {
      let dot = 0;
      for (let l = 0; l < len; l++) { const k = (o * len + l) * inner + i; dot += g[k] * out[k]; }
      for (let l = 0; l < len; l++) { const k = (o * len + l) * inner + i; ga[k] += out[k] * (g[k] - dot); }
    }
  });
}
function logSoftmax(a, axis = -1) {
  const ax = normAxis(axis, a.ndim, a.shape);
  const [outer, len, inner] = split3(a.shape, ax);
  const out = new Float64Array(a.size);
  for (let o = 0; o < outer; o++) for (let i = 0; i < inner; i++) {
    let mx = -Infinity;
    for (let l = 0; l < len; l++) mx = Math.max(mx, a.data[(o * len + l) * inner + i]);
    let s = 0;
    for (let l = 0; l < len; l++) s += Math.exp(a.data[(o * len + l) * inner + i] - mx);
    const lse = mx + Math.log(s);
    for (let l = 0; l < len; l++) { const k = (o * len + l) * inner + i; out[k] = a.data[k] - lse; }
  }
  return make(out, a.shape.slice(), [a], "logSoftmax", (t) => () => {
    if (!a.requiresGrad) return;
    const g = t.gdata, ga = a.needGrad();
    for (let o = 0; o < outer; o++) for (let i = 0; i < inner; i++) {
      let gs = 0;
      for (let l = 0; l < len; l++) gs += g[(o * len + l) * inner + i];
      for (let l = 0; l < len; l++) { const k = (o * len + l) * inner + i; ga[k] += g[k] - Math.exp(out[k]) * gs; }
    }
  });
}
/** mean over rows of -log(softmax(logits)[target]); logits is (rows x classes), or any shape ending in classes */
function crossEntropy(logits, targets) {
  if (logits.ndim === 0) throw new TensorError("crossEntropy needs scores for each class, but got a single number.");
  const classes = logits.shape[logits.ndim - 1], nrows = logits.size / (classes || 1);
  if (targets.length !== nrows) {
    throw new TensorError(`crossEntropy: the scores are ${describeShape(logits.shape)} (${nrows} predictions) but you gave ${targets.length} correct answers. There must be one answer per prediction.`);
  }
  const flat = reshape(logits, [nrows, classes]);
  const [p] = softmaxData(flat, 1);
  let loss = 0;
  for (let r = 0; r < nrows; r++) {
    const t = targets[r];
    if (!Number.isInteger(t) || t < 0 || t >= classes) throw new TensorError(`crossEntropy: correct answer number ${r} is ${t}, but there are only ${classes} classes (0 to ${classes - 1}).`);
    loss -= Math.log(Math.max(p[r * classes + t], 1e-300));
  }
  loss /= nrows;
  return make(Float64Array.of(loss), [], [flat], "crossEntropy", (res) => () => {
    if (!flat.requiresGrad) return;
    const ga = flat.needGrad(), g = res.gdata[0] / nrows;
    for (let r = 0; r < nrows; r++) {
      for (let c = 0; c < classes; c++) ga[r * classes + c] += g * p[r * classes + c];
      ga[r * classes + targets[r]] -= g;
    }
  });
}

// ---------- layer norm ----------

function layerNorm(x, gamma, beta, eps = 1e-5) {
  if (x.ndim === 0) throw new TensorError("layerNorm needs a list or table, but got a single number.");
  const d = x.shape[x.ndim - 1], nrows = x.size / (d || 1);
  if (gamma.size !== d || beta.size !== d) {
    throw new TensorError(`layerNorm: the input has ${d} numbers per row, so gamma and beta must each be a list of ${d} numbers, but gamma is ${describeShape(gamma.shape)} and beta is ${describeShape(beta.shape)}.`);
  }
  const out = new Float64Array(x.size), xhat = new Float64Array(x.size), rstd = new Float64Array(nrows);
  for (let r = 0; r < nrows; r++) {
    let mu = 0;
    for (let j = 0; j < d; j++) mu += x.data[r * d + j];
    mu /= d;
    let v = 0;
    for (let j = 0; j < d; j++) { const c = x.data[r * d + j] - mu; v += c * c; }
    v /= d;
    const rs = 1 / Math.sqrt(v + eps);
    rstd[r] = rs;
    for (let j = 0; j < d; j++) { const h = (x.data[r * d + j] - mu) * rs; xhat[r * d + j] = h; out[r * d + j] = h * gamma.data[j] + beta.data[j]; }
  }
  return make(out, x.shape.slice(), [x, gamma, beta], "layerNorm", (t) => () => {
    const g = t.gdata;
    const gg = gamma.requiresGrad ? gamma.needGrad() : null, gb = beta.requiresGrad ? beta.needGrad() : null;
    const gx = x.requiresGrad ? x.needGrad() : null;
    for (let r = 0; r < nrows; r++) {
      let m1 = 0, m2 = 0;
      for (let j = 0; j < d; j++) {
        const k = r * d + j, dh = g[k] * gamma.data[j];
        m1 += dh; m2 += dh * xhat[k];
        if (gg) gg[j] += g[k] * xhat[k];
        if (gb) gb[j] += g[k];
      }
      m1 /= d; m2 /= d;
      if (gx) for (let j = 0; j < d; j++) { const k = r * d + j; gx[k] += rstd[r] * (g[k] * gamma.data[j] - m1 - xhat[k] * m2); }
    }
  });
}

// ---------- autograd driver ----------

function backward(root) {
  if (root.size !== 1) {
    throw new TensorError(`backward() works from a single number (like a loss), but this tensor is ${describeShape(root.shape)}. Reduce it first, for example with .mean() or .sum().`);
  }
  if (!root.requiresGrad) {
    throw new TensorError("backward() has nothing to do: no tensor in this calculation asked for a gradient. Create your weights with .requireGrad() first.");
  }
  const order = [], seen = new Set(), stack = [[root, 0]];
  seen.add(root);
  while (stack.length) {
    const top = stack[stack.length - 1], node = top[0];
    const prev = node._prev || [];
    if (top[1] < prev.length) {
      const p = prev[top[1]++];
      if (p.requiresGrad && !seen.has(p)) { seen.add(p); stack.push([p, 0]); }
    } else { order.push(node); stack.pop(); }
  }
  root.needGrad().fill(0); root.gdata[0] = 1;
  for (let i = order.length - 1; i >= 0; i--) { const n = order[i]; if (n._back) { n.needGrad(); n._back(); } }
}

function requireGrad(a) { a.requiresGrad = true; a.needGrad(); return a; }
function zeroGrad(a) { if (a.gdata) a.gdata.fill(0); }

// ---------- optimizers ----------

function checkParams(params, who) {
  if (!Array.isArray(params) || params.length === 0) throw new TensorError(`${who} needs a list of the tensors to train, like [w1, b1, w2]. Mark each one with .requireGrad() first.`);
  for (const [i, p] of params.entries()) {
    if (!p.requiresGrad) throw new TensorError(`${who}: tensor number ${i} in the list was not marked with .requireGrad(), so it can never learn.`);
  }
}
class SGD {
  constructor(params, lr, momentum = 0) {
    checkParams(params, "sgd");
    this.params = params; this.lr = lr; this.momentum = momentum;
    this.vel = params.map((p) => new Float64Array(p.size));
  }
  step() {
    this.params.forEach((p, k) => {
      const g = p.needGrad(), v = this.vel[k];
      for (let i = 0; i < g.length; i++) {
        if (this.momentum) { v[i] = this.momentum * v[i] + g[i]; p.data[i] -= this.lr * v[i]; } else p.data[i] -= this.lr * g[i];
      }
    });
  }
  zeroGrad() { this.params.forEach(zeroGrad); }
}
class Adam {
  constructor(params, lr, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
    checkParams(params, "adam");
    this.params = params; this.lr = lr; this.b1 = b1; this.b2 = b2; this.eps = eps; this.t = 0;
    this.m = params.map((p) => new Float64Array(p.size));
    this.v = params.map((p) => new Float64Array(p.size));
  }
  step() {
    this.t++;
    const c1 = 1 - Math.pow(this.b1, this.t), c2 = 1 - Math.pow(this.b2, this.t);
    this.params.forEach((p, k) => {
      const g = p.needGrad(), m = this.m[k], v = this.v[k], d = p.data;
      for (let i = 0; i < g.length; i++) {
        m[i] = this.b1 * m[i] + (1 - this.b1) * g[i];
        v[i] = this.b2 * v[i] + (1 - this.b2) * g[i] * g[i];
        d[i] -= this.lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + this.eps);
      }
    });
  }
  zeroGrad() { this.params.forEach(zeroGrad); }
}
/** scale all gradients so their combined length is at most maxNorm; returns the length before clipping */
function clipGradNorm(params, maxNorm) {
  let s = 0;
  for (const p of params) if (p.gdata) for (let i = 0; i < p.gdata.length; i++) s += p.gdata[i] * p.gdata[i];
  const norm = Math.sqrt(s);
  if (norm > maxNorm && norm > 0) { const f = maxNorm / norm; for (const p of params) if (p.gdata) for (let i = 0; i < p.gdata.length; i++) p.gdata[i] *= f; }
  return norm;
}

// ---------- sampling ----------

/** pick an index with chance proportional to probs (needs no negatives; they need not add up to 1) */
function sample(rng, probs) {
  let total = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (!(p >= 0)) throw new TensorError(`sample needs probabilities that are 0 or more, but item ${i} is ${p}.`);
    total += p;
  }
  if (probs.length === 0 || !(total > 0)) throw new TensorError("sample needs at least one probability above 0 to choose from.");
  let r = rng.random() * total;
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r < 0) return i; }
  return probs.length - 1;
}

// ---------- weights on disk ----------

const MAGIC = "MYCELTN1";
function serialize(params) {
  const header = Buffer.from(JSON.stringify({ shapes: params.map((p) => p.shape) }), "utf8");
  const total = params.reduce((a, p) => a + p.size, 0);
  const buf = Buffer.alloc(8 + 4 + header.length + total * 8);
  buf.write(MAGIC, 0, "latin1"); buf.writeUInt32LE(header.length, 8); header.copy(buf, 12);
  let off = 12 + header.length;
  for (const p of params) for (let i = 0; i < p.size; i++) { buf.writeDoubleLE(p.data[i], off); off += 8; }
  return buf;
}
function deserializeInto(buf, params, path) {
  if (buf.length < 12 || buf.toString("latin1", 0, 8) !== MAGIC) throw new TensorError(`${path} is not a tensor weights file (it should start with ${MAGIC}).`);
  const hl = buf.readUInt32LE(8);
  const shapes = JSON.parse(buf.toString("utf8", 12, 12 + hl)).shapes;
  if (shapes.length !== params.length) throw new TensorError(`${path} holds ${shapes.length} tensors but you asked to load ${params.length}. Load into the same list of tensors, in the same order, that you saved.`);
  for (let k = 0; k < shapes.length; k++) {
    if (!sameShape(shapes[k], params[k].shape)) throw new TensorError(`Tensor number ${k} in ${path} is ${describeShape(shapes[k])}, but the tensor you are loading into is ${describeShape(params[k].shape)}.`);
  }
  let off = 12 + hl;
  for (const p of params) for (let i = 0; i < p.size; i++) { p.data[i] = buf.readDoubleLE(off); off += 8; }
}

// ---------- printing ----------

function fmtNum(x) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (Number.isInteger(x) && Math.abs(x) < 1e6) return x.toFixed(1);
  const ax = Math.abs(x);
  if (ax !== 0 && (ax < 1e-3 || ax >= 1e6)) return x.toExponential(3);
  let s = x.toFixed(4);
  s = s.replace(/0+$/, "");
  return s.endsWith(".") ? s + "0" : s;
}
function format(t) {
  const tag = t.requiresGrad ? ", requires_grad" : "";
  if (t.ndim === 0) return `tensor(${fmtNum(t.data[0])}${tag})`;
  const EDGE = 3;
  function rec(offset, dim, indent) {
    const len = t.shape[dim];
    const stride = sizeOf(t.shape.slice(dim + 1));
    const idxs = len > 2 * EDGE ? [...Array(EDGE).keys(), -1, ...[...Array(EDGE).keys()].map((i) => len - EDGE + i)] : [...Array(len).keys()];
    if (dim === t.ndim - 1) return "[" + idxs.map((i) => (i < 0 ? "..." : fmtNum(t.data[offset + i]))).join(", ") + "]";
    const parts = idxs.map((i) => (i < 0 ? "..." : rec(offset + i * stride, dim + 1, indent + 1)));
    return "[" + parts.join(",\n" + (dim < t.ndim - 2 ? "\n" : "") + " ".repeat(indent + 1)) + "]";
  }
  if (t.size === 0) return `tensor([] shape=[${t.shape.join(", ")}]${tag})`;
  return `tensor(${rec(0, 0, 7)}${tag})`;
}

Tensor.prototype.toString_ = function () { return format(this); };
Tensor.prototype.toString = Tensor.prototype.toString_;

module.exports = {
  TensorError, Tensor, Rng, describeShape, sizeOf, sameShape, noGrad,
  fromData, fromNested, zeros, ones, full, scalar, arange, randn, rand, causalMask, detach, copyOf,
  add, sub, mul, div, maximum, neg, exp, log, sqrt, tanh, sigmoid, relu, gelu, pow,
  matmul, reshape, permute, transpose, rows, indexSelect,
  sum, mean, max, argmax, softmax, logSoftmax, crossEntropy, layerNorm,
  backward, requireGrad, zeroGrad, SGD, Adam, clipGradNorm, sample, serialize, deserializeInto, format,
};
