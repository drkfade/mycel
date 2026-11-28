import sys
import requests

url = sys.argv[1] + "/json"
r = requests.get(url, timeout=5)
data = r.json()
print(r.status_code, data["ok"], data["count"])
