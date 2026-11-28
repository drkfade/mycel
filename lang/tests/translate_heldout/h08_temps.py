readings = [21.5, 19.0, 25.25, 30.0, 18.75]
hot = [r for r in readings if r > 20]
print(f"{len(hot)} hot readings, max {max(readings)}, min {min(readings)}")
print(round(sum(readings) / len(readings), 2), round(2.5), round(3.5))
celsius = {c: c * 9 / 5 + 32 for c in [0, 10, 20]}
print(celsius)
