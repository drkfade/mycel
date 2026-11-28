s = "Hello, World"
print(s.lower(), s.upper(), s.count("l"), s.find("World"), s.find("xyz"))
print(s.replace("l", "L"), s.startswith("Hell"), s[7:], s[:5], s[-5:])
words = s.split(", ")
print(words, "-".join(reversed(words)))
print(s.isalpha(), "abc".isalpha(), "123".isdigit())
