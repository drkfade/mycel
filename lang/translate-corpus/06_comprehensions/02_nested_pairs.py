combs = [(x, y) for x in [1, 2, 3] for y in [3, 1, 4] if x != y]
print(combs)
vec = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flat = [num for elem in vec for num in elem]
print(flat)
