import * as fs from "node:fs";
import * as path from "node:path";

/** Both arguments have already been resolved through realpath by the caller. */
export function withinPath(root: string, file: string, paths: typeof path = path): boolean {
  const relative = paths.relative(root, file);
  return relative === "" || (!paths.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + paths.sep));
}

/** Windows namespaces, alternate streams and DOS devices are not ordinary files. */
export function ordinaryWindowsPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  if (normalized.startsWith("//?/") || normalized.startsWith("//./")) return false;
  const rest = normalized.replace(/^[a-z]:/i, "");
  return !rest.includes(":") && !rest.split("/").some(p => /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)([ .]|$)/i.test(p) || (p !== "." && p !== ".." && /[ .]$/.test(p)));
}

export const portablePath = (file: string, paths: typeof path = path): string => file.split(paths.sep).join("/");

/** require() accepts an absolute path when a runtime lives on another drive. */
export function runtimeSpecifier(from: string, runtime: string, paths: typeof path = path): string {
  const relative = paths.relative(from, runtime);
  if (paths.isAbsolute(relative)) return portablePath(runtime, paths);
  const specifier = portablePath(relative, paths);
  return specifier.startsWith(".") ? specifier : "./" + specifier;
}

/**
 * Recursive delete through libuv's unlink/rmdir. Node 23+ moved fs.rmSync to C++ (std::filesystem), which on
 * Windows silently skips paths with non-ASCII characters (nodejs/node#56049): the first real-Windows run left
 * tour/07_files' file in place under a "mycel corpus Ω" directory and std.fs.remove still returned Ok.
 * Symbolic links and junctions are removed, never followed. A missing path throws ENOENT unless `force`.
 */
export function removeTree(target: string, force = false): void {
  let st: fs.Stats;
  try { st = fs.lstatSync(target); }
  catch (e: any) { if (force && e?.code === "ENOENT") return; throw e; }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(target)) removeTree(path.join(target, name));
    fs.rmdirSync(target);
  } else fs.unlinkSync(target);
}
