data = [("a", 3), ("b", 1), ("c", 2)]
by_value = sorted(data, key=lambda t: t[1])
print([name for name, _ in by_value])
print(dict(data) if False else {k: v * 10 for k, v in data})
total = 0
for name, value in data:
    if value > 1:
        total += value
print(total, any(v > 2 for _, v in data), all(v > 0 for _, v in data))
