from enum import Enum

class Color(Enum):
    RED = 'red'
    GREEN = 'green'
    BLUE = 'blue'

def describe(color):
    if color == Color.RED:
        return "I see red!"
    elif color == Color.GREEN:
        return "Grass is green"
    else:
        return "I'm feeling the blues"

for c in [Color.RED, Color.GREEN, Color.BLUE]:
    print(c.value, describe(c))
