"""Mycel's Python bridge: one long-lived process per Mycel run, JSON lines over stdio (stdlib only).

Requests  {"id": n, "op": "call"|"callm"|"attr"|"item"|"invoke"|"str"|"free", ...}
Responses {"id": n, "ok": <value>, "out": "<captured print output>"} or {"id": n, "err": {"type", "msg", "tb"}}
Values: null/bool/str as JSON; int {"$i": "123"}; float {"$f": 1.5 | "nan" | "inf" | "-inf"}; list/tuple -> array;
dict with str keys {"$d": {...}}; anything else stays here as a handle {"$h": id, "$t": type name}.
"""
import difflib, importlib, io, json, math, os, sys, traceback

PROTO = os.fdopen(os.dup(1), "w", encoding="utf-8")   # the protocol keeps the real stdout
os.dup2(2, 1)                                           # C-level writes to fd 1 can no longer corrupt it
HANDLES, NEXT = {}, [1]
MAX_ITEMS, MAX_DEPTH = 100000, 32
# Names never reachable from Mycel: the classic routes from any object to the interpreter's internals. This is
# defence in depth only — a package the user granted runs with the user's full power anyway (SPEC §9).
def blocked(name):
    return not isinstance(name, str) or name.startswith("__")

def handle(v):
    i = NEXT[0]; NEXT[0] += 1
    HANDLES[i] = v
    return {"$h": i, "$t": type(v).__name__}

def enc(v, depth=0, budget=None):
    if budget is None: budget = [MAX_ITEMS]
    if v is None or isinstance(v, (bool, str)): return v
    if isinstance(v, int): return {"$i": str(v)}
    if isinstance(v, float):
        if math.isnan(v): return {"$f": "nan"}
        if math.isinf(v): return {"$f": "inf" if v > 0 else "-inf"}
        return {"$f": v}
    if depth < MAX_DEPTH and type(v) in (list, tuple) and len(v) <= budget[0]:
        budget[0] -= len(v)
        return [enc(x, depth + 1, budget) for x in v]
    if depth < MAX_DEPTH and type(v) is dict and len(v) <= budget[0] and all(isinstance(k, str) for k in v):
        budget[0] -= len(v)
        return {"$d": {k: enc(x, depth + 1, budget) for k, x in v.items()}}
    return handle(v)

def dec(v):
    if isinstance(v, list): return [dec(x) for x in v]
    if isinstance(v, dict):
        if "$i" in v: return int(v["$i"])
        if "$f" in v: return float(v["$f"])
        if "$h" in v:
            if v["$h"] not in HANDLES: raise ValueError("this Python object was already released")
            return HANDLES[v["$h"]]
        if "$d" in v:   # from Mycel: [[key, value], ...] (any key type); copied back from Python: {key: value}
            d = v["$d"]
            return {k: dec(x) for k, x in d.items()} if isinstance(d, dict) else {dec(k): dec(x) for k, x in d}
        if "$s" in v: return set(dec(x) for x in v["$s"])
    return v

def target(req):
    if "h" in req: return dec({"$h": req["h"]})
    if "val" in req: return dec(req["val"])
    mod = importlib.import_module(req["mod"])
    return mod

def get(obj, name):
    if blocked(name): raise AttributeError(f"`{name}` cannot be reached from Mycel (names starting with __ are blocked)")
    try:
        return getattr(obj, name)
    except AttributeError as e:
        cands = [n for n in dir(obj) if not n.startswith("_")]
        near = difflib.get_close_matches(name, cands, n=1, cutoff=0.6)
        hint = f" — did you mean `{near[0]}`?" if near else (f" (available: {', '.join(cands[:10])})" if cands else "")
        raise AttributeError(f"{e}{hint}") from None

def run(req):
    op = req["op"]
    args = [dec(a) for a in req.get("args", [])]
    kw = {k: dec(x) for k, x in req.get("kw", {}).items()}
    if op == "call":   # module attribute: "" = the module, "()" = call the module itself
        obj = target(req)
        if req["attr"] == "": return obj
        f = get(obj, req["attr"])
        return f(*args, **kw) if req.get("callable", True) and callable(f) else f
    obj = target(req)
    if op == "callm": return get(obj, req["name"])(*args, **kw)
    if op == "attr": return get(obj, req["name"])
    if op == "setattr":
        name = req["name"]
        if blocked(name): raise AttributeError(f"`{name}` cannot be reached from Mycel (names starting with __ are blocked)")
        setattr(obj, name, dec(req["val"]))
        return None
    if op == "item": return obj[dec(req["key"])]
    if op == "setitem":
        obj[dec(req["key"])] = dec(req["val"])
        return None
    if op == "invoke": return obj(*args, **kw)
    if op == "str": return str(obj)
    if op == "len": return len(obj)
    if op == "iter": return iter(obj)
    if op == "next":
        try:
            return [True, next(obj)]
        except StopIteration:
            return [False]
    raise ValueError(f"unknown bridge op {op}")

def main():
    for line in sys.stdin:
        if not line.strip(): continue
        req = json.loads(line)
        for h in req.get("free", []): HANDLES.pop(h, None)
        if req.get("op") == "free":
            continue
        cap = io.StringIO(); old = sys.stdout; sys.stdout = cap
        try:
            res = {"id": req["id"], "ok": enc(run(req))}
        except BaseException as e:  # SystemExit / KeyboardInterrupt inside a package must not kill the bridge
            tb = traceback.format_exception(type(e), e, e.__traceback__)
            last = tb[-1].strip() if tb else f"{type(e).__name__}: {e}"
            res = {"id": req["id"], "err": {"type": type(e).__name__, "msg": last, "tb": "".join(tb[-6:])}}
        finally:
            sys.stdout = old
        out = cap.getvalue()
        if out: res["out"] = out
        try:
            PROTO.write(json.dumps(res) + "\n")
        except (TypeError, ValueError) as e:
            PROTO.write(json.dumps({"id": req["id"], "err": {"type": "TypeError", "msg": f"TypeError: cannot send the result to Mycel: {e}"}}) + "\n")
        PROTO.flush()

if __name__ == "__main__":
    main()
