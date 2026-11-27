// Runtime support for generated code. Every helper is `$`-prefixed: Ply identifiers cannot start with `$`,
// so generated code can never collide with (or be tricked into reaching) anything else in the host.

export interface RunLimits {
  maxSteps?: number;          // function entries + loop iterations
  maxMillis?: number;         // wall-clock budget
  maxOutputBytes?: number;
  maxCollection?: number;     // elements in any array / map / set
  maxStringLength?: number;
}
export const DEFAULT_LIMITS: Required<RunLimits> = {
  maxSteps: 200_000_000, maxMillis: 30_000, maxOutputBytes: 1_000_000, maxCollection: 2_000_000, maxStringLength: 10_000_000,
};

export type PanicKind = "panic" | "limit" | "abort";
/** A runtime panic: uncatchable by Ply `catch`; the host gets it as a typed failure. */
export class Panic extends Error {
  plyStack?: string;
  constructor(message: string, public kind: PanicKind = "panic", public limit?: string) {
    super(message);
    this.name = "Panic";
    this.plyStack = new Error().stack;
  }
}
/** Non-local exit for `?` (caught at the nearest enclosing function). */
export class Early { constructor(public value: unknown) {} }

export const I64_MAX = 9223372036854775807n;
export const I64_MIN = -9223372036854775808n;

/** One line of the playground's live-values column: `name` (empty for a bare expression), its last value, hits. */
export interface LiveValue { line: number; name: string; text: string; count: number }
export const clipLive = (s: string): string => (s.length > 120 ? s.slice(0, 117) + "..." : s);
/** The recorded values, in line order (entries hit more than 1000 times render their last value now). */
export function liveValues(ctx: RuntimeCtx): LiveValue[] | undefined {
  const L = (ctx as any).live as Map<number, LiveValue & { v?: any }> | undefined;
  if (!L) return undefined;
  return [...L.values()].sort((a, b) => a.line - b.line).map((e) => ({ line: e.line, name: e.name, text: e.count > 1000 ? clipLive(display(e.v, true)) : e.text, count: e.count }));
}

export interface RuntimeCtx {
  limits: Required<RunLimits>;
  write(text: string): void;
  signal?: AbortSignal;
  steps: number;
  start: number;
  outputBytes: number;
  tests: { module: string; name: string; fn: () => Promise<void> }[];
  M: Record<string, any>;
  unobserved: Set<Promise<unknown>>;
  taskErrors: unknown[];
}

export function newCtx(limits: RunLimits, write: (t: string) => void, signal?: AbortSignal): RuntimeCtx {
  return {
    limits: { ...DEFAULT_LIMITS, ...Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined)) } as Required<RunLimits>,
    write, signal, steps: 0, start: Date.now(), outputBytes: 0, tests: [], M: {}, unobserved: new Set(), taskErrors: [],
  };
}

// ---------- values ----------
export class PlyObj {}
export class PlyRange {
  constructor(public lo: bigint | null, public hi: bigint | null, public inc: boolean) {}
  get start(): bigint { return this.lo ?? 0n; }
  get length(): bigint {
    if (this.hi === null) throw new Panic("open-ended range has no length");
    const n = (this.inc ? this.hi + 1n : this.hi) - this.start;
    return n < 0n ? 0n : n;
  }
  *[Symbol.iterator](): Iterator<bigint> {
    if (this.hi === null) throw new Panic("cannot iterate an open-ended range (add an upper bound)");
    const end = this.inc ? this.hi : this.hi - 1n;
    for (let i = this.start; i <= end; i++) yield i;
  }
}
export class PlyGen {
  constructor(private it: Iterator<unknown>) {}
  next(): unknown { const r = this.it.next(); return r.done ? null : r.value; }
  [Symbol.iterator]() { return { next: () => this.it.next() }; }
}
class TaskPromise<T> extends Promise<T> {
  $observed = false;
  $errRecord?: { error: unknown; handled: boolean };
  static get [Symbol.species]() { return Promise; }
  then<A, B>(a?: any, b?: any): Promise<A | B> {
    this.$observed = true;
    if (this.$errRecord) this.$errRecord.handled = true;
    return super.then(a, b) as any;
  }
}

const TUP = Object.create(Array.prototype);
export const isTuple = (v: unknown): boolean => Array.isArray(v) && Object.getPrototypeOf(v) === TUP;

let lastStr = "", lastSurr = false;
/** Does the string contain UTF-16 surrogates (non-BMP characters)? One-entry cache: loops that index one string stay O(1) per step. */
export function hasSurrogates(s: string): boolean {
  if (s === lastStr) return lastSurr;
  lastSurr = /[\ud800-\udfff]/.test(s); lastStr = s;
  return lastSurr;
}

export function kindOf(v: any): string {
  if (v === null || v === undefined) return v === null ? "nil" : "Void";
  switch (typeof v) {
    case "bigint": return "Int";
    case "number": return "Float";
    case "string": return "String";
    case "boolean": return "Bool";
    case "function": return "Fn";
  }
  if (Array.isArray(v)) return isTuple(v) ? "Tuple" : "Array";
  if (v instanceof Map) return "Map";
  if (v instanceof Set) return "Set";
  if (v instanceof PlyRange) return "Range";
  if (v instanceof PlyGen) return "Gen";
  if (v instanceof Promise) return "Task";
  return v.constructor?.$name ?? "Object";
}

// ---------- display ----------
export function fstr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return x.toFixed(1);
  return String(x);
}
/** Python-style format spec: [[fill]align][sign][#][0][width][,][.precision][type]. */
export function fmtSpec(v: any, spec: string, debug = false): string {
  if (!spec) return display(v, debug);
  const m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/su.exec(spec);
  if (!m) throw new Panic(`bad format spec \`${spec}\` in an f-string (use e.g. {x:.2f} {n:>5} {n:,} {n:05d})`);
  let [, fill, align, sign, alt, zero, width, group, prec, type] = m as any;
  const isNum = typeof v === "number" || typeof v === "bigint";
  if (!isNum && type && !"s".includes(type)) throw new Panic(`format type \`${type}\` needs a number, got ${display(v, true)}`);
  let body: string;
  if (isNum) {
    const neg = typeof v === "bigint" ? v < 0n : v < 0 || Object.is(v, -0);
    const abs: any = typeof v === "bigint" ? (neg ? -v : v) : Math.abs(v);
    if (!type) type = typeof v === "bigint" ? "d" : prec !== undefined ? "g" : "";
    const p = prec === undefined ? undefined : Number(prec);
    let s: string;
    switch (type) {
      case "d": case "n": s = abs.toString(); break;
      case "b": s = abs.toString(2); if (alt) s = "0b" + s; break;
      case "o": s = abs.toString(8); if (alt) s = "0o" + s; break;
      case "x": s = abs.toString(16); if (alt) s = "0x" + s; break;
      case "X": s = abs.toString(16).toUpperCase(); if (alt) s = "0X" + s; break;
      case "c": s = String.fromCodePoint(Number(abs)); break;
      case "f": case "F": s = Number(abs).toFixed(p ?? 6); break;
      case "e": case "E": s = Number(abs).toExponential(p ?? 6).replace(/e([+-])(\d)$/, "e$10$2"); if (type === "E") s = s.toUpperCase(); break;
      case "%": s = (Number(abs) * 100).toFixed(p ?? 6) + "%"; break;
      case "g": case "G": s = String(Number(Number(abs).toPrecision(p || 6))); break;
      default: s = typeof abs === "number" ? (p !== undefined ? abs.toFixed(p) : fstr(abs)) : abs.toString();
    }
    if (group && !"bcoxX".includes(type)) { const [ip, fp] = s.split("."); s = ip.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (fp !== undefined ? "." + fp : ""); }
    const sg = neg ? "-" : sign === "+" ? "+" : sign === " " ? " " : "";
    if (zero && !align) { fill = "0"; align = "="; }
    const w = width ? Number(width) : 0;
    if (align === "=" ) body = sg + (fill ?? " ").repeat(Math.max(0, w - sg.length - s.length)) + s;
    else body = sg + s;
    if (!align) align = ">";
  } else {
    body = display(v);
    if (prec !== undefined) body = [...body].slice(0, Number(prec)).join("");
    if (!align) align = "<";
  }
  const w = width ? Number(width) : 0, len = [...body].length;
  if (len >= w || align === "=") return body;
  const pad = w - len, f = fill ?? " ";
  if (align === "<") return body + f.repeat(pad);
  if (align === ">") return f.repeat(pad) + body;
  return f.repeat(Math.floor(pad / 2)) + body + f.repeat(pad - Math.floor(pad / 2));
}
export function display(v: any, quote = false, depth = 0): string {
  if (depth > 20) return "...";
  if (v === null) return "nil";
  if (v === undefined) return "()";
  switch (typeof v) {
    case "bigint": return v.toString();
    case "number": return fstr(v);
    case "boolean": return String(v);
    case "string": return quote ? JSON.stringify(v) : v;
    case "function": return "<fn>";
  }
  const r = (x: any) => display(x, true, depth + 1);
  if (Array.isArray(v)) return isTuple(v) ? `(${v.map(r).join(", ")})` : `[${v.map(r).join(", ")}]`;
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${r(k)}: ${r(x)}`).join(", ")}}`;
  if (v instanceof Set) return `#[${[...v].map(r).join(", ")}]`;
  if (v instanceof PlyRange) return `${v.lo ?? ""}${v.inc ? "..=" : ".."}${v.hi ?? ""}`;
  if (v instanceof PlyGen) return "<gen>";
  if (v instanceof Promise) return "<task>";
  const c = v.constructor;
  if (typeof v.toString_ === "function") return v.toString_();
  if (c?.$kind === "enum" || c?.$ename) {
    const names: (string | null)[] = c.$fieldNames ?? [];
    const fields: string[] = c.$fields ?? [];
    const args = fields.map((f, i) => (names[i] ? `${names[i]}: ${r(v[f])}` : r(v[f])));
    return `${c.$tag}${fields.length ? `(${args.join(", ")})` : ""}`;
  }
  if (c?.$fields) return `${c.$name}(${(c.$fields as string[]).map((f) => `${f.replace(/_$/, "")}: ${r(v[f])}`).join(", ")})`;
  return `<${c?.$name ?? "object"}>`;
}

export function eq(a: any, b: any): boolean {
  if (a === b) return true;
  if ((typeof a === "bigint" && typeof b === "number") || (typeof a === "number" && typeof b === "bigint")) return Number(a) === Number(b);
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a instanceof Map) { if (!(b instanceof Map) || a.size !== b.size) return false; for (const [k, v] of a) if (!b.has(k) || !eq(v, b.get(k))) return false; return true; }
  if (a instanceof Set) { if (!(b instanceof Set) || a.size !== b.size) return false; for (const k of a) if (!b.has(k)) return false; return true; }
  if (a instanceof PlyRange) return b instanceof PlyRange && a.lo === b.lo && a.hi === b.hi && a.inc === b.inc;
  if (a.constructor !== b.constructor) return false;
  const k = a.constructor.$kind;
  if (k === "struct" || k === "enum") { for (const f of a.constructor.$fields as string[]) if (!eq(a[f], b[f])) return false; return a.$t === b.$t; }
  return false;
}

function cmpPrim(a: any, b: any): number {
  if (typeof a === "object" && a !== null) {
    if (typeof a.$op_lt === "function") return a.$op_lt(b) ? -1 : b.$op_lt(a) ? 1 : 0;
    throw new Panic(`${kindOf(a)} cannot be ordered (it does not define operator <)`);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------- runtime factory ----------
export interface Runtime {
  helpers: Record<string, any>;
  natives: Record<string, (...a: any[]) => any>;
  ctx: RuntimeCtx;
  extReg: Map<string, Map<string, Function>>;
}

export function createRuntime(ctx: RuntimeCtx, nativeFactory: (rt: Runtime) => Record<string, (...a: any[]) => any>): Runtime {
  const extReg = new Map<string, Map<string, Function>>();
  const L = ctx.limits;
  const checkAbort = () => {
    if (ctx.signal?.aborted) throw new Panic("the run was aborted", "abort");
    if (Date.now() - ctx.start > L.maxMillis) throw new Panic(`time limit of ${L.maxMillis} ms exceeded`, "limit", "time");
  };
  const tick = () => {
    if (++ctx.steps > L.maxSteps) throw new Panic(`step limit of ${L.maxSteps} exceeded (possible infinite loop)`, "limit", "steps");
    if ((ctx.steps & 4095) === 0) checkAbort();
  };
  const w = (x: bigint): bigint => { if (x > I64_MAX || x < I64_MIN) throw new Panic(`integer overflow: ${x} does not fit in Int (64-bit)`); return x; };
  const panicIndex = (i: unknown, n: number): never => { throw new Panic(`index ${i} is out of range for a collection of length ${n}`); };
  const resultOf = (): { Ok: any; Err: any } => { const R = ctx.M["prelude"]; return { Ok: R.Result$Ok, Err: R.Result$Err }; };

  const iterOf = (x: any): any => {
    if (Array.isArray(x) || x instanceof Set || x instanceof PlyGen || x instanceof PlyRange) return x;
    if (x instanceof Map) return (function* () { for (const [k, v] of x) yield tup(k, v); })();
    if (typeof x === "string") return Array.from(x);
    if (x && typeof x.iter === "function") { const it = x.iter(); return (function* () { for (;;) { const r = it.next(); if (r === null) return; yield r; } })(); }
    if (x && typeof x.next === "function") return (function* () { for (;;) { const r = x.next(); if (r === null) return; yield r; } })();
    throw new Panic(`${kindOf(x)} is not iterable`);
  };
  const tup = (...a: any[]) => Object.setPrototypeOf(a, TUP);

  // live values (playground): per source line the last value shown (rendered while cheap, at the end after 1000 hits)
  const live = (line: number, name: string, v: any) => {
    const L = (ctx as any).live as Map<number, LiveValue & { v?: any }> | undefined;
    if (!L) return v;
    let e = L.get(line);
    if (!e) { if (L.size >= 5000) return v; e = { line, name, text: "", count: 0 }; L.set(line, e); }
    e.count++;
    if (e.count <= 1000) e.text = clipLive(display(v, true)); else e.v = v;
    return v;
  };

  const helpers: Record<string, any> = {
    $live: live,
    $Obj: PlyObj, $Early: Early, $tick: tick, $w: w, $t: tup, $range: (lo: any, hi: any, inc: boolean) => new PlyRange(lo, hi, inc),
    $eq: eq, $s: (v: any) => display(v), $str: (v: any) => display(v), $fs: fstr, $fmt: fmtSpec,
    $iter: iterOf,
    $isRange: (v: any) => v instanceof PlyRange, $isGen: (v: any) => v instanceof PlyGen, $kindOf: kindOf,
    $gen: (g: Iterator<unknown>) => new PlyGen(g),
    $meta(cls: any, name: string, kind: string, fields: string[], ifaces: string[]) {
      cls.$name = name; cls.$kind = kind; cls.$fields = fields; cls.$ifaces = new Set([...ifaces, ...(Object.getPrototypeOf(cls).$ifaces ?? [])]);
      if (kind === "enum") cls.$ename = name;
    },
    $mix(cls: any, defaults: Record<string, Function>) { for (const k of Object.keys(defaults)) if (!(k in cls.prototype)) Object.defineProperty(cls.prototype, k, { value: defaults[k], writable: true, configurable: true }); },
    $variant(Base: any, name: string, index: number, fieldJs: string[], fieldNames: (string | null)[]) {
      const V = class extends Base {
        $init(...a: any[]) { fieldJs.forEach((f, i) => { (this as any)[f] = a[i]; }); return this; }
        static of(...a: any[]) { return new V().$init(...a); }
      };
      Object.defineProperty(V.prototype, "$t", { value: index });
      Object.defineProperty(V, "name", { value: `${Base.$name}.${name}` });
      Object.assign(V, { $tag: name, $fields: fieldJs, $fieldNames: fieldNames, $kind: "enum", $ename: Base.$name, $name: Base.$name, $ifaces: Base.$ifaces });
      return V;
    },
    $impl: (v: any, id: string) => v !== null && typeof v === "object" ? !!v.constructor?.$ifaces?.has(id) : !!natives[`$iface.${kindOf(v)}.${id}`] || id.startsWith("prelude.Printable") || id.startsWith("prelude.Equatable"),
    $thr(x: any) { if (x && typeof x === "object" && !x.$stack) x.$stack = new Error().stack; return x; },
    $norm(e: any) {
      if (e instanceof Panic || e instanceof Early) throw e;
      if (e instanceof RangeError && /call stack/i.test(e.message)) throw new Panic("stack overflow: recursion is too deep");
      if (e instanceof Error) { const p = new Panic(`internal error: ${e.name}: ${e.message}`); p.plyStack = e.stack; throw p; }
      return e;
    },
    $nomatch: (v: any) => { throw new Panic(`no match arm handled the value ${display(v, true)}`); },
    $fu: (v: any) => { if (v === null || v === undefined) throw new Panic("unexpectedly found nil while force-unwrapping an optional (`!`)"); return v; },
    $q(v: any) {
      if (v === null || v === undefined) throw new Early(null);
      if (typeof v === "object" && v.constructor?.$ename === "Result") { if (v.$t === 1) throw new Early(v); return v._0; }
      return v;
    },
    $castFail: (v: any, name: string) => { throw new Panic(`cast failed: ${display(v, true)} is not a ${name}`); },
    $try(fn: () => any) {
      const { Ok, Err } = resultOf();
      try { return Ok.of(fn()); } catch (e) { const n = helpers.$norm(e); return Err.of(n); }
    },
    async $tryA(fn: () => Promise<any>) {
      const { Ok, Err } = resultOf();
      try { return Ok.of(await fn()); } catch (e) { const n = helpers.$norm(e); return Err.of(n); }
    },
    $spawn(fn: () => any) {
      const p = new TaskPromise((res, rej) => { Promise.resolve().then(fn).then(res, rej); });
      ctx.unobserved.add(p);
      Promise.prototype.then.call(p, () => ctx.unobserved.delete(p), (e: unknown) => {
        if (!(p as any).$observed) {
          const rec = { error: e, handled: false };
          (p as any).$errRecord = rec;
          ((ctx as any).pendingTaskErrors ??= []).push(rec);
        }
        ctx.unobserved.delete(p);
      });
      return p;
    },
    $idiv(a: bigint, b: bigint) { if (b === 0n) throw new Panic("division by zero"); return w(a / b); },
    $div(a: any, b: any) {
      if (b === 0n || b === 0) throw new Panic("division by zero");
      return Number(a) / Number(b);
    },
    $imod(a: bigint, b: bigint) { if (b === 0n) throw new Panic("remainder by zero"); return a % b; },
    $ipow(a: bigint, b: bigint) {
      if (b < 0n) throw new Panic("negative exponent in Int `**` (use Float for fractional results)");
      let r = 1n, base = a, e = b;
      while (e > 0n) { if (e & 1n) r = w(r * base); e >>= 1n; if (e > 0n) base = w(base * base); }
      return r;
    },
    $shl(a: bigint, b: bigint) { if (b < 0n || b > 63n) throw new Panic(`shift amount ${b} is out of range 0..63`); return w(a << b); },
    $shr(a: bigint, b: bigint) { if (b < 0n) throw new Panic(`shift amount ${b} is negative`); return b > 63n ? (a < 0n ? -1n : 0n) : a >> b; },
    $neg: (x: any) => (typeof x === "bigint" ? w(-x) : typeof x === "number" ? -x : x.$op_sub()),
    $arith(op: string, a: any, b: any) {
      if (typeof a === "bigint" && typeof b === "bigint") {
        if (op === "/") return helpers.$div(a, b);
        switch (op) { case "+": return w(a + b); case "-": return w(a - b); case "*": return w(a * b); case "%": return helpers.$imod(a, b); }
      }
      if (typeof a === "bigint" && typeof b === "number") {
        const fa = Number(a);
        switch (op) { case "+": return fa + b; case "-": return fa - b; case "*": return fa * b; case "/": return helpers.$div(fa, b); case "%": return fa % b; case "**": return fa ** b; }
      }
      if (typeof a === "number" && typeof b === "bigint") {
        const fb = Number(b);
        switch (op) { case "+": return a + fb; case "-": return a - fb; case "*": return a * fb; case "/": return helpers.$div(a, fb); case "%": return a % fb; case "**": return a ** fb; }
      }
      if (typeof a === "number" && typeof b === "number") switch (op) { case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return a / b; case "%": return a % b; case "**": return a ** b; }
      if (typeof a === "string" && op === "+") return helpers.$sc(a, b);
      const names: Record<string, string> = { "+": "$op_add", "-": "$op_sub", "*": "$op_mul", "/": "$op_div", "%": "$op_mod" };
      if (a && typeof a[names[op]] === "function") return a[names[op]](b);
      throw new Panic(`operator ${op} is not defined for ${kindOf(a)}`);
    },
    $cmp(op: string, a: any, b: any) {
      const c = cmpPrim(a, b);
      switch (op) { case "<": return c < 0; case "<=": return c <= 0; case ">": return c > 0; default: return c >= 0; }
    },
    $sc(a: string, b: string) {
      if (a.length + b.length > L.maxStringLength) throw new Panic(`string length limit of ${L.maxStringLength} exceeded`, "limit", "memory");
      return a + b;
    },
    // Negative indexes count from the end (Python, Ruby): a[-1] is the last element.
    $ai(a: any[], i: bigint) { let n = Number(i); if (n < 0) n += a.length; if (!(n >= 0 && n < a.length)) panicIndex(i, a.length); return a[n]; },
    $as(a: any[], i: bigint, v: any) { let n = Number(i); if (n < 0) n += a.length; if (!(n >= 0 && n < a.length)) panicIndex(i, a.length); a[n] = v; },
    $mg(m: Map<any, any>, k: any) { const v = m.get(k); return v === undefined ? null : v; },
    $si(s: string, i: bigint) {
      let n = Number(i);
      if (!hasSurrogates(s)) { if (n < 0) n += s.length; if (!(n >= 0 && n < s.length)) panicIndex(i, s.length); return s[n]; }
      const cps = Array.from(s); if (n < 0) n += cps.length; if (!(n >= 0 && n < cps.length)) panicIndex(i, cps.length); return cps[n];
    },
    $slice(x: any, r: PlyRange) {
      const isStr = typeof x === "string";
      const arr: any[] | string = isStr && hasSurrogates(x) ? Array.from(x) : x;
      const len = arr.length;
      const lo = r.lo === null ? 0 : (Number(r.lo) < 0 ? Number(r.lo) + len : Number(r.lo));
      const hi = r.hi === null ? len : (Number(r.hi) < 0 ? Number(r.hi) + len : Number(r.hi)) + (r.inc ? 1 : 0);
      if (lo < 0 || hi > len || lo > hi) throw new Panic(`slice ${display(r)} is out of range for length ${len}`);
      const out = (arr as any).slice(lo, hi);
      return isStr && Array.isArray(out) ? out.join("") : out;
    },
    $prop(obj: any, name: string) {
      if (obj !== null && typeof obj === "object" && name in obj) return obj[name];
      const f = natives[`${kindOf(obj)}.get_${name.replace(/_$/, "")}`];
      if (f) return f(obj);
      throw new Panic(`${kindOf(obj)} has no property ${name}`);
    },
    $d(recv: any, name: string, ...args: any[]) {
      if (recv !== null && typeof recv === "object" && typeof recv[name] === "function") return recv[name](...args);
      const plain = name.replace(/_$/, "");
      const kind = kindOf(recv);
      const ext = extReg.get(kind)?.get(plain);
      if (ext) return ext(recv, ...args);
      const nat = natives[`${kind}.${plain}`];
      if (nat) return nat(recv, ...args);
      if (plain === "toString") return display(recv);
      throw new Panic(`${kind} has no method ${plain}`);
    },
    $extReg(kind: string, name: string, fn: Function) { if (!extReg.has(kind)) extReg.set(kind, new Map()); extReg.get(kind)!.set(name, fn); },
    $drop(p: any) { if (p instanceof Promise) Promise.prototype.then.call(p, undefined, (e: unknown) => { ctx.taskErrors.push(e); }); },
    $tests: ctx.tests,
    $M: ctx.M,
  };
  const rt: Runtime = { helpers, natives: {}, ctx, extReg };
  const natives = nativeFactory(rt);
  rt.natives = natives;
  helpers.$n = new Proxy(natives, {
    get(target: Record<string, Function>, prop: string) {
      if (prop in target) return target[prop];
      return (...args: any[]) => {
        throw new Panic(`native '${prop}' is not implemented by the host or runtime`);
      };
    },
  });
  return rt;
}

export { tupOf as makeTuple };
function tupOf(...a: any[]) { return Object.setPrototypeOf(a, TUP); }
export { cmpPrim, display as displayValue, TaskPromise };
