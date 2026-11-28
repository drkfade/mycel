import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { JavaBridge, installMaven, extractJavaBridge } from "../src/bridges/java";

const root = path.resolve(__dirname,"../../..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(),"mycel-java-"));
const dir = path.join(temp,".ply/java"); fs.mkdirSync(dir,{recursive:true});
execFileSync("javac",["-d",temp,path.join(root,"lang/bridges/java/fixtures/Fixture.java")]);
execFileSync("jar",["cf",path.join(dir,"fixture.jar"),"-C",temp,"Fixture.class","-C",temp,"Fixture$Listener.class"]);
const bridge = () => new JavaBridge({projectDir:temp,capabilities:{java:true},headless:true,timeoutMs:15000});

test("capability is denied before process starts", async()=>{ const b=new JavaBridge({projectDir:temp}); await assert.rejects(b.importClass("java.lang.String"),/capability denied.*java/); b.close(); });
test("operations, values, overloads, callbacks and errors",async()=>{ const b=bridge(); try {
 const f=await b.importClass("Fixture");
 assert.equal(await f.overload("x"),"string"); assert.equal(await f.join("a","b"),"a/b");
 for(const value of [null,true,"text",5n,9007199254740993n,1.25,[1n,"x"],{x:2n}]) assert.deepEqual(await f.echo(value),value);
 assert.deepEqual(await f.bytes(Uint8Array.from([0,1,255])),Uint8Array.from([0,1,255]));
 assert.equal(await f.$get("text"),"initial"); await f.$set("text","updated"); assert.equal(await f.$get("text"),"updated");
 assert.equal(await f.apply((x:string)=>x+"!"),"hello!"); let event=""; await f.listen((x:string)=>{event=x}); assert.equal(event,"event");
 await assert.rejects(f.fail(),/java.lang.IllegalStateException: fixture failure.*Fixture.fail/);
 const list=await (await b.importClass("java.util.ArrayList"))(); await list.add("x"); await list.add("y"); assert.deepEqual(await list.$iter(3),["x","y"]); await list.$release(); await assert.rejects(list.size(),/released handle/);
 const local=await b.importClass("java.time.LocalDate"); const date=await local.of(2024n,1n,2n); assert.equal(await date.toString(),"2024-01-02");
 const t=process.hrtime.bigint(); for(let i=0;i<50;i++)await date.isLeapYear(); console.log(`java bridge overhead: ${Number(process.hrtime.bigint()-t)/50/1000} µs/call`);
 } finally {b.close();} });
test("crash fails pending calls",async()=>{const b=new JavaBridge({projectDir:temp,capabilities:{java:true},java:"/no/such/java",timeoutMs:1000}); await assert.rejects(b.importClass("x"),/Java bridge (failed to start|exited)/); b.close();});
test("Maven fixture and transitive dependency",async()=>{const repo=path.join(temp,"repo"); function artifact(g:string,a:string,v:string,deps=""){const d=path.join(repo,g.replace(/\./g,"/"),a,v);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,`${a}-${v}.pom`),`<project><dependencies>${deps}</dependencies></project>`);fs.writeFileSync(path.join(d,`${a}-${v}.jar`),a);}
 artifact("org.test","dep","1"); artifact("org.test","app","1",'<dependency><groupId>org.test</groupId><artifactId>dep</artifactId><version>1</version></dependency>'); const entries=await installMaven("org.test:app:1",temp,repo);assert.equal(entries.length,2);assert.match(entries[0].sha256,/^[a-f0-9]{64}$/);});
test("extractJavaBridge caches Bridge.java and Bridge.class under MYCEL_HOME", async () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "mycel-java-cache-"));
  const prevHome = process.env.MYCEL_HOME;
  process.env.MYCEL_HOME = fakeHome;
  try {
    const text = fs.readFileSync(path.join(root, "lang/bridges/java/Bridge.java"), "utf8");
    const first = extractJavaBridge(text);
    assert.ok(first.classpath.length === 1 || fs.existsSync(first.target));
    const cacheRoot = path.join(fakeHome, "cache", "bridges");
    const dirs = fs.readdirSync(cacheRoot);
    assert.equal(dirs.length, 1);
    const cacheDir = path.join(cacheRoot, dirs[0]);
    assert.equal(fs.readFileSync(path.join(cacheDir, "Bridge.java"), "utf8"), text);
    const second = extractJavaBridge(text);
    assert.deepEqual(second, first);
    if (first.classpath.length === 1) {
      assert.equal(first.target, "Bridge");
      assert.ok(fs.existsSync(path.join(cacheDir, "Bridge.class")));
    }
  } finally {
    if (prevHome === undefined) delete process.env.MYCEL_HOME;
    else process.env.MYCEL_HOME = prevHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});
