nums = [3, -1, 4, -1, 5, -9, 2, 6]
best = cur = nums[0]
for x in nums[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print("max subarray sum:", best)
positives = list(filter(lambda x: x > 0, nums))
doubled = list(map(lambda x: x * 2, positives))
print(positives, doubled)
