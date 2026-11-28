import { Worker, MessageChannel, MessagePort, receiveMessageOnPort } from "worker_threads";
import * as fs from "fs";
import * as path from "path";
import { JavaBridge, JavaOptions, JavaBridgeError, MavenLockEntry, installMaven } from "./java";

export { JavaBridge, JavaOptions, JavaBridgeError, MavenLockEntry, installMaven };

const JAVA_WORKER = `
const { workerData } = require("worker_threads");
const { spawn } = require("child_process");
const { port, flag, javaBin, args, cwd } = workerData;
const child = spawn(javaBin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
let buf = "", stderrBuf = "", dead = null;
const reply = (m) => { port.postMessage(m); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); };
child.stdout.setEncoding("utf8");
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (line.trim()) reply({ line });
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => { stderrBuf = (stderrBuf + d).slice(-2000); });
const die = (why) => { if (dead) return; dead = why + (stderrBuf.trim() ? ": " + stderrBuf.trim().split("\\n").pop() : ""); reply({ dead }); };
child.on("error", (e) => die("could not start " + javaBin + ": " + e.message));
child.on("exit", (code, sig) => die("the Java bridge exited (" + (sig || "code " + code) + ")"));
port.on("message", (m) => {
  if (m === "stop") { try { child.stdin.end(); child.kill(); } catch {} setTimeout(() => process.exit(0), 200).unref(); return; }
  if (dead) { reply({ dead }); return; }
  child.stdin.write(m + "\\n");
});
`;

/** Synchronous Java bridge backed by a Worker thread (same pattern as PyBridge). */
export class SyncJavaBridge {
  private worker: Worker;
  private port: MessagePort;
  private flag = new Int32Array(new SharedArrayBuffer(4));
  private nextId = 1;
  private dead: string | undefined;
  pendingFree: number[] = [];

  constructor(options: { projectDir: string; source?: string; java?: string; headless?: boolean }) {
    const jarDir = path.join(options.projectDir, ".ply", "java");
    const jars = fs.existsSync(jarDir)
      ? fs.readdirSync(jarDir).filter((x) => x.endsWith(".jar")).sort().map((x) => path.join(jarDir, x))
      : [];
    const source = options.source ?? path.resolve(__dirname, "../../../bridges/java/Bridge.java");
    const headless = options.headless ?? process.env.MYCEL_JAVA_HEADLESS !== "0";
    const args = [
      ...(headless ? ["-Djava.awt.headless=true"] : []),
      "-cp", [".", ...jars].join(path.delimiter),
      source,
    ];
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.worker = new Worker(JAVA_WORKER, {
      eval: true,
      workerData: { port: port2, flag: this.flag, javaBin: options.java ?? "java", args, cwd: options.projectDir },
      transferList: [port2],
    });
    this.worker.unref();
    this.port.unref();
  }

  request(op: string, fields: Record<string, any> = {}): { ok: boolean; value?: any; error?: { type: string; message: string; trace?: string } } {
    if (this.dead) throw new Error(this.dead);
    const id = this.nextId++;
    const free = this.pendingFree.splice(0);
    if (free.length) {
      Atomics.store(this.flag, 0, 0);
      this.port.postMessage(JSON.stringify({ id: -(id), op: "release", handles: free }));
      // release reply is awaited cleanly so sequence stays lock-step
      for (;;) {
        const rm = receiveMessageOnPort(this.port)?.message;
        if (!rm) { Atomics.wait(this.flag, 0, 0, 1000); Atomics.store(this.flag, 0, 0); continue; }
        if (rm.dead) { this.dead = rm.dead; throw new Error(rm.dead); }
        break;
      }
    }
    Atomics.store(this.flag, 0, 0);
    this.port.postMessage(JSON.stringify({ id, op, ...fields }));
    for (;;) {
      const m = receiveMessageOnPort(this.port)?.message;
      if (!m) { Atomics.wait(this.flag, 0, 0, 1000); Atomics.store(this.flag, 0, 0); continue; }
      if (m.dead) { this.dead = m.dead; throw new Error(m.dead); }
      const r = JSON.parse(m.line);
      if (r.id === id) return r;
    }
  }

  close() {
    try { this.port.postMessage("stop"); } catch { /* already gone */ }
    setTimeout(() => this.worker.terminate(), 300).unref();
  }
}

/** Extract top-level package names and root class names provided by a JAR (ZIP entries, no external tools needed). */
export function scanJarProvides(jarPath: string): string[] {
  const buf = fs.readFileSync(jarPath);
  const out = new Set<string>();
  // Parse ZIP local file headers ("PK\x03\x04") or central directory ("PK\x01\x02") for *.class entries
  for (let i = 0; i <= buf.length - 46; i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x01 && buf[i + 3] === 0x02) {
      const nameLen = buf.readUInt16LE(i + 28);
      const extraLen = buf.readUInt16LE(i + 30);
      const commentLen = buf.readUInt16LE(i + 32);
      const entry = buf.subarray(i + 46, i + 46 + nameLen).toString("utf8");
      if (entry.endsWith(".class") && !entry.startsWith("META-INF/") && !entry.includes("$")) {
        const slash = entry.lastIndexOf("/");
        if (slash > 0) {
          const pkg = entry.slice(0, slash).replace(/\//g, ".");
          out.add(pkg);
          const parts = pkg.split(".");
          if (parts.length >= 2) out.add(`${parts[0]}.${parts[1]}`);
        } else {
          out.add(entry.slice(0, -6));
        }
      }
      i += 45 + nameLen + extraLen + commentLen;
    }
  }
  return [...out].sort();
}
