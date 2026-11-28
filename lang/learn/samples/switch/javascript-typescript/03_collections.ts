// Arrays, Maps, filter/map/reduce, and regex in TypeScript
const nums: number[] = [2, 6, 3, 9, 4, 8];
const big = nums.filter(x => x > 5);
const doubled = big.map(x => x * 2);
const total = big.reduce((a, b) => a + b, 0);
console.log(`big=${JSON.stringify(big)}, doubled=${JSON.stringify(doubled)}, total=${total}`);

const scores = new Map<string, number>([["ana", 91], ["bo", 78]]);
for (const [k, v] of scores) {
  console.log(`${k}: ${v}`);
}
console.log(scores.get("zoe") ?? 0, scores.has("ana"));

const text = "id=42 port=8080 retry=2";
const found = (text.match(/\d+/g) ?? []).map(Number).filter(n => n > 5);
console.log(found);
