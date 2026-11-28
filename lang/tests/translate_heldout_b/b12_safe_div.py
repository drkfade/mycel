def safe_div(a, b):
    if b == 0:
        return None
    return a / b

for a, b in [(10, 2), (1, 0), (7, 4)]:
    r = safe_div(a, b)
    if r is None:
        print(f"{a}/{b}: undefined")
    else:
        print(f"{a}/{b} = {r}")
