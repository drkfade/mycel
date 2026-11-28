sentence = "The quick brown fox jumps over the lazy dog"
words = sentence.lower().split()
lengths = {w: len(w) for w in words}
longest = max(words, key=len)
print(longest, lengths[longest])
print(sorted(set(len(w) for w in words)))
