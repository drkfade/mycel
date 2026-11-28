import sys
import requests

r = requests.get(sys.argv[1] + "/json", timeout=5)
print(r.headers["content-type"])
