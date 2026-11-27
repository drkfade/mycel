import json
data = json.loads('{"name": "Ada", "langs": ["py", "myc"]}')
print(data["name"], len(data["langs"]))
print(json.dumps({"ok": True}))
