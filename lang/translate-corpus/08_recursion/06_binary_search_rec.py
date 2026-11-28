def binary_search_rec(arr: list[int], item: int, left: int, right: int) -> int:
    if right < left:
        return -1
    mid = left + (right - left) // 2
    if arr[mid] == item:
        return mid
    if arr[mid] > item:
        return binary_search_rec(arr, item, left, mid - 1)
    return binary_search_rec(arr, item, mid + 1, right)

xs = [0, 5, 7, 10, 15]
print(binary_search_rec(xs, 10, 0, len(xs) - 1))
print(binary_search_rec(xs, 6, 0, len(xs) - 1))
