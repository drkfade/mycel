from dataclasses import dataclass

@dataclass
class Point:
    x: int
    y: int

@dataclass
class PathPoints:
    points: list[Point]

p = Point(10, 20)
print(p.x, p.y)
c = PathPoints([Point(0, 0), Point(10, 4)])
print(len(c.points), c.points[1].x)
