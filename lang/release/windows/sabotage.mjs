// Mutation receipts only. Never changes source, assertions, fixtures or expected outputs.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.resolve(here, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mycel-portability-sabotage-'));
const mutations = [
  ['case-sensitive grants', 'dist/src/paths.js', 'return relative === "" || (!paths.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + paths.sep));', 'return file === root || file.startsWith(root + paths.sep);', 'Windows capability boundaries'],
  ['CRLF normalization', 'dist/src/fmt.js', 'new diag_1.Source(name, text)', 'new diag_1.Source(name, text.replace(/\\r\\n/g, "\\n"))', 'CRLF formatting'],
  ['platform-specific package hash', 'dist/src/project.js', '(0, paths_1.portablePath)(f) + "\\0"', 'f + "\\0"', 'Windows package integrity'],
  ['dangling-link fallback', 'dist/src/stdlib.js', 'throw e;\n        }\n    }\n}', 'const parent = nodePath.dirname(cur); rest.push(nodePath.basename(cur)); cur = parent;\n        }\n    }\n}', 'realpath rejects'],
  ['shell-enabled spawn', 'dist/src/stdlib.js', 'shell: false', 'shell: true', 'Windows native grants'],
  ['slash-only basename', 'dist/src/stdlib.js', 'nodePath.basename(p)', 'p.split("/").pop()', 'Windows native grants'],
  ['Windows batch shell fallback', 'dist/src/stdlib.js', 'if (process.platform === "win32" && /\\.(cmd|bat)$/i.test(command))', 'if (false)', 'Windows native grants'],
  // Windows only: fs.rmSync handles non-ASCII paths on macOS/Linux, so this mutation is only observable on Windows.
  ['C++ fs.rmSync for std.fs.remove', 'dist/src/paths.js', 'function removeTree(target, force = false) {', 'function removeTree(target, force = false) { return fs.rmSync(target, { recursive: true, force });', 'non-ASCII path', 'win32'],
];
const receipts = [];
try {
  for (const name of ['dist/src', 'std', 'bin']) fs.cpSync(path.join(lang, name), path.join(root, name), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist/tests'), { recursive: true });
  for (const name of ['windows.test.js', 'helpers.js']) fs.copyFileSync(path.join(lang, 'dist/tests', name), path.join(root, 'dist/tests', name));
  const execute = pattern => spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...(pattern ? ['--test-name-pattern', pattern] : []), path.join(root, 'dist/tests/windows.test.js')], { encoding: 'utf8', timeout: 30000 });
  const baseline = execute(); assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, file, before, after, pattern, only] of mutations) {
    if (only && only !== process.platform) { console.log(`SKIP (${only} only): ${label}`); continue; }
    const target = path.join(root, file), original = fs.readFileSync(target, 'utf8');
    assert.ok(original.includes(before), 'Mutation location missing: ' + label);
    fs.writeFileSync(target, original.replace(before, after));
    try {
      const result = execute(pattern);
      receipts.push({ label, status: result.status, stdout: result.stdout, stderr: result.stderr });
      assert.equal(result.error, undefined, label);
      assert.notEqual(result.status, 0, 'Mutation survived: ' + label);
      console.log('CAUGHT: ' + label);
    } finally { fs.writeFileSync(target, original); }
  }
  const restored = execute(); assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  const ran = mutations.filter(m => !m[5] || m[5] === process.platform).length;
  console.log(`${ran}/${ran} copied product mutations caught on ${process.platform}; restored suite passes.`);
} finally {
  fs.writeFileSync(path.join(here, '../work/windows/sabotage-receipt.json'), JSON.stringify(receipts, null, 2) + '\n');
  fs.rmSync(root, { recursive: true, force: true });
}
