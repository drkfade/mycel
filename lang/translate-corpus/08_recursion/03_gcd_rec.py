def greatest_common_divisor(a: int, b: int) -> int:
    return abs(a) if b == 0 else greatest_common_divisor(b, a % b)

print(greatest_common_divisor(24, 40))
print(greatest_common_divisor(48, 18))
print(greatest_common_divisor(7, 13))
