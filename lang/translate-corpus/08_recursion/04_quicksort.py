def quick_sort(collection: list[int]) -> list[int]:
    if len(collection) < 2:
        return collection
    pivot = collection[0]
    lesser = [item for item in collection[1:] if item <= pivot]
    greater = [item for item in collection[1:] if item > pivot]
    return [*quick_sort(lesser), pivot, *quick_sort(greater)]

print(quick_sort([0, 5, 3, 2, 2]))
print(quick_sort([-2, 5, 0, -45]))
