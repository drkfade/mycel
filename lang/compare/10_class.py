class Dog:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return f"{self.name} says woof"

d = Dog("Rex")
print(d.speak())
