def validate(n):
    if n < 0:
        raise ValueError("must be non-negative")
    return n * 2

for v in [5, -3]:
    try:
        print(validate(v))
    except ValueError as err:
        print("Validation failed:", err)
