import sys
import requests

payload = {'key1': 'value1', 'key2': 'value2'}
r = requests.get(sys.argv[1] + "/echo", params=payload, timeout=5)
info = r.json()
print(info["query"]["key1"], info["query"]["key2"])
