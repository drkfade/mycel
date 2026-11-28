def greet(name, greeting="Hello", punct="!"):
    return f"{greeting}, {name}{punct}"

print(greet("Ann"))
print(greet("Ben", "Hi"))
print(greet("Cy", punct="?"))
nums = [5, 3, 8, 1]
nums.sort()
print(nums, nums[0], nums[-1])
nums.reverse()
print(nums)
