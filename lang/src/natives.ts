import { extractPieces, ExtractKind } from "./extract";
import { Panic, Runtime, PlyRange, PlyGen, display, eq, cmpPrim, kindOf, makeTuple, I64_MAX, I64_MIN, fstr, hasSurrogates } from "./runtime";

type Fn = (...a: any[]) => any;
const N = (x: bigint | number) => Number(x);
const surrogates = hasSurrogates;
const cps = (s: string): string[] => (surrogates(s) ? Array.from(s) : (s as any as string[]));
const toInt = (n: number, what: string): bigint => {
  if (!Number.isFinite(n)) throw new Panic(`cannot convert ${fstr(n)} to Int${what ? " in " + what : ""}`);
  const b = BigInt(Math.trunc(n));
  if (b > I64_MAX || b < I64_MIN) throw new Panic(`${n} does not fit in Int (64-bit)`);
  return b;
};

/** The natives behind the `extern` declarations of the prelude. Keys: "Type.method", "Type.get_prop", "Type.init", "fn". */
export function preludeNatives(rt: Runtime): Record<string, Fn> {
  const ctx = rt.ctx;
  const L = ctx.limits;
  const out = (text: string) => {
    ctx.outputBytes += text.length;
    if (ctx.outputBytes > L.maxOutputBytes) throw new Panic(`output limit of ${L.maxOutputBytes} bytes exceeded`, "limit", "output");
    ctx.write(text);
  };
  const need = (n: number, what: string) => { if (n > L.maxCollection) throw new Panic(`${what} would hold ${n} elements, over the limit of ${L.maxCollection}`, "limit", "memory"); };
  const iterObj = (arr: Iterable<any>) => { const it = arr[Symbol.iterator](); return { next: () => { const r = it.next(); return r.done ? null : r.value; } }; };
  const arrIdx = (a: any[], i: bigint, allowEnd = false) => { let n = N(i); if (n < 0) n += a.length; if (!(n >= 0 && (allowEnd ? n <= a.length : n < a.length))) throw new Panic(`index ${i} is out of range for a collection of length ${a.length}`); return n; };
  const padStr = (s: string, w: bigint, f: string = " ", left: boolean): string => {
    const width = N(w);
    need(width, "padded string");
    const schars = Array.from(s);
    if (schars.length >= width) return s;
    const fchars = f ? Array.from(f) : [" "];
    if (fchars.length === 0) return s;
    const padCount = width - schars.length;
    let pad = "";
    for (let i = 0; i < padCount; i++) pad += fchars[i % fchars.length];
    return left ? pad + s : s + pad;
  };

  const natives: Record<string, Fn> = {
    // ----- global functions -----
    // several values print separated by a space, like Python: print("total", 3) -> total 3
    print: (...vs: any[]) => out(vs.map((v) => display(v)).join(" ") + "\n"),
    write: (...vs: any[]) => out(vs.map((v) => display(v)).join(" ")),
    panic: (m: string) => { throw new Panic(m); },
    assert: (c: boolean, m: string = "assertion failed") => { if (!c) throw new Panic(m); },
    str: (v: any) => display(v),
    repr: (v: any) => display(v, true),
    len: (v: any) => {
      if (typeof v === "string") return BigInt(cps(v).length);
      if (Array.isArray(v)) return BigInt(v.length);
      if (v instanceof Map || v instanceof Set) return BigInt(v.size);
      if (v instanceof PlyRange) return natives["Range.get_length"](v);
      // a Mycel type with `get length: Int` (Json, user classes) works with len(), like Python's __len__
      if (v && typeof v === "object" && typeof v.length === "bigint") return v.length;
      throw new Panic(`len() does not apply to ${kindOf(v)}`);
    },
    typeName: (v: any) => kindOf(v),

    // ----- Int -----
    "Int.get_abs": (x: bigint) => (x < 0n ? (x === I64_MIN ? (() => { throw new Panic("integer overflow in abs()"); })() : -x) : x),
    "Int.get_isEven": (x: bigint) => x % 2n === 0n,
    "Int.get_isOdd": (x: bigint) => x % 2n !== 0n,
    "Int.get_sign": (x: bigint) => (x > 0n ? 1n : x < 0n ? -1n : 0n),
    "Int.toFloat": (x: bigint) => Number(x),
    "Int.toString": (x: bigint) => x.toString(),
    "Int.toChar": (x: bigint) => { const n = N(x); if (!(n >= 0 && n <= 0x10ffff) || (n >= 0xd800 && n <= 0xdfff)) throw new Panic(`${x} is not a valid Unicode code point`); return String.fromCodePoint(n); },
    "Int.pow": (x: bigint, e: bigint) => rt.helpers.$ipow(x, e),
    "Int.min": (a: bigint, b: bigint) => (a < b ? a : b),
    "Int.max": (a: bigint, b: bigint) => (a > b ? a : b),
    "Int.clamp": (x: bigint, lo: bigint, hi: bigint) => { if (lo > hi) throw new Panic(`clamp: lower bound ${lo} is above upper bound ${hi}`); return x < lo ? lo : x > hi ? hi : x; },
    "Int.toRadix": (x: bigint, r: bigint) => { if (r < 2n || r > 36n) throw new Panic("radix must be between 2 and 36"); return x.toString(Number(r)); },
    "Int.div": (a: bigint, b: bigint) => rt.helpers.$idiv(a, b),
    // `text.extract(Int, Operator) { ... }`: the checker passes the kinds as names; several kinds give `Piece` values
    "String.extract": (s: string, kinds: string[], filter?: (v: any) => boolean) => {
      const ps = extractPieces(s, kinds as ExtractKind[]);
      if (kinds.length === 1) { const vs = ps.map((p) => p.value); return filter ? vs.filter((v) => filter(v)) : vs; }
      const P = (rt.ctx as any).M["prelude"];
      return ps.map((p) => P["Piece$" + p.kind].of(p.value));
    },
    "Int.parse": (s: string) => { if (!/^[+-]?\d+$/.test(s.trim())) return null; const b = BigInt(s.trim()); return b > I64_MAX || b < I64_MIN ? null : b; },
    "Int.get_maxValue": () => I64_MAX,
    "Int.get_minValue": () => I64_MIN,

    // ----- Float -----
    "Float.get_abs": (x: number) => Math.abs(x),
    "Float.get_isNaN": (x: number) => Number.isNaN(x),
    "Float.get_isFinite": (x: number) => Number.isFinite(x),
    "Float.floor": (x: number) => toInt(Math.floor(x), "floor()"),
    "Float.ceil": (x: number) => toInt(Math.ceil(x), "ceil()"),
    "Float.round": (x: number) => toInt(Math.sign(x) * Math.round(Math.abs(x)), "round()"),
    "Float.trunc": (x: number) => toInt(Math.trunc(x), "trunc()"),
    "Float.toInt": (x: number) => toInt(Math.trunc(x), "toInt()"),
    "Float.toString": (x: number) => fstr(x),
    "Float.sqrt": (x: number) => Math.sqrt(x),
    "Float.pow": (x: number, y: number) => x ** y,
    "Float.min": (a: number, b: number) => Math.min(a, b),
    "Float.max": (a: number, b: number) => Math.max(a, b),
    "Float.clamp": (x: number, lo: number, hi: number) => { if (lo > hi) throw new Panic(`clamp: lower bound ${lo} is above upper bound ${hi}`); return Math.min(hi, Math.max(lo, x)); },
    "Float.fixed": (x: number, d: bigint) => { const n = N(d); if (n < 0 || n > 100) throw new Panic("fixed(): digits must be between 0 and 100"); return x.toFixed(n); },
    "Float.parse": (s: string) => {
      const raw = s.trim();
      const t = raw.toLowerCase();
      if (t === "nan") return NaN;
      if (t === "inf" || t === "+inf" || t === "infinity" || t === "+infinity") return Infinity;
      if (t === "-inf" || t === "-infinity") return -Infinity;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) return null;
      return Number(raw);
    },
    "Float.get_infinity": () => Infinity,
    "Float.get_nan": () => NaN,

    "Bool.toString": (b: boolean) => String(b),

    // ----- Char -----
    "Char.get_isDigit": (c: string) => /^\p{Nd}$/u.test(c),
    "Char.get_isLetter": (c: string) => /^\p{L}$/u.test(c),
    "Char.get_isUpper": (c: string) => /^\p{Lu}$/u.test(c),
    "Char.get_isLower": (c: string) => /^\p{Ll}$/u.test(c),
    "Char.get_isWhitespace": (c: string) => /^\s$/u.test(c),
    "Char.get_code": (c: string) => BigInt(c.codePointAt(0)!),
    "Char.upper": (c: string) => c.toUpperCase(),
    "Char.lower": (c: string) => c.toLowerCase(),
    "Char.toString": (c: string) => c,
    "Char.fromCode": (n: bigint) => natives["Int.toChar"](n),

    // ----- String (positions are Unicode code points) -----
    "String.get_length": (s: string) => BigInt(cps(s).length),
    "String.get_isEmpty": (s: string) => s.length === 0,
    "String.upper": (s: string) => s.toUpperCase(),
    "String.lower": (s: string) => s.toLowerCase(),
    "String.trim": (s: string) => s.trim(),
    "String.trimStart": (s: string) => s.trimStart(),
    "String.trimEnd": (s: string) => s.trimEnd(),
    "String.split": (s: string, sep: string) => (sep === "" ? Array.from(s) : s.split(sep)),
    "String.lines": (s: string) => s.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === "")),
    "String.chars": (s: string) => Array.from(s),
    "String.contains": (s: string, p: string) => s.includes(p),
    "String.startsWith": (s: string, p: string) => s.startsWith(p),
    "String.endsWith": (s: string, p: string) => s.endsWith(p),
    "String.replace": (s: string, a: string, b: string) => (a === "" ? s : s.split(a).join(b)),
    "String.indexOf": (s: string, p: string) => { const i = s.indexOf(p); return i < 0 ? null : BigInt(surrogates(s) ? Array.from(s.slice(0, i)).length : i); },
    "String.repeat": (s: string, n: bigint) => { if (n < 0n) throw new Panic("repeat count is negative"); if (s.length * N(n) > L.maxStringLength) throw new Panic(`string length limit of ${L.maxStringLength} exceeded (raise it with --max-string=<chars>)`, "limit", "memory"); return s.repeat(N(n)); },
    "String.padLeft": (s: string, w: bigint, f: string = " ") => padStr(s, w, f, true),
    "String.padRight": (s: string, w: bigint, f: string = " ") => padStr(s, w, f, false),
    "String.reversed": (s: string) => Array.from(s).reverse().join(""),
    "String.toInt": (s: string) => natives["Int.parse"](s),
    "String.toFloat": (s: string) => natives["Float.parse"](s),
    "String.toString": (s: string) => s,
    "String.substring": (s: string, from: bigint, to: bigint) => {
      const a = cps(s), f = N(from), t = N(to);
      if (f < 0 || t > a.length || f > t) throw new Panic(`substring(${from}, ${to}) is out of range for length ${a.length}`);
      // cps() hands back the string itself when it has no surrogate pairs; slice works on both, join only on arrays
      return typeof a === "string" ? (a as string).slice(f, t) : a.slice(f, t).join("");
    },
    "String.iter": (s: string) => iterObj(Array.from(s)),
    "String.bytes": (s: string) => Array.from(new TextEncoder().encode(s), (b) => BigInt(b)),

    // ----- Array -----
    "Array.init": () => [],
    "Array.get_length": (a: any[]) => BigInt(a.length),
    "Array.get_isEmpty": (a: any[]) => a.length === 0,
    "Array.get_first": (a: any[]) => (a.length ? a[0] : null),
    "Array.get_last": (a: any[]) => (a.length ? a[a.length - 1] : null),
    "Array.at": (a: any[], i: bigint) => { let n = N(i); if (n < 0) n += a.length; return n >= 0 && n < a.length ? a[n] : null; },
    "Array.push": (a: any[], x: any) => { need(a.length + 1, "array"); a.push(x); },
    "Array.pop": (a: any[]) => (a.length ? a.pop() : null),
    "Array.insert": (a: any[], x: any, at: bigint) => { need(a.length + 1, "array"); a.splice(arrIdx(a, at, true), 0, x); },
    "Array.removeAt": (a: any[], i: bigint) => a.splice(arrIdx(a, i), 1)[0],
    "Array.clear": (a: any[]) => { a.length = 0; },
    "Array.append": (a: any[], xs: any[]) => { need(a.length + xs.length, "array"); for (const x of xs) a.push(x); },
    "Array.map": (a: any[], f: Fn) => a.map((x) => f(x)),
    "Array.flatMap": (a: any[], f: Fn) => { const r: any[] = []; for (const x of a) r.push(...f(x)); need(r.length, "array"); return r; },
    "Array.filter": (a: any[], f: Fn) => a.filter((x) => f(x)),
    "Array.reduce": (a: any[], init: any, f: Fn) => { let acc = init; for (const x of a) acc = f(acc, x); return acc; },
    "Array.forEach": (a: any[], f: Fn) => { for (const x of a.slice()) f(x); },
    "Array.any": (a: any[], f: Fn) => a.some((x) => f(x)),
    "Array.all": (a: any[], f: Fn) => a.every((x) => f(x)),
    "Array.find": (a: any[], f: Fn) => { for (const x of a) if (f(x)) return x; return null; },
    "Array.findIndex": (a: any[], f: Fn) => { for (let i = 0; i < a.length; i++) if (f(a[i])) return BigInt(i); return null; },
    "Array.count": (a: any[], f: Fn) => { let n = 0; for (const x of a) if (f(x)) n++; return BigInt(n); },
    "Array.contains": (a: any[], x: any) => a.some((y) => eq(x, y)),
    "Array.indexOf": (a: any[], x: any) => { for (let i = 0; i < a.length; i++) if (eq(a[i], x)) return BigInt(i); return null; },
    "Array.sorted": (a: any[]) => [...a].sort((x, y) => cmpPrim(x, y)),
    "Array.sortedBy": (a: any[], k: Fn) => a.map((x) => [k(x), x] as const).sort((p, q) => cmpPrim(p[0], q[0])).map((p) => p[1]),
    "Array.reversed": (a: any[]) => [...a].reverse(),
    "Array.join": (a: any[], sep: string = "") => a.map((x) => display(x)).join(sep),
    "Array.slice": (a: any[], from: bigint, to: bigint) => { const f = N(from), t = N(to); if (f < 0 || t > a.length || f > t) throw new Panic(`slice(${from}, ${to}) is out of range for length ${a.length}`); return a.slice(f, t); },
    "Array.take": (a: any[], n: bigint) => a.slice(0, Math.max(0, N(n))),
    "Array.drop": (a: any[], n: bigint) => a.slice(Math.max(0, N(n))),
    "Array.concat": (a: any[], b: any[]) => { need(a.length + b.length, "array"); return a.concat(b); },
    "Array.enumerate": (a: any[]) => a.map((x, i) => makeTuple(BigInt(i), x)),
    "Array.zip": (a: any[], b: any[]) => a.slice(0, Math.min(a.length, b.length)).map((x, i) => makeTuple(x, b[i])),
    "Array.unique": (a: any[]) => { const r: any[] = []; for (const x of a) if (!r.some((y) => eq(x, y))) r.push(x); return r; },
    "Array.copy": (a: any[]) => a.slice(),
    "Array.iter": (a: any[]) => iterObj(a.slice()),

    // ----- Map -----
    "Map.init": () => new Map(),
    "Map.get_length": (m: Map<any, any>) => BigInt(m.size),
    "Map.get_isEmpty": (m: Map<any, any>) => m.size === 0,
    "Map.get_keys": (m: Map<any, any>) => [...m.keys()],
    "Map.get_values": (m: Map<any, any>) => [...m.values()],
    "Map.get_entries": (m: Map<any, any>) => [...m].map(([k, v]) => makeTuple(k, v)),
    "Map.has": (m: Map<any, any>, k: any) => m.has(k),
    "Map.contains": (m: Map<any, any>, k: any) => m.has(k),
    // get(key) -> V?, and Python's get(key, default) -> V (both call here; overloads share one native)
    "Map.get": (m: Map<any, any>, k: any, ...d: any[]) => { if (d.length) return m.has(k) ? m.get(k) : d[0]; const v = m.get(k); return v === undefined ? null : v; },
    "Map.getOr": (m: Map<any, any>, k: any, d: any) => (m.has(k) ? m.get(k) : d),
    "Map.set": (m: Map<any, any>, k: any, v: any) => { if (!m.has(k)) need(m.size + 1, "map"); m.set(k, v); },
    "Map.remove": (m: Map<any, any>, k: any) => { const v = m.get(k); m.delete(k); return v === undefined ? null : v; },
    "Map.clear": (m: Map<any, any>) => m.clear(),
    "Map.copy": (m: Map<any, any>) => new Map(m),
    "Map.merge": (m: Map<any, any>, o: Map<any, any>) => { const r = new Map(m); for (const [k, v] of o) r.set(k, v); need(r.size, "map"); return r; },
    "Map.iter": (m: Map<any, any>) => iterObj([...m].map(([k, v]) => makeTuple(k, v))),

    // ----- Set -----
    "Set.init": (items?: any[]) => new Set(items ?? []),
    "Set.get_length": (s: Set<any>) => BigInt(s.size),
    "Set.get_isEmpty": (s: Set<any>) => s.size === 0,
    "Set.add": (s: Set<any>, x: any) => { if (!s.has(x)) need(s.size + 1, "set"); s.add(x); },
    "Set.has": (s: Set<any>, x: any) => s.has(x),
    "Set.contains": (s: Set<any>, x: any) => s.has(x),
    "Set.remove": (s: Set<any>, x: any) => s.delete(x),
    "Set.clear": (s: Set<any>) => s.clear(),
    "Set.union": (a: Set<any>, b: Set<any>) => new Set([...a, ...b]),
    "Set.intersect": (a: Set<any>, b: Set<any>) => new Set([...a].filter((x) => b.has(x))),
    "Set.subtract": (a: Set<any>, b: Set<any>) => new Set([...a].filter((x) => !b.has(x))),
    "Set.toArray": (s: Set<any>) => [...s],
    "Set.sorted": (s: Set<any>) => natives["Array.sorted"]([...s]),
    // Python/Ruby set operators: & intersection, | union, - difference
    "Set.&": (a: Set<any>, b: Set<any>) => natives["Set.intersect"](a, b),
    "Set.|": (a: Set<any>, b: Set<any>) => natives["Set.union"](a, b),
    "Set.-": (a: Set<any>, b: Set<any>) => natives["Set.subtract"](a, b),
    "Set.iter": (s: Set<any>) => iterObj([...s]),

    // ----- Range -----
    "Range.get_lo": (r: PlyRange) => r.start,
    "Range.get_hi": (r: PlyRange) => { if (r.hi === null) throw new Panic("open-ended range has no upper bound"); return rt.helpers.$w(r.inc ? r.hi + 1n : r.hi); },
    "Range.get_length": (r: PlyRange) => { if (r.hi === null) throw new Panic("open-ended range has no length"); const n = (r.inc ? r.hi + 1n : r.hi) - r.start; return n < 0n ? 0n : n; },
    "Range.get_isEmpty": (r: PlyRange) => natives["Range.get_length"](r) === 0n,
    "Range.get_first": (r: PlyRange) => natives["Range.get_length"](r) === 0n ? null : r.start,
    "Range.get_last": (r: PlyRange) => { const len = natives["Range.get_length"](r); return len === 0n ? null : (r.inc ? r.hi! : r.hi! - 1n); },
    "Range.contains": (r: PlyRange, n: bigint) => n >= r.start && (r.hi === null || (r.inc ? n <= r.hi : n < r.hi)),
    "Range.toArray": (r: PlyRange) => { const len = natives["Range.get_length"](r); need(N(len), "array"); return [...r]; },
    "Range.iter": (r: PlyRange) => iterObj(r),
    "Range.map": (r: PlyRange, f: Fn) => (natives["Range.toArray"](r) as any[]).map((x: any) => f(x)),
    "Range.filter": (r: PlyRange, f: Fn) => (natives["Range.toArray"](r) as any[]).filter((x: any) => f(x)),
    "Range.reduce": (r: PlyRange, init: any, f: Fn) => (natives["Range.toArray"](r) as any[]).reduce((acc: any, x: any) => f(acc, x), init),
    "Range.forEach": (r: PlyRange, f: Fn) => { for (const x of r) f(x); },
    "Range.any": (r: PlyRange, f: Fn) => { for (const x of r) if (f(x)) return true; return false; },
    "Range.all": (r: PlyRange, f: Fn) => { for (const x of r) if (!f(x)) return false; return true; },
    "Range.count": (r: PlyRange, f: Fn) => { let n = 0; for (const x of r) if (f(x)) n++; return BigInt(n); },
    "Range.sum": (r: PlyRange) => { let s = 0n; for (const x of r) s = rt.helpers.$w(s + x); return s; },
    "Range.step": (r: PlyRange, by: bigint) => { if (by <= 0n) throw new Panic(`step(${by}) needs a positive step`); const out: bigint[] = []; let i = 0n; for (const x of r) { if (i % by === 0n) out.push(x); i++; } need(out.length, "array"); return out; },

    // ----- Gen -----
    "Gen.next": (g: PlyGen) => g.next(),
    "Gen.toArray": (g: PlyGen) => { const r: any[] = []; for (;;) { const v = g.next(); if (v === null) return r; need(r.length + 1, "array"); r.push(v); } },
    "Gen.iter": (g: PlyGen) => g,
  };
  return natives;
}
