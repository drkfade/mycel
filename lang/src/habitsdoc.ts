import { HABITS, LANGS } from "./habits";

/** `mycel help habits` and docs/HABITS.md come from the same table that the tests run (src/habits.ts). */
export function habitsMarkdown(): string {
  const out = ["# Habits from other languages", "", "Generated from `lang/src/habits.ts` (`mycel help habits` prints it). Every row is tested: an",
    "accepted habit compiles; any other habit is a compile error whose message names the language it came from and the",
    "Mycel spelling.", ""];
  for (const l of LANGS) {
    out.push(`## Coming from ${l}`, "", "| you write | in Mycel |", "|---|---|");
    for (const h of HABITS.filter((x) => x.lang === l)) out.push(`| \`${h.habit.replace(/\|/g, "\\|")}\` | ${h.ok ? "works: " : ""}${h.mycel.replace(/\|/g, "\\|")} |`);
    out.push("");
  }
  return out.join("\n");
}
export const HABITS_HELP = HABITS ? habitsMarkdown().replace(/^\| you write.*\n\|---\|---\|\n/gm, "").replace(/^\| `(.*?)` \| (.*) \|$/gm, (_, a, b) => `  ${a.replace(/\\\|/g, "|").padEnd(34)} ${b.replace(/\\\|/g, "|")}`) : "";
