# Lists, dicts, comprehensions, and regex extraction in Python
import re

nums = [2, 6, 3, 9, 4, 8]
big = [x for x in nums if x > 5]
doubled = [x * 2 for x in big]
total = sum(big)
print(f"big={big}, doubled={doubled}, total={total}")

scores = {"ana": 91, "bo": 78}
for i, item in enumerate(["tea", "cake"]):
    print(f"{i}: {item}")
print(scores.get("zoe", 0), "ana" in scores)

text = "tea 4, cake 9, coffee 6"
amounts = [int(n) for n in re.findall(r"\d+", text) if int(n) > 5]
print(amounts)
