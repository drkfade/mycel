"use strict";

const path = require("path");
const cp = require("child_process");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const SAB_BYTES = 2 * 1024 * 1024; // 2 MB shared response buffer

if (!isMainThread) {
  const { platform, helperPath, sab } = workerData;
  const ctrl = new Int32Array(sab, 0, 4); // [0]=state (0=idle,1=ok,2=err), [1]=byteLen, [2]=helper pid
  const payload = new Uint8Array(sab, 16);

  const cmd = platform === "darwin" ? "osascript" : "powershell.exe";
  const args = platform === "darwin"
    ? ["-l", "JavaScript", helperPath]
    : ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", helperPath];

  const child = cp.spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  if (child.pid) Atomics.store(ctrl, 2, child.pid); // lets the main thread kill the helper even if this thread is gone
  let buf = "";
  let stderrTail = "";
  const pending = [];

  const finishWith = (state, obj) => {
    const bytes = Buffer.from(JSON.stringify(obj), "utf8");
    const len = Math.min(bytes.length, payload.length);
    payload.set(bytes.subarray(0, len), 0);
    Atomics.store(ctrl, 1, len);
    Atomics.store(ctrl, 0, state);
    Atomics.notify(ctrl, 0);
  };

  child.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2000);
  });

  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      const waiter = pending.shift();
      if (!waiter) continue;
      try {
        const res = JSON.parse(line);
        finishWith(1, res);
      } catch (e) {
        finishWith(2, { error: { type: "Error", message: `invalid helper JSON: ${e.message}` } });
      }
    }
  });

  child.on("error", (err) => {
    while (pending.length) {
      pending.shift();
      finishWith(2, { error: { type: "Error", message: `helper spawn failed: ${err.message}` } });
    }
  });

  child.on("exit", (code, sig) => {
    while (pending.length) {
      pending.shift();
      const extra = stderrTail.trim() ? `: ${stderrTail.trim()}` : "";
      finishWith(2, { error: { type: "Error", message: `helper exited (${code ?? sig})${extra}` } });
    }
  });

  parentPort.on("message", (msg) => {
    if (msg && msg.type === "close") {
      try { child.stdin.end(); } catch { /* ignore */ }
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      process.exit(0);
    }
    pending.push(msg.id);
    try {
      child.stdin.write(JSON.stringify(msg) + "\n");
    } catch (e) {
      pending.pop();
      finishWith(2, { error: { type: "Error", message: `helper write failed: ${e.message}` } });
    }
  });
}

function createHelperClient(platform) {
  if (platform !== "darwin" && platform !== "win32") {
    throw new Error(`long-lived OS helper is not available on ${platform}`);
  }
  const helperPath = path.join(__dirname, platform === "darwin" ? "jxa-helper.js" : "win-helper.ps1");
  let worker = null;
  let sab = null;
  let ctrl = null;
  let payload = null;
  let nextId = 1;
  let closed = false;
  let exitHook = null;

  const ensure = () => {
    if (closed) throw new Error("helper has been closed");
    if (worker) return;
    sab = new SharedArrayBuffer(SAB_BYTES);
    ctrl = new Int32Array(sab, 0, 4);
    payload = new Uint8Array(sab, 16);
    worker = new Worker(__filename, { workerData: { platform, helperPath, sab } });
    worker.unref();
    if (!exitHook) { exitHook = () => close(); process.once("exit", exitHook); }
  };

  const call = (op, args = {}, timeoutMs = 15000) => {
    ensure();
    Atomics.store(ctrl, 0, 0);
    const id = nextId++;
    worker.postMessage({ id, op, args });
    const waited = Atomics.wait(ctrl, 0, 0, timeoutMs);
    if (waited === "timed-out") {
      close();
      throw new Error(`helper timed out after ${timeoutMs} ms on ${op}`);
    }
    const state = Atomics.load(ctrl, 0);
    const len = Atomics.load(ctrl, 1);
    const json = Buffer.from(payload.subarray(0, len)).toString("utf8");
    const parsed = JSON.parse(json);
    if (state === 2) {
      throw new Error(parsed?.error?.message ?? "helper error");
    }
    return parsed;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (exitHook) { process.removeListener("exit", exitHook); exitHook = null; }
    const pid = ctrl ? Atomics.load(ctrl, 2) : 0;
    if (pid > 0) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
    if (worker) {
      try { worker.postMessage({ type: "close" }); } catch { /* ignore */ }
      try { void worker.terminate(); } catch { /* ignore */ }
      worker = null;
    }
  };

  return { call, close, isRunning: () => !!worker && !closed };
}

module.exports = { createHelperClient };
