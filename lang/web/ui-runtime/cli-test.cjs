const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
(async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycel-web-cli-'));
 fs.writeFileSync(path.join(dir, 'main.myc'), 'import ui\nui.window("Hi", [ui.text("Hello")])');
 const child = spawn(process.execPath, [path.resolve('lang/bin/mycel'), 'web', path.join(dir, 'main.myc')], { stdio: ['ignore', 'pipe', 'pipe'] });
 try {
  const url = await new Promise((resolve, reject) => {
   let output = ''; const timer = setTimeout(() => reject(Error('server did not start: ' + output)), 5000);
   child.stdout.on('data', chunk => { output += chunk; const m = output.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(timer); resolve(m[0]); } });
   child.stderr.on('data', chunk => { output += chunk; });
   child.on('exit', code => { clearTimeout(timer); reject(Error('server exited ' + code + ': ' + output)); });
  });
  assert.equal((await fetch(url)).status, 200);
  assert.match((await (await fetch(url+'project')).json()).code, /ui\.window/);
  console.log('mycel web CLI starts on loopback without opening a browser');
 } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } fs.rmSync(dir, {recursive:true, force:true}); }
})().catch(e => { console.error(e); process.exitCode = 1; });
