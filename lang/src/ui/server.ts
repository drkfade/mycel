/** Local development host for browser-safe Mycel UI programs. Never launches a browser. */
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { findProject } from "../project";

export async function serveUi(target = ".", port = 0): Promise<http.Server> {
  const input = path.resolve(target);
  const st = fs.statSync(input);
  const project = findProject(st.isDirectory() ? input : path.dirname(input));
  const entry = st.isDirectory() ? project?.main : input;
  if (!entry) throw new Error("No project found. Give a .myc file or a folder with ply.json.");
  const root = fs.realpathSync(project?.srcDir ?? path.dirname(entry));
  const main = fs.realpathSync(entry);
  const relative = path.relative(root, main);
  if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error("The entry file must be inside the project source directory.");
  const assets = path.resolve(__dirname, "../../../..", "site/public/mycel/play");
  const resources: Record<string, string> = { "/mycel.js": "mycel.js", "/worker.js": "worker.js", "/ui-runtime.js": "ui-runtime.js" };
  if (Object.values(resources).some(name => !fs.existsSync(path.join(assets, name))))
    throw new Error("Browser UI assets are missing. mycel web currently needs a source checkout with a built playground.");
  function sources() {
    const files: Record<string, string> = Object.create(null);
    const visit = (dir: string, parts: string[]) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink() || item.name.startsWith(".") || item.name === "node_modules") continue;
        if (item.isDirectory()) visit(path.join(dir, item.name), [...parts, item.name]);
        else if (item.isFile() && /\.(myc|olx)$/.test(item.name)) {
          const file = path.join(dir, item.name);
          if (file === main) continue;
          const name = [...parts, item.name.replace(/\.(myc|olx)$/, "")].join(".");
          if (!(name in files) || item.name.endsWith(".myc")) files[name] = fs.readFileSync(file, "utf8");
        }
      }
    };
    visit(root, []);
    return JSON.stringify({ code: fs.readFileSync(main, "utf8"), files });
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Mycel app</title><style>body{font:16px system-ui;margin:2rem}#error{white-space:pre-wrap;color:#a00;background:#fff0f0;padding:1em}#error:empty{display:none}.mycel-ui-row{display:flex;gap:.5em}.mycel-ui-column,.mycel-ui-body{display:flex;flex-direction:column;gap:.5em}.mycel-ui-titlebar{font-weight:bold}</style></head><body><div id="error"></div><pre id="output"></pre><div id="app"></div><script src="/ui-runtime.js"></script><script src="/app.js"></script></body></html>`;
  const app = `const mount=document.getElementById('app'),error=document.getElementById('error'),output=document.getElementById('output');let worker,timeout,revision='';const renderer=MycelUI.createRenderer(document,(id,event,value)=>worker&&worker.postMessage({type:'ui:event',id,event,value}));async function poll(){try{const r=await fetch('/project',{cache:'no-store'});if(!r.ok)throw Error(await r.text());const text=await r.text();if(text!==revision){revision=text;if(worker)worker.terminate();clearTimeout(timeout);mount.replaceChildren();error.textContent='';output.textContent='';const p=JSON.parse(text);worker=new Worker('/worker.js');timeout=setTimeout(()=>{worker.terminate();error.textContent='Stopped: the program took too long.'},7000);worker.onmessage=e=>{const m=e.data;if(m.type==='ui:render')renderer.render(mount,m.root);else if(m.type==='out')output.textContent+=m.text;else if(m.type==='done'){clearTimeout(timeout);const r=m.result;error.textContent=r.diagnosticsText||(r.error&&r.error.human)||'';if(r.ui)renderer.render(mount,r.ui);}};worker.postMessage(p);}}catch(e){error.textContent=String(e)}setTimeout(poll,700)}poll();`;
  const server = http.createServer((req, res) => {
    // Reject DNS rebinding and cross-site browser requests to this local source server.
    const host = req.headers.host ?? "";
    const addr = server.address();
    if (!addr || typeof addr === "string" || host !== `127.0.0.1:${addr.port}` || (req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"])))) { res.writeHead(403).end("Forbidden"); return; }
    if (req.method !== "GET") { res.writeHead(405).end(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = req.url ?? "/";
      if (url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); }
      else if (url === "/app.js") { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(app); }
      else if (url === "/project") { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(sources()); }
      else if (Object.hasOwn(resources, url.split("?")[0])) { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(fs.readFileSync(path.join(assets, resources[url.split("?")[0]]))); }
      else res.writeHead(404).end("Not found");
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  return server;
}
