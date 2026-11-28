import json
print(json.dumps([1, 2, 3, {'4': 5, '6': 7}], separators=(',', ':')))
print(json.dumps({'6': 7, '4': 5}, sort_keys=True, indent=4))
