from enum import Enum

class Color(Enum):
    RED = 1
    GREEN = 2
    BLUE = 3

some_var = Color.RED
print(some_var.name, some_var.value)
print(Color.BLUE.name, Color.BLUE.value)
