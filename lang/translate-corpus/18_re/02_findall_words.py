import re
text = 'Words, words, words!'
words = re.findall(r'\w+', text)
print(words)
