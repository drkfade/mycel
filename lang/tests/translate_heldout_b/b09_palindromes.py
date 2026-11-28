def is_palindrome(s):
    cleaned = "".join(c.lower() for c in s if c.isalnum())
    return cleaned == cleaned[::-1]

tests = ["A man, a plan, a canal: Panama", "hello", "Was it a car or a cat I saw?"]
for t in tests:
    print(is_palindrome(t))
