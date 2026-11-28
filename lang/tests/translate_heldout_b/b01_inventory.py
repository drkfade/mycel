inventory = {"apples": 5, "pears": 0, "plums": 12}
for item, qty in inventory.items():
    if qty == 0:
        print(f"{item}: out of stock")
    elif qty < 10:
        print(f"{item}: low ({qty})")
    else:
        print(f"{item}: ok")
restock = [k for k, v in inventory.items() if v < 10]
print("restock:", restock)
