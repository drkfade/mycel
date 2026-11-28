/**
 * A long-lived python3 process (tools/pybridge.py) that Mycel calls synchronously. Mycel natives are synchronous, so
 * the child is owned by a worker thread; the caller posts a request, sleeps in Atomics.wait until the worker flips a
 * shared flag, then takes the reply with receiveMessageOnPort (any size, no polling). Works the same on Windows.
 */
import { Worker, MessageChannel, MessagePort, receiveMessageOnPort } from "worker_threads";

const WORKER = `
const { workerData } = require("worker_threads");
const { spawn } = require("child_process");
const { port, flag, python, script, cwd } = workerData;
const child = spawn(python, ["-u", script], { cwd, stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
let buf = "", dead = null;
const reply = (m) => { port.postMessage(m); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); };
child.stdout.setEncoding("utf8");
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) reply({ line }); } });
const die = (why) => { if (dead) return; dead = why; reply({ dead: why }); };
child.on("error", (e) => die("could not start " + python + ": " + e.message));
child.on("exit", (code, sig) => die("the Python process exited (" + (sig || "code " + code) + ")"));
port.on("message", (m) => { if (m === "stop") { try { child.stdin.end(); } catch {} setTimeout(() => process.exit(0), 200).unref(); return; } if (dead) { reply({ dead }); return; } child.stdin.write(m + "\\n"); });
`;

export class PyBridge {
  private worker: Worker;
  private port: MessagePort;
  private flag = new Int32Array(new SharedArrayBuffer(4));
  private nextId = 1;
  private dead: string | undefined;
  /** handles released by the garbage collector, sent along with the next request */
  pendingFree: number[] = [];

  constructor(python: string, script: string, cwd: string) {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.worker = new Worker(WORKER, { eval: true, workerData: { port: port2, flag: this.flag, python, script, cwd }, transferList: [port2] });
    this.worker.unref();
    this.port.unref();
  }

  /** One request → its reply (JSON), or throws Error(message) when the process is gone. */
  request(msg: Record<string, unknown>): any {
    if (this.dead) throw new Error(this.dead);
    const id = this.nextId++;
    const free = this.pendingFree.splice(0);
    Atomics.store(this.flag, 0, 0);
    this.port.postMessage(JSON.stringify({ ...msg, id, ...(free.length ? { free } : {}) }));
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
