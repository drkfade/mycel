/** std.pycompat (task 55): Python's str/repr/int/float/truthiness for programs produced by `mycel translate`. */
import { Panic, PlyRange, Runtime, isTuple } from "./runtime";

/** Python float repr: 2.0, 1e+16, 1e-07, inf, nan */
export function pyFloat(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
  const a = Math.abs(x);
  let s = a >= 1e16 || (a !== 0 && a < 1e-4) ? x.toExponential() : String(x);
  s = s.replace(/e([+-])(\d)$/, "e$10$2");
  return s;
}
const quote = (s: string) => {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  return q + s.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), "\\" + q).replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r") + q;
};
export function pyStr(v: any, nested = false, depth = 0): string {
  if (depth > 100) return "...";
  const r = (x: any) => pyStr(x, true, depth + 1);
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return pyFloat(v);
  if (typeof v === "string") return nested ? quote(v) : v;
  if (Array.isArray(v)) {
    if (isTuple(v)) return v.length === 1 ? `(${r(v[0])},)` : `(${v.map(r).join(", ")})`;
    return `[${v.map(r).join(", ")}]`;
  }
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${r(k)}: ${r(x)}`).join(", ")}}`;
  if (v instanceof Set) return v.size ? `{${[...v].map(r).join(", ")}}` : "set()";
  if (v instanceof PlyRange) return `range(${(v as any).start}, ${(v as any).end})`;
  if (v && typeof v === "object" && "rt" in v && "v" in v) {
    if (v.rt === "python" && typeof v.v === "string" && nested) return quote(v.v);
    if (typeof v.toString_ === "function") return v.toString_();
  }
  if (typeof v.toString_ === "function") return v.toString_();
  return String(v);
}

/** Python's ordering: numbers by value (Int and Float mixed), strings by code point, sequences item by item. */
export function pyCmp(a: any, b: any): number {
  const num = (x: any) => typeof x === "bigint" || typeof x === "number" || typeof x === "boolean";
  if (num(a) && num(b)) { const x = typeof a === "boolean" ? Number(a) : a, y = typeof b === "boolean" ? Number(b) : b; return x < y ? -1 : x > y ? 1 : 0; }
  if (typeof a === "string" && typeof b === "string") { const x = Array.from(a), y = Array.from(b); for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = x[i].codePointAt(0)! - y[i].codePointAt(0)!; if (c) return c < 0 ? -1 : 1; } return x.length - y.length; }
  if (Array.isArray(a) && Array.isArray(b)) { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = pyCmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  throw new Panic(`'<' not supported between ${pyStr(a, true)} and ${pyStr(b, true)}`);
}

function best(xs: any[], key: (x: any) => any, sign: 1 | -1) {
  if (!xs.length) throw new Panic(`${sign > 0 ? "max" : "min"}() arg is an empty sequence`);
  let b = xs[0], bk = key(b);
  for (let i = 1; i < xs.length; i++) { const k = key(xs[i]); if (pyCmp(k, bk) * sign > 0) { b = xs[i]; bk = k; } }
  return b;
}

export function pycompatNatives(rt: Runtime): Record<string, (...a: any[]) => any> {
  const valueError = (msg: string) => { const C = rt.ctx.M["std.pycompat"].ValueError; return new C().$init(msg); };
  const str = (v: any, nested = false) => pyStr(v, nested);
  const zero = () => { throw new Panic("integer division or modulo by zero"); };
  return {
    "std.pycompat.str": (v: any) => str(v),
    "std.pycompat.repr": (v: any) => str(v, true),
    "std.pycompat.int": (v: any) => {
      if (typeof v === "bigint") return v;
      if (typeof v === "boolean") return v ? 1n : 0n;
      if (typeof v === "number") { if (!Number.isFinite(v)) throw valueError(`cannot convert float ${pyFloat(v)} to integer`); return BigInt(Math.trunc(v)); }
      if (typeof v === "string") { const t = v.trim().replace(/_/g, ""); if (/^[+-]?\d+$/.test(t)) return BigInt(t); throw valueError(`invalid literal for int() with base 10: ${quote(v)}`); }
      throw valueError(`int() argument must be a string or a number, not ${str(v)}`);
    },
    "std.pycompat.float": (v: any) => {
      if (typeof v === "number") return v;
      if (typeof v === "bigint") return Number(v);
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "string") { const t = v.trim().toLowerCase(); const n = t === "inf" || t === "infinity" ? Infinity : t === "-inf" ? -Infinity : t === "nan" ? NaN : /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t) ? Number(t) : undefined; if (n === undefined) throw valueError(`could not convert string to float: ${quote(v)}`); return n; }
      throw valueError(`float() argument must be a string or a number, not ${str(v)}`);
    },
    "std.pycompat.slice": (xs: any, lo: bigint | null, hi: bigint | null) => {
      const items: any[] = typeof xs === "string" ? Array.from(xs) : xs;
      const n = items.length;
      const fix = (b: bigint | null, d: number) => { if (b === null || b === undefined) return d; let i = Number(b); if (i < 0) i += n; return Math.min(Math.max(i, 0), n); };
      const a = fix(lo, 0), z = fix(hi, n);
      const out = a < z ? items.slice(a, z) : [];
      return typeof xs === "string" ? out.join("") : out;
    },
    "std.pycompat.sorted": (xs: any[]) => [...xs].sort(pyCmp),
    "std.pycompat.sortedBy": (xs: any[], key: (x: any) => any) => xs.map((x) => [key(x), x] as [any, any]).sort((a, b) => pyCmp(a[0], b[0])).map((p) => p[1]),
    "std.pycompat.maxBy": (xs: any[], key: (x: any) => any) => best(xs, key, 1),
    "std.pycompat.minBy": (xs: any[], key: (x: any) => any) => best(xs, key, -1),
    "std.pycompat.truthy": (v: any) => !(v === null || v === undefined || v === false || v === 0n || v === 0 || v === "" || (Array.isArray(v) && !v.length) || ((v instanceof Map || v instanceof Set) && !v.size)),
    "std.pycompat.floordiv": (a: any, b: any) => {
      if (typeof a === "bigint") { if (b === 0n) zero(); const q = a / b; return (a % b !== 0n) && ((a < 0n) !== (b < 0n)) ? q - 1n : q; }
      if (b === 0) throw new Panic("float floor division by zero"); return Math.floor(a / b);
    },
    "std.pycompat.mod": (a: any, b: any) => {
      if (typeof a === "bigint") { if (b === 0n) zero(); const r = a % b; return r !== 0n && ((r < 0n) !== (b < 0n)) ? r + b : r; }
      if (b === 0) throw new Panic("float modulo"); const r = a % b; return r !== 0 && ((r < 0) !== (b < 0)) ? r + b : r;
    },
    "std.pycompat.round": (x: number, digits?: bigint) => {
      if (digits === undefined) { if (!Number.isFinite(x)) throw valueError(`cannot convert float ${pyFloat(x)} to integer`); const f = Math.floor(x), d = x - f; return BigInt(d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f); }
      // Python rounds the exact binary value; toFixed does the same for the common cases
      return Number(x.toFixed(Math.max(0, Math.min(100, Number(digits)))));
    },
    "std.pycompat.zfill": (s: string, width: bigint) => {
      const w = Number(width);
      if (s.length >= w) return s;
      const sign = s[0] === "+" || s[0] === "-" ? s[0] : "";
      const body = sign ? s.slice(1) : s;
      return sign + body.padStart(w - sign.length, "0");
    },
    "std.pycompat.splitWs": (s: string) => {
      const t = s.trim();
      return t ? t.split(/\s+/) : [];
    },
    "std.pycompat.splitLinesKeep": (s: string) => {
      if (!s) return [];
      const parts = s.split("\n");
      const out: string[] = [];
      for (let i = 0; i < parts.length - 1; i++) out.push(parts[i] + "\n");
      if (parts[parts.length - 1] !== "") out.push(parts[parts.length - 1]);
      return out;
    },
    "std.pycompat.sum": (xs: any[]) => {
      let acc: any = 0n;
      for (const raw of xs) {
        const x = raw && typeof raw.$num === "function" ? raw.$num() : raw;
        if (typeof acc === "bigint" && typeof x === "bigint") acc += x;
        else acc = Number(acc) + Number(x);
      }
      return acc;
    },
    "std.pycompat.strip": (x: any) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x.v === "string") return x.v.trim();
      if (x && x.pyOps && x.v?.$h !== undefined) return String(x.pyOps.req({ op: "callm", h: x.v.$h, m: "strip", args: [] }));
      return String(x).trim();
    },
    "std.pycompat.pow": (a0: any, b0: any) => {
      const a = a0 && typeof a0.$num === "function" ? a0.$num() : a0;
      const b = b0 && typeof b0.$num === "function" ? b0.$num() : b0;
      if (typeof a === "bigint" && typeof b === "bigint" && b >= 0n) return a ** b;
      return Number(a) ** Number(b);
    },
  };
}
