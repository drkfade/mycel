# Python tutorial: string indexing and slicing
word = 'Python'
print(word[0], word[5])
print(word[-1], word[-2], word[-6])
print(word[0:2], word[2:5])
print(word[:2], word[4:], word[-2:])
print(word[:2] + word[2:])
print(word[4:42], repr(word[42:]))
print('J' + word[1:], word[:2] + 'py')
