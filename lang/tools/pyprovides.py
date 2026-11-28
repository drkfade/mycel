"""Run inside the project venv. Prints JSON {"<normalized dist name>": {"name", "version", "provides": [modules], "requires": [names]}}
for every installed distribution (pip/setuptools excluded). provides = top_level.txt, else the top-level modules in RECORD."""
import importlib.metadata as md, json, re, sys

def norm(n): return re.sub(r"[-_.]+", "-", n).lower()
SKIP = {"pip", "setuptools", "wheel"}
out = {}
for d in md.distributions():
    name = d.metadata["Name"]
    if not name or norm(name) in SKIP: continue
    tops = []
    tl = d.read_text("top_level.txt")
    if tl: tops = [t.strip() for t in tl.splitlines() if t.strip()]
    else:
        for f in d.files or []:
            p = str(f).replace("\\", "/")
            first = p.split("/")[0]
            if first.endswith((".dist-info", ".egg-info", ".data")) or first in ("..", "__pycache__", "bin", "Scripts"): continue
            if "/" in p and (p.endswith(".py") or p.endswith(".so") or p.endswith(".pyd")): tops.append(first)
            elif p.endswith(".py"): tops.append(first[:-3])
            elif p.endswith((".so", ".pyd")): tops.append(first.split(".")[0])
    tops = sorted({t for t in tops if t.isidentifier() and not t.startswith("_")} or set(tops))
    reqs = []
    for r in d.requires or []:
        if ";" in r and "extra ==" in r: continue           # optional extras are not installed
        m = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", r)
        if m: reqs.append(norm(m.group(1)))
    out[norm(name)] = {"name": name, "version": d.version, "provides": tops, "requires": sorted(set(reqs))}
sys.stdout.write(json.dumps(out))
