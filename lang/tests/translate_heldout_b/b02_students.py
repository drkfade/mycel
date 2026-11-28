class Student:
    def __init__(self, name, scores):
        self.name = name
        self.scores = scores

    def average(self):
        return sum(self.scores) / len(self.scores)

    def __str__(self):
        return f"{self.name} ({self.average():.1f})"

students = [Student("Ann", [90, 80]), Student("Bob", [70, 75, 80])]
for s in sorted(students, key=lambda s: s.average(), reverse=True):
    print(s)
