class Student:
    def __init__(self, name, grade, age):
        self.name = name
        self.grade = grade
        self.age = age

    def __repr__(self):
        return f"Student({self.name}, {self.grade}, {self.age})"

s = Student('john', 'A', 15)
print(s)
print(s.name, s.grade, s.age)
