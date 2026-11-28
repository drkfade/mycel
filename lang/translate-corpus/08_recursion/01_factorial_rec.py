def factorial_recursive(number: int) -> int:
    if number < 0:
        raise ValueError("factorial_recursive() not defined for negative values")
    return 1 if number in {0, 1} else number * factorial_recursive(number - 1)

for n in [0, 1, 5, 7]:
    print(n, factorial_recursive(n))
