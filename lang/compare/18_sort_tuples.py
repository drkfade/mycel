people = [("bo", 31), ("ana", 25), ("cy", 40)]
for name, age in sorted(people, key=lambda p: p[1]):
    print(name, age)
