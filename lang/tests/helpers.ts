import { run, check, RunOptions, RunResult } from "../src/host";

export async function exec(source: string, opts: Partial<RunOptions> = {}): Promise<RunResult> {
  return run({ source, file: "test.olx", ...opts });
}
/** Output of a program that must succeed, trailing newline trimmed. */
export async function out(source: string, opts: Partial<RunOptions> = {}): Promise<string> {
  const r = await exec(source, opts);
  if (!r.ok) throw new Error("program failed:\n" + (r.error?.human ?? JSON.stringify(r)));
  return r.output.replace(/\n$/, "");
}
/** every diagnostic (errors and warnings) */
export function diags(source: string, opts: Partial<RunOptions> = {}) {
  return check({ source, file: "test.olx", ...opts }).diagnostics;
}
export function errors(source: string, opts: Partial<RunOptions> = {}) {
  const c = check({ source, file: "test.olx", ...opts });
  return c.diagnostics.filter((d) => d.severity === "error");
}

/** Windows cannot exec a Unix shebang directly; exercise the same Node source launcher. */
export function spawnCli(file: string, args: string[], options: import("node:child_process").SpawnSyncOptionsWithStringEncoding) {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  return process.platform === "win32" ? spawnSync(process.execPath, [file, ...args], options) : spawnSync(file, args, options);
}
