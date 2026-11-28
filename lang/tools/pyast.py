"""Dump a Python file's syntax tree and comments as JSON for `mycel translate` (stdlib `ast` + `tokenize` only).
argv: <file.py>. Prints {"ok": tree, "comments": [{"l", "c", "t", "inline"}]} or {"error": {"line", "col", "msg"}}.
Nodes: {"_t": type, "_l": line, ...fields}; constants: int {"$i": "12"}, float {"$f": "1.5"}, complex/bytes {"$x": repr}."""
import ast, io, json, sys, tokenize

def conv(n):
    if isinstance(n, ast.AST):
        d = {"_t": type(n).__name__}
        if hasattr(n, "lineno"): d["_l"] = n.lineno; d["_e"] = getattr(n, "end_lineno", n.lineno)
        for f in n._fields:
            v = getattr(n, f, None)
            d[f] = const(v) if isinstance(n, ast.Constant) and f == "value" else conv(v)
        return d
    if isinstance(n, list): return [conv(x) for x in n]
    return n

def const(v):
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, int): return {"$i": str(v)}
    if isinstance(v, float): return {"$f": repr(v)}
    return {"$x": repr(v)}

def extract_comments(src):
    lines = src.splitlines()
    out = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type == tokenize.COMMENT:
                ln, col = tok.start
                before = lines[ln - 1][:col] if 0 <= ln - 1 < len(lines) else ""
                out.append({"l": ln, "c": col, "t": tok.string, "inline": bool(before.strip())})
    except tokenize.TokenError:
        pass
    return out

src = open(sys.argv[1], encoding="utf-8").read()
try:
    tree = ast.parse(src, sys.argv[1])
except SyntaxError as e:
    sys.stdout.write(json.dumps({"error": {"line": e.lineno or 0, "col": e.offset or 0, "msg": e.msg}}))
    sys.exit(0)
sys.stdout.write(json.dumps({"ok": conv(tree), "comments": extract_comments(src)}))
