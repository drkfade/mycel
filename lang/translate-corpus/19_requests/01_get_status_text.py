import sys
import requests

url = sys.argv[1]
r = requests.get(url, timeout=5)
print(r.status_code)
print(r.text.strip())
