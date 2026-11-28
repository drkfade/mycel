from dataclasses import dataclass

@dataclass(frozen=True)
class Color:
    r: int
    g: int
    b: int

red = Color(255, 0, 0)
print(red.r, red.g, red.b)
print(red == Color(255, 0, 0))
