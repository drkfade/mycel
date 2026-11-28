class Animal:
    def __init__(self, name, sound):
        self.name = name
        self.sound = sound

    def speak(self):
        return f"{self.name} says {self.sound}"

class Dog(Animal):
    def __init__(self, name):
        super().__init__(name, "woof")

    def fetch(self):
        return f"{self.name} fetches!"

d = Dog("Rex")
print(d.speak())
print(d.fetch())
pets = [Animal("Tom", "meow"), d]
print([p.name for p in pets])
