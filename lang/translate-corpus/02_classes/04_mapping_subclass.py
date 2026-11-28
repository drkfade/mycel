class Mapping:
    def __init__(self, iterable):
        self.items_list = []
        for item in iterable:
            self.items_list.append(item)

    def count(self):
        return len(self.items_list)

class MappingSubclass(Mapping):
    def add_pair(self, key, value):
        self.items_list.append((key, value))

m = MappingSubclass([("a", 1), ("b", 2)])
m.add_pair("c", 3)
print(m.count(), m.items_list)
