import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnCli } from "./helpers";
import { createTarGz, extractTarGz } from "../src/project";

const PLY = path.resolve(__dirname, "..", "..", "bin", "ply");
const SITE_INDEX = path.resolve(__dirname, "..", "..", "..", "site", "public", "mycel", "packages", "index.json");
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "ply-idx-"));

function ply(cwd: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnCli(PLY, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("official package index: ply install computer from file:// index verifies sha256 and runs capability-gated code", () => {
  const work = mk();
  const reg = mk();
  const env = {
    PLY_REGISTRY: reg,
    PLY_PACKAGE_INDEX: pathToFileURL(SITE_INDEX).href,
    MYCEL_COMPUTER_BACKEND: "mock",
  };
  try {
    const app = path.join(work, "demo");
    fs.mkdirSync(path.join(app, "src"), { recursive: true });
    fs.writeFileSync(path.join(app, "ply.json"), JSON.stringify({ name: "demo", version: "0.1.0", main: "src/main.myc" }));
    fs.writeFileSync(path.join(app, "src", "main.myc"), `
import computer.mouse

fn main() {
  let r = mouse.moveTo(123, 456)
  match r {
    .Ok(_) => {
      let p = mouse.position().unwrap()
      print(f"ok:{p.x},{p.y}")
    }
    .Err(e) => print(f"denied:{e.message}")
  }
}
`);

    const inst = ply(app, ["install", "computer"], env);
    assert.equal(inst.code, 0, inst.err + inst.out);
    assert.match(inst.out, /added computer \^0\.1\.0/);
    assert.match(inst.out, /permissions this package can use/);

    const manifest = JSON.parse(fs.readFileSync(path.join(app, "ply.json"), "utf8"));
    assert.equal(manifest.dependencies.computer, "^0.1.0");
    assert.equal(fs.existsSync(path.join(app, "ply_modules", "computer", "src", "mouse.myc")), true);
    assert.equal(fs.existsSync(path.join(app, "ply_modules", "computer", "native", "index.cjs")), true);

    const lock = JSON.parse(fs.readFileSync(path.join(app, "ply.lock"), "utf8"));
    assert.equal(lock.packages.computer.version, "0.1.0");
    assert.match(lock.packages.computer.source, /^(index:file:\/\/|registry)$/);
    assert.equal(fs.existsSync(path.join(reg, "computer", "0.1.0", "ply.json")), true);

    // Without --allow-control: denied cleanly
    const denied = ply(app, ["run"], env);
    assert.equal(denied.code, 0, denied.err);
    assert.match(denied.out, /^denied:.*--allow-control/);

    // With --allow-control: runs via mock backend and emits safety notice on stderr
    const allowed = ply(app, ["run", "--allow-control"], env);
    assert.equal(allowed.code, 0, allowed.err);
    assert.equal(allowed.out.trim(), "ok:123,456");
    assert.match(allowed.err, /hold Escape for 1s to abort/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(reg, { recursive: true, force: true });
  }
});

test("official package index rejects sha256 mismatch and path traversal archives", () => {
  const work = mk();
  const reg = mk();
  try {
    const srcPkg = path.join(work, "srcpkg");
    fs.mkdirSync(path.join(srcPkg, "src"), { recursive: true });
    fs.writeFileSync(path.join(srcPkg, "ply.json"), JSON.stringify({ name: "computer", version: "0.1.0" }));
    fs.writeFileSync(path.join(srcPkg, "src", "lib.myc"), "pub fn ping() -> Int => 1\n");

    const tarPath = path.join(work, "computer-0.1.0.tar.gz");
    createTarGz(srcPkg, tarPath);
    const badIndexPath = path.join(work, "index.json");
    fs.writeFileSync(badIndexPath, JSON.stringify({
      packages: {
        computer: {
          versions: {
            "0.1.0": { url: "computer-0.1.0.tar.gz", sha256: "0".repeat(64) },
          },
        },
      },
    }));

    const app = path.join(work, "app");
    fs.mkdirSync(path.join(app, "src"), { recursive: true });
    fs.writeFileSync(path.join(app, "ply.json"), JSON.stringify({ name: "app", version: "0.1.0" }));
    fs.writeFileSync(path.join(app, "src", "main.myc"), "fn main() {}\n");

    const r = ply(app, ["install", "computer"], {
      PLY_REGISTRY: reg,
      PLY_PACKAGE_INDEX: pathToFileURL(badIndexPath).href,
    });
    assert.equal(r.code, 1);
    assert.match(r.err, /sha256 mismatch/);

    // Craft a tar.gz containing a "../escape.txt" entry and verify extractTarGz rejects it
    const hdr = Buffer.alloc(512, 0);
    Buffer.from("../escape.txt").copy(hdr, 0);
    Buffer.from("0000644\0").copy(hdr, 100);
    Buffer.from("0000000\0").copy(hdr, 108);
    Buffer.from("0000000\0").copy(hdr, 116);
    Buffer.from("00000000004\0").copy(hdr, 124);
    Buffer.from("00000000000\0").copy(hdr, 136);
    hdr.fill(0x20, 148, 156);
    hdr[156] = "0".charCodeAt(0);
    Buffer.from("ustar\0").copy(hdr, 257);
    Buffer.from("00").copy(hdr, 263);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += hdr[i];
    Buffer.from(sum.toString(8).padStart(6, "0") + "\0 ").copy(hdr, 148);
    const data = Buffer.alloc(512, 0);
    Buffer.from("evil").copy(data, 0);
    const maliciousGz = require("zlib").gzipSync(Buffer.concat([hdr, data, Buffer.alloc(1024, 0)]));
    assert.throws(() => extractTarGz(maliciousGz, path.join(work, "extract")), /unsafe path/);
    void crypto;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(reg, { recursive: true, force: true });
  }
});
