def digit_sum(n):
    total = 0
    while n > 0:
        total += n % 10
        n //= 10
    return total

for x in [0, 7, 123, 9999]:
    print(x, digit_sum(x))
print(sum(int(d) for d in str(2 ** 15)))
