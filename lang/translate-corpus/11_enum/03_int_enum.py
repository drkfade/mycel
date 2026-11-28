from enum import IntEnum

class Number(IntEnum):
    ONE = 1
    TWO = 2
    THREE = 3

print(Number.ONE + Number.TWO)
print(Number.THREE + 5)
print(Number.THREE == 3)
