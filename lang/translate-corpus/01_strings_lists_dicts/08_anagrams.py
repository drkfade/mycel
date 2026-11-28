def is_anagram(first: str, second: str) -> bool:
    return sorted(first.replace(" ", "").lower()) == sorted(second.replace(" ", "").lower())

print(is_anagram("listen", "silent"))
print(is_anagram("Dormitory", "Dirty room"))
print(is_anagram("python", "typhon"))
print(is_anagram("hello", "world"))
