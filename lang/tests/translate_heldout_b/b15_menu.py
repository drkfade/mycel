menu = {"coffee": 2.5, "tea": 1.75, "cake": 3.0}
order = ["coffee", "cake", "coffee", "water"]
total = 0.0
for item in order:
    if item in menu:
        total += menu[item]
    else:
        print(f"no {item} today")
print(f"total: ${total:.2f}")
print(f"items: {len(order)}, unique: {len(set(order))}")
