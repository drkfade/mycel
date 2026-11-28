#!/usr/bin/env python3
"""Five independent processes per backend; wait4 reports per-child peak RSS."""
import json, os, pathlib, statistics, subprocess, tempfile, time
root = pathlib.Path(__file__).resolve().parents[3]
bench = root / 'lang/bench/native'
def run(cmd):
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        start = time.monotonic()
        p = subprocess.Popen(cmd, stdout=out, stderr=err)
        _, status, usage = os.wait4(p.pid, 0)
        elapsed = time.monotonic() - start
        p.returncode = os.waitstatus_to_exitcode(status)
        out.seek(0); err.seek(0)
        output, errors = out.read(), err.read()
        if p.returncode: raise RuntimeError(f'{cmd}: {errors.decode()}')
        return elapsed, usage.ru_maxrss, output
with tempfile.TemporaryDirectory(prefix='mycel-bench-') as d:
    d=pathlib.Path(d); myc=bench/'fib.myc'; native=d/'native'; rust_bin=d/'rust'; c_bin=d/'c'; js=d/'bundle.js'
    run(['node', str(root/'lang/native/compiler.cjs'), str(myc), str(native)])
    rust = pathlib.Path.home() / '.cargo/bin/rustc'
    if not rust.is_file(): raise RuntimeError(f'Rust compiler missing: {rust}')
    run([str(rust), '-C', 'opt-level=3', str(bench/'fib.rs'), '-o', str(rust_bin)])
    run(['clang','-O2',str(bench/'fib.c'),'-o',str(c_bin)])
    run(['node',str(bench/'bundle.cjs'),str(myc),str(js)])
    results={}; expected=None
    for name, cmd in [('native',[str(native)]),('Rust',[str(rust_bin)]),('C',[str(c_bin)]),('JS',['node',str(js)])]:
        rows=[run(cmd) for _ in range(5)]
        for _,_,output in rows:
            if expected is None: expected=output
            assert output == expected, (name, output, expected)
        results[name]={'median_seconds':statistics.median(x[0] for x in rows),'peak_rss_bytes_median':statistics.median(x[1] for x in rows),'runs_seconds':[round(x[0],6) for x in rows]}
    print(json.dumps({'benchmark':'fib(32)','output':expected.decode().strip(),'results':results},indent=2))
