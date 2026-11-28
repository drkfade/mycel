def generate_ints(n):
    for i in range(n):
        yield i

gen = generate_ints(4)
print(next(gen))
print(next(gen))
print(list(gen))
