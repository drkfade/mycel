queue = []
queue.append("a")
queue.append("b")
queue.append("c")
first = queue.pop(0)
print(first, queue, len(queue))
queue.insert(0, "z")
print(queue, queue.index("b"))
