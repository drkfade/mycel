text = "it was the best of times it was the worst of times"
freq = {}
for word in text.split():
    freq[word] = freq.get(word, 0) + 1
top = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
for w, c in top[:3]:
    print(w, c)
print(len(freq), "distinct")
