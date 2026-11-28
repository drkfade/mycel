from operator import itemgetter

data = [('red', 1), ('blue', 1), ('red', 2), ('blue', 2)]
print(sorted(data, key=itemgetter(0)))
print(sorted(data, key=itemgetter(0), reverse=True))
