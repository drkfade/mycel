# Optionals, exceptions, and imports in Python
import json

def parse_positive(raw: str) -> int:
    n = int(raw)
    if n <= 0:
        raise ValueError("must be > 0")
    return n

def double_positive(raw: str) -> int:
    return parse_positive(raw) * 2

print(double_positive("21"))
try:
    print(double_positive("oops"))
except ValueError as err:
    print("err:", err)

print(json.dumps({"sum": sum([1.0, 2.0, 3.0])}))
