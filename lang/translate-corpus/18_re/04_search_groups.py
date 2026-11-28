import re
m = re.search(r"(\d+)\.(\d+)", "24.1632")
if m:
    print(m.group(0), m.group(1), m.group(2))
