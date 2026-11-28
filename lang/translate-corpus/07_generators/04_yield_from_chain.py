def chain_lists(a, b):
    yield from a
    yield from b

print(list(chain_lists([1, 2, 3], [4, 5, 6])))
