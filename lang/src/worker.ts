import { parentPort, workerData } from "worker_threads";
import { run } from "./host";

(async () => {
  const r = await run({ ...workerData, onOutput: (t: string) => parentPort!.postMessage({ out: t }) });
  parentPort!.postMessage({ result: r });
})();
