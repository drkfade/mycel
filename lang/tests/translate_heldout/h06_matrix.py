def matmul(a, b):
    n, m, p = len(a), len(b), len(b[0])
    return [[sum(a[i][k] * b[k][j] for k in range(m)) for j in range(p)] for i in range(n)]

a = [[1, 2], [3, 4]]
b = [[5, 6], [7, 8]]
for row in matmul(a, b):
    print(" ".join(str(x) for x in row))
