/**
 * `ply install --<lang> <package>`: the ONE install syntax (WO111 item 9). The flag names a runtime by the language's
 * full name, its file extension or its package manager — exact CLI flags, no guessing. Mycel's own packages take no flag.
 */
import { closest } from "./diag";
import { PlyError } from "./project";

export type Runtime = "python" | "javascript" | "typescript" | "java" | "rust" | "go" | "swift";
export const RUNTIMES: { runtime: Runtime; label: string; flags: string[]; pkg: string }[] = [
  { runtime: "python", label: "Python", flags: ["python", "py", "pip"], pkg: "requests  requests@2.32.3  requests==2.32.3" },
  { runtime: "javascript", label: "JavaScript", flags: ["javascript", "js", "npm"], pkg: "lodash  lodash@4.17.21" },
  { runtime: "typescript", label: "TypeScript", flags: ["typescript", "ts"], pkg: "zod  (also installs @types/* when the package ships no .d.ts)" },
  { runtime: "java", label: "Java", flags: ["java", "maven", "mvn"], pkg: "com.google.code.gson:gson  ...:gson:2.11.0  ...:gson@2.11.0" },
  { runtime: "rust", label: "Rust", flags: ["rust", "rs", "cargo"], pkg: "serde_json  serde_json@1.0.128" },
  { runtime: "go", label: "Go", flags: ["go", "golang"], pkg: "github.com/google/uuid  ...uuid@1.6.0" },
  { runtime: "swift", label: "Swift", flags: ["swift"], pkg: "https://github.com/apple/swift-collections  ...@1.1.4" },
];
const BY_FLAG = new Map<string, Runtime>(RUNTIMES.flatMap((r) => r.flags.map((f) => [f, r.runtime] as [string, Runtime])));
const ALL_FLAGS = RUNTIMES.flatMap((r) => r.flags.map((f) => "--" + f));
/** Options the package commands accept besides a runtime flag. */
const OPTIONS = new Set(["json", "offline"]);
/** Flags people try for Mycel's own packages: there is none, a native package takes no flag. */
const NATIVE_TRIES = new Set(["mycel", "myc", "ply", "olx", "native"]);

export const INSTALL_HELP = `ply install — add packages to this project (ply.json + ply.lock)

  ply install <package>                 a Mycel package (no flag)
  ply install --<lang> <package> [...]  a package from another language (flag BEFORE the package)
  ply install                           everything in ply.json / ply.lock

  runtime      flags                        package examples
${RUNTIMES.map((r) => `  ${r.label.padEnd(12)} ${r.flags.map((f) => "--" + f).join(" ").padEnd(28)} ${r.pkg}`).join("\n")}

  --npm means JavaScript (npm is shared by JS and TS; use --ts for the typed install).
  Versions: pkg@1.2.3 works for every runtime; the native forms requests==2.32.3 and group:artifact:2.11.0 too.
  No version = the latest, written exactly into ply.json + ply.lock.
  remove, update and why take the same flags:  ply remove --pip requests
`;

export interface PkgRequest { runtime?: Runtime; flag?: string; packages: { spec: string; name: string; version?: string }[] }

/** Split `name@1.2`, `name==1.2` (pip), `group:artifact:1.2` (Maven) into name + version. */
export function splitVersion(spec: string, runtime?: Runtime): { name: string; version?: string } {
  const eq = spec.indexOf("==");
  if (runtime === "python" && eq > 0) return { name: spec.slice(0, eq), version: spec.slice(eq + 2) };
  const at = spec.lastIndexOf("@");
  if (at > 0) return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  if (runtime === "java") { const p = spec.split(":"); if (p.length === 3) return { name: p.slice(0, 2).join(":"), version: p[2] }; }
  return { name: spec };
}

/**
 * Parse the arguments after `ply install|remove|update|why` in their original order (the flag must come first, and
 * order is lost once flags are collected into a map). Throws a PlyError that says exactly what to type.
 */
export function parsePkgArgs(cmd: string, args: string[]): PkgRequest {
  let runtime: Runtime | undefined, flag: string | undefined;
  const packages: PkgRequest["packages"] = [];
  for (const a of args) {
    if (a === "--") break;
    if (a.startsWith("--")) {
      const f = a.slice(2).split("=")[0];
      if (OPTIONS.has(f)) continue;
      const rt = BY_FLAG.get(f);
      if (!rt) {
        if (NATIVE_TRIES.has(f)) throw new PlyError(`\`--${f}\`: Mycel packages take no flag — write \`ply ${cmd} <package>\``);
        const near = closest(f, [...BY_FLAG.keys()]);
        throw new PlyError(`unknown flag \`--${f}\`${near ? ` — did you mean \`--${near}\`?` : ""}\n  accepted: ${ALL_FLAGS.join(" ")}\n  (a Mycel package takes no flag; see \`ply help install\`)`);
      }
      if (packages.length) throw new PlyError(`put the flag before the package: \`ply ${cmd} --${f} ${packages.map((p) => p.spec).join(" ")}\``);
      if (runtime && runtime !== rt) throw new PlyError(`one runtime per command: \`--${flag}\` and \`--${f}\` name different languages — run \`ply ${cmd}\` once per language`);
      runtime = rt; flag = f;
      continue;
    }
    if (a.startsWith("-") && a.length > 1) throw new PlyError(`unknown option \`${a}\` — runtime flags use two dashes, e.g. \`--py\` (see \`ply help install\`)`);
    packages.push({ spec: a, ...splitVersion(a, runtime) });
  }
  if (runtime && !packages.length && cmd !== "install") throw new PlyError(`\`ply ${cmd} --${flag}\` needs a package name`);
  if (runtime && !packages.length) throw new PlyError(`\`ply install --${flag}\` needs a package name: e.g. \`ply install --${flag} ${RUNTIMES.find((r) => r.runtime === runtime)!.pkg.split(/\s+/)[0]}\``);
  return { runtime, flag, packages };
}

export const runtimeLabel = (r: Runtime) => RUNTIMES.find((x) => x.runtime === r)!.label;
/** Appended when a flag-less package is not a Mycel package: list the flags, never guess the runtime. */
export const FOREIGN_HINT = `if it is a package from another language, add its flag: ${RUNTIMES.map((r) => `--${r.flags.reduce((a, b) => (b.length < a.length ? b : a))} (${r.label})`).join(", ")} — see \`ply help install\``;
