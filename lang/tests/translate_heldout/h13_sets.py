a = {"apple", "banana", "cherry"}
b = {"banana", "kiwi"}
print(sorted(a | b))
print(sorted(a & b), sorted(a - b))
print("kiwi" in b, "kiwi" in a, len(a))
seen = set()
for x in [3, 1, 3, 2, 1]:
    seen.add(x)
print(sorted(seen))
