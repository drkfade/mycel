from itertools import chain, islice
print(list(chain('ABC', 'DEF')))
print(list(islice('ABCDEFG', 2, 5)))
