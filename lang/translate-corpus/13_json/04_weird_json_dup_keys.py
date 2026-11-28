import json
weird_json = '{"x": 1, "x": 2, "x": 3}'
obj = json.loads(weird_json)
print(obj["x"])
