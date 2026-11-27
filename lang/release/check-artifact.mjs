// Scan bytes, not strings(1) output: this also catches paths inside the embedded SEA script.
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export function checkArtifact(file) {
  const bytes = fs.readFileSync(file);
  for (const forbidden of ['/Users/', 'olxcore', 'codecli', '~/.olx']) {
    if (bytes.includes(Buffer.from(forbidden))) throw new Error(`${file}: forbidden artifact content ${JSON.stringify(forbidden)}`);
  }
  console.log(`clean: ${file}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) for (const file of process.argv.slice(2)) checkArtifact(file);
