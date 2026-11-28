class Stack:
    def __init__(self, limit: int = 10):
        self.stack = []
        self.limit = limit

    def push(self, data: int) -> None:
        if len(self.stack) >= self.limit:
            raise OverflowError("Stack overflow")
        self.stack.append(data)

    def pop(self) -> int:
        return self.stack.pop()

    def peek(self) -> int:
        return self.stack[-1]

    def is_empty(self) -> bool:
        return len(self.stack) == 0

s = Stack(5)
for i in range(4):
    s.push(i * 10)
print(s.peek(), s.pop(), s.is_empty())
print(s.stack)
