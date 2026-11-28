import json
data = json.loads('["foo", {"bar": ["baz", null, 1.0, 2]}]')
print(data[0])
print(data[1]["bar"][0], data[1]["bar"][2])
