// task 55 offline npm fixture: a scoped name (not an identifier) whose import needs `as`
exports.hello = (name, punct = "!") => `hello ${name}${punct}`;
exports.opts = (name, opts = {}) => {
  const s = opts.upper ? String(name).toUpperCase() : String(name);
  return Array.from({ length: opts.times || 1 }, () => s).join(" ");
};
exports.sum = (xs) => xs.reduce((a, b) => a + b, 0);
exports.info = () => ({ ok: true, items: [1, 2.5, null, "x"], nested: { k: "v" } });
exports.later = (x) => Promise.resolve(x * 2);
exports.boom = () => { throw new RangeError("fixture says no"); };
exports.VERSION = "1.0.0";
class Counter { constructor(n = 0) { this.n = n; } add(k = 1) { this.n += k; return this.n; } toString() { return `Counter(${this.n})`; } }
exports.Counter = Counter;
class Bag { constructor() { this.map = new Map([["a", 1], ["b", 2]]); } get size() { return this.map.size; } fetch(k) { return this.map.get(k); } *[Symbol.iterator]() { yield "x"; yield "y"; } }
exports.Bag = Bag;
exports.make = (n) => new Counter(n);
