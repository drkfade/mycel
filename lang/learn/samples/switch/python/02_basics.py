# Variables, types, and functions in Python
language: str = "Python"
counter: int = 0
counter += 3

def greet(who: str, times: int = 1) -> str:
    return f"hi {who} x{times}"

square = lambda n: n * n

print(language, counter)
print(greet("Ada", times=2))
print(square(6))
