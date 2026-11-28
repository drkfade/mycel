def merge_sort(collection: list[int]) -> list[int]:
    def merge(left: list[int], right: list[int]) -> list[int]:
        result: list[int] = []
        while left and right:
            if right[0] < left[0]:
                result.append(right.pop(0))
            else:
                result.append(left.pop(0))
        return [*result, *left, *right]

    if len(collection) <= 1:
        return collection
    mid = len(collection) // 2
    return merge(merge_sort(collection[:mid]), merge_sort(collection[mid:]))

print(merge_sort([0, 5, 3, 2, 2]))
print(merge_sort([-2, -45, -5, 10]))
