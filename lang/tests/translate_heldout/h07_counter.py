class Counter:
    def __init__(self):
        self.counts = {}

    def add(self, item):
        self.counts[item] = self.counts.get(item, 0) + 1

    def most_common(self):
        return max(self.counts, key=self.counts.get)

c = Counter()
for x in "mississippi":
    c.add(x)
print(c.most_common(), c.counts["s"], len(c.counts))
