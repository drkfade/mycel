import random
random.seed(123)
spins = random.choices(['red', 'black', 'green'], [18, 18, 2], k=6)
print(spins)
