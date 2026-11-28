from math import sqrt, hypot
p = [1.0, 2.0, 3.0]
q = [4.0, 6.0, 3.0]
dist = sqrt(sum((px - qx) ** 2.0 for px, qx in zip(p, q)))
print(round(dist, 4), round(hypot(3.0, 4.0), 4))
