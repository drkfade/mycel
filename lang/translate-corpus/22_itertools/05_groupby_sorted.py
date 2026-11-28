from itertools import groupby
data = [('a', 1), ('a', 2), ('b', 3), ('b', 4)]
for k, g in groupby(data, lambda x: x[0]):
    print(k, list(g))
