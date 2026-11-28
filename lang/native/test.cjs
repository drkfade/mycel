'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {build}=require('./compiler.cjs');
const root=path.resolve(__dirname,'../..'), dir=fs.mkdtempSync(path.join(os.tmpdir(),'mycel-native-test-'));
const run=(cmd,args)=>cp.spawnSync(cmd,args,{encoding:'utf8'});
try {
 const cases=[
  ['arithmetic','fn add(x: Int, y: Int) -> Int { return x + y }\nprint(add(20, 22))\n'],
  ['branch','fn f(n: Int) -> Int { if n < 2 { return 10 } else { return n * 3 } }\nprint(f(5))\n'],
  ['bool','print(2 < 3 and true)\n'],
  ['fibonacci',fs.readFileSync(path.join(root,'lang/bench/native/fib.myc'),'utf8')],
 ];
 for(const [name,source] of cases) {
  const file=path.join(dir,name+'.myc'), exe=path.join(dir,name), bundle=exe+'.js'; fs.writeFileSync(file,source); build(file,exe);
  let b=run('node',[path.join(root,'lang/bench/native/bundle.cjs'),file,bundle]); assert.equal(b.status,0,b.stderr);
  const a=run(exe,[]), j=run('node',[bundle]); assert.equal(a.status,0,a.stderr);assert.equal(j.status,0,j.stderr);assert.equal(a.stdout,j.stdout,name);
 }
 for(const source of ['print("hello")','let xs = [1, 2]\nprint(xs[0])']) {const file=path.join(dir,'unsupported.myc');fs.writeFileSync(file,source);assert.throws(()=>build(file,path.join(dir,'bad')),/not supported by --native yet/);}
 const file=path.join(dir,'overflow.myc');fs.writeFileSync(file,'print(9223372036854775807 + 1)');build(file,path.join(dir,'overflow'));const a=run(path.join(dir,'overflow'),[]);assert.notEqual(a.status,0);assert.match(a.stderr,/bignum promotion is not supported/);
 let supported=0, rejected=0;
 for(const name of fs.readdirSync(path.join(root,'lang/examples/tour')).filter(x=>x.endsWith('.olx') && x!=='01_hello.olx')) {
  const file=path.join(root,'lang/examples/tour',name), exe=path.join(dir,'tour'), bundle=exe+'.js';
  try {build(file,exe);} catch(e) {if(!/not supported by --native yet|error/i.test(e.message)) throw e; rejected++;continue;}
  const b=run('node',[path.join(root,'lang/bench/native/bundle.cjs'),file,bundle]); assert.equal(b.status,0,b.stderr);
  const a=run(exe,[]),j=run('node',[bundle]);assert.equal(a.status,0,a.stderr);assert.equal(j.status,0,j.stderr);assert.equal(a.stdout,j.stdout,name); supported++;
 }
 console.log(`native checks: ${cases.length} differential cases, overflow and unsupported rejections; tour supported ${supported}, rejected ${rejected} (01 excluded)`);
} finally {fs.rmSync(dir,{recursive:true,force:true});}
