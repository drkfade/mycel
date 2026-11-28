import random
random.seed(99)
rolls = [random.randint(1, 6) for _ in range(8)]
print(rolls, sum(rolls))
