"""Build the offline test wheels for task 55 (stdlib zipfile; no setuptools, no network). argv: <out dir>.
mycel-fixture-greet 1.0.0 provides module `greetlib` (dist name != module name) and needs mycel-fixture-base.
mycel-fixture-base 2.1.0 provides module `basefix`."""
import base64, hashlib, os, sys, zipfile

def wheel(out, dist, version, files, requires=()):
    norm = dist.replace("-", "_")
    info = f"{norm}-{version}.dist-info"
    meta = f"Metadata-Version: 2.1\nName: {dist}\nVersion: {version}\n" + "".join(f"Requires-Dist: {r}\n" for r in requires)
    files = dict(files)
    files[f"{info}/METADATA"] = meta
    files[f"{info}/WHEEL"] = "Wheel-Version: 1.0\nGenerator: mkwheel\nRoot-Is-Purelib: true\nTag: py3-none-any\n"
    files[f"{info}/top_level.txt"] = "\n".join(sorted({p.split("/")[0].removesuffix(".py") for p in files if not p.startswith(info)})) + "\n"
    rec = []
    for p, t in files.items():
        b = t.encode()
        rec.append(f"{p},sha256={base64.urlsafe_b64encode(hashlib.sha256(b).digest()).rstrip(b'=').decode()},{len(b)}")
    rec.append(f"{info}/RECORD,,")
    files[f"{info}/RECORD"] = "\n".join(rec) + "\n"
    path = os.path.join(out, f"{norm}-{version}-py3-none-any.whl")
    with zipfile.ZipFile(path, "w") as z:
        for p in sorted(files):
            zi = zipfile.ZipInfo(p, date_time=(2026, 1, 1, 0, 0, 0))   # fixed time: the same bytes every build
            z.writestr(zi, files[p])
    return path

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
wheel(out, "mycel-fixture-base", "2.1.0", {"basefix/__init__.py": "def double(x):\n    return x * 2\n"})
wheel(out, "mycel-fixture-greet", "1.0.0", {"greetlib/__init__.py": '''from basefix import double

ANSWER = 42

def hello(name, punct="!", *, loud=False):
    s = f"hello {name}{punct}"
    return s.upper() if loud else s

def twice(n):
    return double(n)

def boom():
    raise ValueError("fixture says no")

def chatty():
    print("printed from python")
    return {"ok": True, "items": [1, 2.5, None, "x"], "big": 2**70}

def iter_nums(n):
    for i in range(n):
        yield i * 10

class Box:
    def __init__(self, data):
        self.data = data
    def __len__(self):
        return len(self.data)
    def __getitem__(self, k):
        return self.data[k]

class Counter:
    def __init__(self, start=0):
        self.n = start
    def add(self, k=1):
        self.n += k
        return self.n
    def __str__(self):
        return f"Counter({self.n})"
'''}, requires=["mycel-fixture-base>=2"])

wheel(out, "mycel-fixture-requests", "1.0.0", {"requests/__init__.py": '''class ConnectionError(OSError):
    pass

class Response:
    def __init__(self, url, params=None, **kwargs):
        self.url = url
        self.params = params
        self.timeout = kwargs.get("timeout")
        self.status_code = 200
        self.ok = True
        self.text = "alpha\\nbeta\\ngamma"
    def json(self):
        return {"ok": self.ok, "url": self.url, "timeout": self.timeout}

def get(url, params=None, **kwargs):
    if "fail" in url:
        raise ConnectionError("host unreachable")
    return Response(url, params=params, **kwargs)
'''})
print(out)
