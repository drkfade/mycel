def convert(value, unit):
    if unit == "C":
        return value * 9 / 5 + 32, "F"
    return (value - 32) * 5 / 9, "C"

for v, u in [(100, "C"), (32, "F"), (-40, "C")]:
    result, new_unit = convert(v, u)
    print(f"{v}{u} = {result:.1f}{new_unit}")
