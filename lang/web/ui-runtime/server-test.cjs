const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const status = (url, headers) => new Promise((resolve, reject) => http.get(url, {headers}, r => { r.resume(); resolve(r.statusCode); }).on('error', reject));
const { serveUi } = require('../../dist/src/ui/server');
(async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mycel-ui-'));
 fs.writeFileSync(path.join(dir,'main.myc'),'import words\nprint(words.message())');
 fs.writeFileSync(path.join(dir,'words.myc'),'pub fn message() -> String { return "hello" }');
 const server=await serveUi(dir+'/main.myc');
 try {
  const address=server.address(); assert.equal(address.address,'127.0.0.1');
  const url=`http://127.0.0.1:${address.port}`;
  let response=await fetch(url+'/project'); assert.equal(response.status,200);
  const source=await response.json(); assert.match(source.files.words,/hello/);
  const context=vm.createContext({console,setTimeout,clearTimeout,queueMicrotask,crypto:globalThis.crypto,TextEncoder,TextDecoder}); context.self=context;
  vm.runInContext(await (await fetch(url+'/mycel.js')).text(),context);
  let result=await context.Mycel.runSource(source.code,{files:source.files}); assert.equal(result.output,'hello\n');
  fs.writeFileSync(path.join(dir,'words.myc'),'pub fn message() -> String { return "changed" }');
  response=await fetch(url+'/project'); const changed=await response.json();
  result=await context.Mycel.runSource(changed.code,{files:changed.files}); assert.equal(result.output,'changed\n');
  fs.writeFileSync(path.join(dir,'words.myc'),'pub fn message( {');
  const bad=await (await fetch(url+'/project')).json(); result=await context.Mycel.runSource(bad.code,{files:bad.files}); assert.equal(result.ok,false); assert.ok(result.diagnosticsText);
  assert.equal(await status(url+'/project',{host:'attacker.example'}),403);
  assert.equal(await status(url+'/project',{'sec-fetch-site':'cross-site'}),403);
  console.log('loopback server, reload sources, diagnostics and host checks passed');
 } finally { await new Promise(resolve=>server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1});
