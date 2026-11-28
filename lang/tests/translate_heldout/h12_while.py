n = 27
steps = 0
while n != 1:
    if n % 2 == 0:
        n //= 2
    else:
        n = 3 * n + 1
    steps += 1
print("collatz steps:", steps)
i = 10
while True:
    i -= 3
    if i < 0:
        break
print(i)
