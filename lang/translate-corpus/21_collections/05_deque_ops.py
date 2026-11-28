from collections import deque
d = deque('ghi')
d.append('j')
d.appendleft('f')
print(list(d))
print(d.pop(), d.popleft())
print(list(d))
