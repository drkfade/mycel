import json
payload = {"title": "Holy Grail", "year": 1975, "tags": ["comedy", "classic"]}
with open("film.json", "w") as f:
    f.write(json.dumps(payload, sort_keys=True))
with open("film.json", "r") as f:
    loaded = json.loads(f.read())
print(loaded["title"], loaded["year"], len(loaded["tags"]))
