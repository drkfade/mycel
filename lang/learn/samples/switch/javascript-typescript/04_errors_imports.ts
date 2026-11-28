// Nullish coalescing, parsing, and JSON in TypeScript
function parsePort(raw: string): number {
  const p = Number(raw);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) {
    throw new Error(`bad port: ${raw}`);
  }
  return p;
}

const fallback: number | null = null;
console.log(fallback ?? 8080);
console.log(parsePort("3000"));
try {
  console.log(parsePort("nope"));
} catch (err) {
  console.log("err:", (err as Error).message);
}

const v = { ok: true, status: 200 };
console.log(JSON.stringify(v), [2, 4, 6].reduce((a, b) => a + b, 0));
