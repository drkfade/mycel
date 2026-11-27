/** Mycel source files: `.myc` is primary, `.olx` stays accepted forever (both work everywhere, no warning). */
export const EXTS = [".myc", ".olx"] as const;
export const isSrc = (f: string): boolean => EXTS.some((e) => f.endsWith(e));
export const stripExt = (f: string): string => { for (const e of EXTS) if (f.endsWith(e)) return f.slice(0, -e.length); return f; };
/** The first existing file for `base` + each extension (project .myc wins over .olx when both exist). */
export const withExt = (base: string, exists: (f: string) => boolean): string | undefined => { for (const e of EXTS) if (exists(base + e)) return base + e; return undefined; };
