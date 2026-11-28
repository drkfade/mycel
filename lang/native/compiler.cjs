'use strict';
// Experimental native lowering. Keep this outside src while the compiler is owned elsewhere.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const {compileProgram, makeResolver, renderDiagnostics} = require('../dist/src/modules.js');
const {prune} = require('../dist/src/types.js');
const unsupported = (n, why) => { const p=n?.span?.src?.pos(n.span.start); throw new Error(`${p ? `${n.span.src.name}:${p.line}:${p.col}: ` : ''}${why} is not supported by --native yet`); };
const ty = (t, node) => { if (!t) unsupported(node, 'unresolved type'); t=prune(t); if(t.k==='prim' && ['Int','Bool','Void'].includes(t.name)) return t.name; unsupported(node, `type ${t.name || t.k}`); };
const id = s => 'm_'+Buffer.from(s,'utf8').toString('hex');
const ct = t => ({Int:'int64_t', Bool:'bool', Void:'void'})[t];

// Explicit typed IR: do not pass unvalidated AST nodes to the C emitter.
function lower(program, entry) {
 const mods=program.modules.filter(m=>!m.isStd);
 if(mods.length!==1 || mods[0].name!==entry) unsupported(null,'imports');
 const m=mods[0];
 const functions=[];
 for(const d of m.ast.decls) {
  if(d.k!=='fn') unsupported(d,`declaration ${d.k}`);
  const f=d.fn, infos=m.fns.get(f.name)||[];
  if(infos.length!==1 || f.typeParams.length || f.async || f.gen || !f.body || f.body.k!=='block') unsupported(d,`function ${f.name}`);
  const info=infos[0];
  if(f.params.some(p=>p.default || p.variadic || p.pat)) unsupported(d,'default, variadic or destructured parameters');
  functions.push({name:f.name, params:info.params.map(p=>({name:p.name,type:ty(p.ty,d)})), ret:ty(info.ret,d), body:f.body, node:d});
 }
 const names=new Set(functions.map(f=>f.name));
 let currentFunction = '';
 const expr=e=>{
  const type=ty(e.ty,e);
  switch(e.k) {
   case 'int': if(e.value > 9223372036854775807n || e.value < 0n) unsupported(e,'integer literal outside signed 64-bit'); return {k:'int',type,value:e.value.toString()};
   case 'bool': return {k:'bool',type,value:e.value};
   case 'id': if(e.sym?.k!=='local') unsupported(e,'non-local value'); return {k:'id',type,name:e.name};
   case 'unary': if(!['-','!','not'].includes(e.op)) unsupported(e,`unary ${e.op}`); return {k:'unary',type,op:e.op,x:expr(e.operand)};
   case 'binary': if(!['+','-','*','/','%','<','<=','>','>=','==','!=','and','or','&&','||'].includes(e.op)) unsupported(e,`operator ${e.op}`); return {k:'binary',type,op:e.op,a:expr(e.left),b:expr(e.right)};
   case 'call': {
    if(e.callee.k!=='id' || e.args.some(a=>a.name)) unsupported(e,'indirect or named call');
    const name=e.callee.name;
    if(name==='print' && e.call?.fn?.module?.name==='prelude' && e.call?.fn?.native==='print') { if(currentFunction!=='main') unsupported(e,'print outside main'); if(e.args.length!==1) unsupported(e,'print with multiple arguments'); return {k:'print',type,arg:expr(e.args[0].value)}; }
    if(name==='main' || !names.has(name) || e.call?.fn?.module!==m || e.args.length!==e.call.fn.params.length) unsupported(e,`call ${name}`);
    return {k:'call',type,name,args:e.args.map(a=>expr(a.value))};
   }
   default: unsupported(e,`expression ${e.k}`);
  }
 };
 const block=b=>b.stmts.map(stmt);
 const stmt=s=>{switch(s.k){
  case 'let': if(s.pat.k!=='bind'||s.pat.sub||!s.init) unsupported(s,'binding'); return {k:'let',name:s.pat.name,type:ty(s.pat.ty,s),value:expr(s.init)};
  case 'expr': return {k:'expr',value:expr(s.expr)};
  case 'return': return {k:'return',value:s.value?expr(s.value):null};
  case 'if': if(s.cond.pat || (s.else && s.else.k!=='block')) unsupported(s,'conditional pattern or else-if'); return {k:'if',cond:expr(s.cond.expr),yes:block(s.then),no:s.else?block(s.else):[]};
  case 'while': if(s.cond.pat || s.label) unsupported(s,'labelled or pattern loop'); return {k:'while',cond:expr(s.cond.expr),body:block(s.body)};
  case 'break': case 'continue': if(s.label) unsupported(s,'label'); return {k:s.k};
  case 'block': return {k:'block',body:block(s)};
  default: unsupported(s,`statement ${s.k}`);
 }};
 for(const f of functions) { currentFunction=f.name; f.body=block(f.body); }
 const main=functions.find(f=>f.name==='main'); if(!main||main.params.length||main.ret!=='Void') unsupported(main?.node,'main signature');
 return {functions};
}
function emit(ir) {
 const ex=e=>{switch(e.k){
 case 'int': return `INT64_C(${e.value})`; case 'bool': return e.value?'true':'false'; case 'id': return id(e.name);
 case 'unary': return e.op==='-'?`mx_neg(${ex(e.x)})`:`(!${ex(e.x)})`;
 case 'binary': {const a=ex(e.a),b=ex(e.b),op=e.op; if(['+','-','*','/','%'].includes(op)) return `mx_${({'+':'add','-':'sub','*':'mul','/':'div','%':'mod'})[op]}(${a},${b})`; return `(${a} ${{and:'&&',or:'||'}[op]||op} ${b})`;}
 case 'call': return `${id(e.name)}(${e.args.map(ex).join(',')})`;
 case 'print': return e.arg.type==='Int'?`mx_print_int(${ex(e.arg)})`:`mx_print_bool(${ex(e.arg)})`;
 }};
 const block=xs=>`{\n${xs.map(st).join('\n')}\n}`;
 const st=s=>{switch(s.k){case 'let': return `${ct(s.type)} ${id(s.name)} = ${ex(s.value)};`; case 'expr':return `${ex(s.value)};`; case 'return':return `return${s.value?' '+ex(s.value):''};`; case 'if':return `if (${ex(s.cond)}) ${block(s.yes)} else ${block(s.no)}`;case 'while':return `while (${ex(s.cond)}) ${block(s.body)}`;case 'break':case 'continue':return `${s.k};`;case 'block':return block(s.body);}};
 const sig=f=>`${ct(f.ret)} ${id(f.name)}(${f.params.map(p=>`${ct(p.type)} ${id(p.name)}`).join(', ')||'void'})`;
 return `#include "runtime.h"\n${ir.functions.map(f=>sig(f)+';').join('\n')}\n${ir.functions.map(f=>sig(f)+' '+block(f.body)).join('\n')}\nint main(void) { ${id('main')}(); return 0; }\n`;
}
function build(file,out) {
 file=path.resolve(file); out=path.resolve(out);
 const program=compileProgram({entry:{name:'main',file,text:fs.readFileSync(file,'utf8')},resolve:makeResolver({roots:[path.dirname(file)]})});
 if(!program.ok) throw new Error(renderDiagnostics(program.diagnostics));
 const c=emit(lower(program,'main'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mycel-native-'));
 try { const source=path.join(dir,'program.c');fs.writeFileSync(source,c); const r=cp.spawnSync('clang',['-std=c99','-O2','-I',path.join(__dirname,'runtime'),source,path.join(__dirname,'runtime','runtime.c'),'-o',out],{encoding:'utf8'}); if(r.error) throw r.error; if(r.status!==0) throw new Error(`C compiler failed:\n${r.stderr}`); } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
module.exports={build,lower,emit};
if(require.main===module) {try { if(process.argv.length!==4) throw new Error('usage: node lang/native/compiler.cjs file.myc output'); build(process.argv[2],process.argv[3]); } catch(e) {console.error(e.message);process.exitCode=1;} }
