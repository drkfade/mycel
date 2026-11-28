from dataclasses import dataclass

@dataclass
class CounterBox:
    x: int
    z: int = 5

    def add_one(self) -> int:
        return self.x + 1

c = CounterBox(10)
print(c.x, c.z, c.add_one())
