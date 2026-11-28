def parse_all(items):
    ok = []
    bad = 0
    for it in items:
        try:
            ok.append(int(it))
        except ValueError:
            bad += 1
    return ok, bad

nums, errors = parse_all(["1", "two", "3", "", "42"])
print(nums, errors)
print(sum(nums) // 2, sum(nums) % 7, -sum(nums) // 4)
