class Shape:
    def __init__(self, name):
        self.name = name

    def area(self):
        return 0.0

class Rect(Shape):
    def __init__(self, w, h):
        super().__init__("rect")
        self.w = w
        self.h = h

    def area(self):
        return self.w * self.h

shapes = [Rect(2, 3), Rect(4, 5)]
total = 0
for s in shapes:
    print(s.name, s.area())
    total += s.area()
print("total", total)
