"""List a Python module's public names for Mycel bindings (stdlib only). argv: module names. Prints JSON:
{"<module>": {"members": [{"name", "kind": "fn"|"class"|"module"|"value", "params": [...] | null}]} | {"error": "..."}}
params: [{"name", "kind": "pos"|"posonly"|"kwonly"|"var"|"varkw", "default": bool}] (null = no readable signature)."""
import importlib, inspect, json, os, sys, types

KINDS = {inspect.Parameter.POSITIONAL_ONLY: "posonly", inspect.Parameter.POSITIONAL_OR_KEYWORD: "pos",
         inspect.Parameter.KEYWORD_ONLY: "kwonly", inspect.Parameter.VAR_POSITIONAL: "var", inspect.Parameter.VAR_KEYWORD: "varkw"}

def params(f):
    try:
        sig = inspect.signature(f)
    except (TypeError, ValueError):
        return None
    return [{"name": p.name, "kind": KINDS[p.kind], "default": p.default is not inspect.Parameter.empty} for p in sig.parameters.values()]

def members(mod):
    names = getattr(mod, "__all__", None)
    if not isinstance(names, (list, tuple)):
        names = [n for n in dir(mod) if not n.startswith("_")]
    out = []
    for n in sorted(set(str(x) for x in names)):
        if n.startswith("_"): continue
        try:
            v = getattr(mod, n)
        except Exception:
            continue
        if isinstance(v, types.ModuleType): out.append({"name": n, "kind": "module", "params": None})
        elif inspect.isclass(v): out.append({"name": n, "kind": "class", "params": params(v)})
        elif callable(v): out.append({"name": n, "kind": "fn", "params": params(v)})
        else: out.append({"name": n, "kind": "value", "params": None})
    return out

def main():
    real = sys.stdout
    sys.stdout = sys.stderr          # a package that prints on import must not corrupt the JSON
    res = {}
    for m in sys.argv[1:]:
        try:
            res[m] = {"members": members(importlib.import_module(m))}
        except BaseException as e:
            res[m] = {"error": f"{type(e).__name__}: {e}"}
    real.write(json.dumps(res))

main()
