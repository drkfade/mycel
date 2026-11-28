def parse_ratio(a, b):
    try:
        x = int(a)
        y = int(b)
        if y == 0:
            raise ValueError("zero denominator")
        return x / y
    except ValueError as e:
        print("Bad input:", e)
        return None

print(parse_ratio("10", "4"))
print(parse_ratio("ten", "4"))
print(parse_ratio("10", "0"))
