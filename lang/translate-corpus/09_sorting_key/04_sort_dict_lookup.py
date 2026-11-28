students = ['dave', 'john', 'jane']
newgrades = {'john': 'F', 'jane': 'A', 'dave': 'C'}
print(sorted(students, key=lambda name: newgrades[name]))
