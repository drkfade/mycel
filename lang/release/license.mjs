// The shipped LICENSE.txt (pkg licence pane, /usr/local/share/mycel, Windows ZIP) is assembled from
// lang/LICENSE + LICENSE-MIT + LICENSE-APACHE + TRADEMARK.md so the packages can never drift from the
// repo's licence files or carry the retired proprietary EULA again.
//   node license.mjs          check release/LICENSE.txt (exit 1 if stale)
//   node license.mjs --write  regenerate it
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lang = path.dirname(here);
const target = path.join(here, 'LICENSE.txt');
const parts = ['LICENSE', 'NOTICE', 'LICENSE-MIT', 'LICENSE-APACHE', 'TRADEMARK.md'];
// Words only the old EULA used; their presence means a proprietary text came back.
const RETIRED = [/\bDRAFT\b/, /proprietary/i, /All rights reserved\.\s*$/m, /End-User License/i];

export function releaseLicense() {
  const rule = '='.repeat(78);
  return parts.map((name, i) => {
    const text = fs.readFileSync(path.join(lang, name), 'utf8').replace(/\s+$/, '') + '\n';
    return i === 0 ? text : `\n${rule}\n${name}\n${rule}\n\n${text}`;
  }).join('');
}

export function checkReleaseLicense() {
  const shipped = fs.readFileSync(target, 'utf8');
  if (shipped !== releaseLicense()) throw new Error('release/LICENSE.txt is stale: run node release/license.mjs --write');
  for (const pattern of RETIRED) if (pattern.test(shipped)) throw new Error(`release/LICENSE.txt contains retired EULA wording ${pattern}`);
  return shipped;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--write') fs.writeFileSync(target, releaseLicense());
  checkReleaseLicense();
  console.log('PASS release/LICENSE.txt = LICENSE + NOTICE + LICENSE-MIT + LICENSE-APACHE + TRADEMARK.md');
}
