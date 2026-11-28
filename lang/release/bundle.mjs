// Same dependency-free CommonJS wrapping approach as web/build.mjs, with real Node built-ins.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const lang = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function boot(nodeRequire, data) {
  const fs = nodeRequire('node:fs');
  const path = nodeRequire('node:path');
  const root = path.join(path.parse(process.execPath).root, '__mycel_embedded__');
  const cache = Object.create(null);
  const idOf = (file) => path.relative(root, file).split(path.sep).join('/').replace(/\.js$/, '');
  const stdText = (file) => typeof file === 'string' ? data.std[idOf(file)] : undefined;
  // Only compiler-library reads use virtual files; all user files retain real fs semantics.
  const embeddedFs = { ...fs,
    existsSync(file) { return stdText(file) !== undefined || fs.existsSync(file); },
    readFileSync(file, options) {
      const text = stdText(file);
      if (text === undefined) return fs.readFileSync(file, options);
      const encoding = typeof options === 'string' ? options : options?.encoding;
      return encoding ? Buffer.from(text).toString(encoding) : Buffer.from(text);
    },
  };
  function load(id) {
    if (!Object.hasOwn(data.mods, id) && Object.hasOwn(data.mods, id + '/index')) id += '/index'; // require("./dir")
    if (cache[id]) return cache[id].exports;
    if (!Object.hasOwn(data.mods, id)) throw new Error('Missing bundled module: ' + id);
    const filename = path.join(root, id + '.js');
    const module = { exports: {}, filename };
    cache[id] = module;
    const localRequire = (name) => {
      if (name.startsWith('.')) return load(idOf(path.resolve(path.dirname(filename), name)));
      if (path.isAbsolute(name) && name.startsWith(root + path.sep)) return load(idOf(name));
      if (name === 'fs' || name === 'node:fs') return embeddedFs;
      if (name === 'worker_threads' || name === 'node:worker_threads') {
        const workers = nodeRequire(name);
        return { ...workers, Worker: class extends workers.Worker {
          constructor(file, options) {
            // No extracted worker file or Node on PATH: the same loader runs in a real eval worker.
            if (file === path.join(root, 'dist', 'src', 'worker.js')) {
              super('(' + boot.toString() + ')(require,' + JSON.stringify(data) + ').load("dist/src/worker");', { ...options, eval: true });
            } else super(file, options);
          }
        } };
      }
      // A package's native/*.cjs lives on disk (ply_modules); the SEA's built-in require only loads built-ins.
      if (path.isAbsolute(name)) return nodeRequire('node:module').createRequire(name)(name);
      return nodeRequire(name);
    };
    new Function('module', 'exports', 'require', '__dirname', '__filename', data.mods[id])(
      module, module.exports, localRequire, path.dirname(filename), filename);
    return module.exports;
  }
  return { load };
}

export function bundle(root = lang) {
  const mods = Object.create(null);
  function visit(id) {
    if (Object.hasOwn(mods, id)) return;
    if (!fs.existsSync(path.join(root, id + '.js')) && fs.existsSync(path.join(root, id, 'index.js'))) id += '/index';
    if (Object.hasOwn(mods, id)) return;
    const code = fs.readFileSync(path.join(root, id + '.js'), 'utf8')
      .replace(/^#![^\n]*\n/, '').replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    mods[id] = code;
    for (const m of code.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(id), m[1])).replace(/\.js$/, ''));
    }
  }
  visit('dist/src/cli');
  visit('dist/src/worker');
  // The CLI and LSP also use computed require paths; include and resolve these explicitly.
  visit('lsp/server');
  const std = Object.create(null);
  for (const file of fs.readdirSync(path.join(root, 'std')).sort()) {
    if (/\.(myc|olx)$/.test(file)) std['std/' + file] = fs.readFileSync(path.join(root, 'std', file), 'utf8');
  }
  // Python/npm helper scripts (task 55): child processes need them, foreign.ts writes them out from here
  for (const file of fs.readdirSync(path.join(root, 'tools')).sort()) {
    if (/\.(py|js)$/.test(file)) std['tools/' + file.replace(/\.js$/, '')] = fs.readFileSync(path.join(root, 'tools', file), 'utf8');
  }
  // Java bridge source: Java needs a real file/classpath on disk, so bridges/java.ts extracts+compiles it to cache
  const javaBridge = path.join(root, 'bridges/java/Bridge.java');
  if (fs.existsSync(javaBridge)) std['bridges/java/Bridge.java'] = fs.readFileSync(javaBridge, 'utf8');
  const data = { mods, std };
  return `// Mycel 0.2.1 alpha. Copyright 2026 drky. All rights reserved.\n` +
    `const app = (${boot.toString()})(require, ${JSON.stringify(data)});\n` +
    // exitCode, not process.exit(): exiting while a server's handles are still closing aborts Node on Windows
    // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c", exit 0xC0000409,
    // nodejs/node#56645; first real-Windows run, examples/api tests). Same as the source launcher bin/mycel.
    `app.load('dist/src/cli').main(process.argv.slice(2), { buildRuntime: null }).then(code => { process.exitCode = code; }, e => { console.error(e?.stack ?? e); process.exitCode = 70; });\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? path.join(lang, 'release/dist/mycel.cjs');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const source = bundle();
  fs.writeFileSync(out, source);
  console.log(`bundled ${Buffer.byteLength(source)} bytes`);
}
