# Demonstrate set operations on unique letters from two words
a = set('abracadabra')
b = set('alacazam')
print(sorted(a))
print(sorted(a - b))
print(sorted(a | b))
print(sorted(a & b))
print(sorted(a ^ b))
