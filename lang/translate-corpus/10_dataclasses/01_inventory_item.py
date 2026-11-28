from dataclasses import dataclass

@dataclass
class InventoryItem:
    """Class for keeping track of an item in inventory."""
    name: str
    unit_price: float
    quantity_on_hand: int = 0

    def total_cost(self) -> float:
        return self.unit_price * self.quantity_on_hand

item = InventoryItem("widget", 3.5, 4)
print(item.name, item.total_cost())
item2 = InventoryItem("bolt", 1.25)
print(item2.quantity_on_hand, item2.total_cost())
