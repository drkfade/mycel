'use strict';
const fs=require('node:fs'),path=require('node:path');
const {compile,toBundle}=require('../../dist/src/host.js');
const file=path.resolve(process.argv[2]);
const c=compile({source:fs.readFileSync(file,'utf8'),file,roots:[path.dirname(file)]});
if(!c.code) { console.error('JS compilation failed');process.exit(1); }
fs.writeFileSync(process.argv[3],`require(${JSON.stringify(require.resolve('../../dist/src/host.js'))}).runBundle(${JSON.stringify(toBundle(c))}, []);\n`);
