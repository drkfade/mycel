words = ['pear', 'fig', 'apple', 'banana', 'kiwi']
print(sorted(words, key=len))
print(sorted(words, key=lambda w: (-len(w), w)))
