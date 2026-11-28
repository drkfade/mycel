import random
random.seed(11)
data = [41, 50, 29, 37, 81, 30, 73]
picked = random.choices(data, k=len(data))
print(sorted(picked))
