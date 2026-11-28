word = "programming"
counts = {}
for ch in word:
    counts[ch] = counts.get(ch, 0) + 1
dups = sorted(ch for ch, n in counts.items() if n > 1)
print(dups)
print("".join(sorted(set(word))))
print(word.upper()[:3], word[-3:], len(word))
