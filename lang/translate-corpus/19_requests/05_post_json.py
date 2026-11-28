import sys
import requests

r = requests.post(sys.argv[1] + "/echo", json={"hello": "mycel"}, timeout=5)
info = r.json()
print(r.status_code, info["method"], info["body"])
