"use strict";
// Run: node lang/packages/tensor/bench/matmul.cjs [size]
const core = require("../native/core.cjs");
const n = Number(process.argv[2] || 256);
const rng = new core.Rng(1);
const a = core.randn(rng, [n, n]), b = core.randn(rng, [n, n]);
for (let i = 0; i < 5; i++) core.matmul(a, b); // warm up
const runs = 30, times = [];
for (let i = 0; i < runs; i++) { const t0 = process.hrtime.bigint(); core.matmul(a, b); times.push(Number(process.hrtime.bigint() - t0) / 1e6); }
times.sort((x, y) => x - y);
const med = times[Math.floor(runs / 2)], best = times[0];
const flops = 2 * n ** 3;
console.log(`matmul ${n}x${n} @ ${n}x${n} (float64): median ${med.toFixed(2)} ms, best ${best.toFixed(2)} ms, ${(flops / (med * 1e6)).toFixed(2)} GFLOPS (median)`);
