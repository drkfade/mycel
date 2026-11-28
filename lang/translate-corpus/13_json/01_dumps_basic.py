import json
x = [1, 'simple', 'list']
print(json.dumps(x))
print(json.dumps({"c": 0, "b": 0, "a": 0}, sort_keys=True))
