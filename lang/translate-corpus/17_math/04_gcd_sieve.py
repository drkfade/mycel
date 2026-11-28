import math

def prime_sieve(num: int) -> list[int]:
    if num <= 0:
        raise ValueError("num must be positive")
    sieve = [True] * (num + 1)
    primes = []
    for i in range(2, num + 1):
        if sieve[i]:
            primes.append(i)
            for j in range(i * i, num + 1, i):
                sieve[j] = False
    return primes

print(prime_sieve(30))
print(math.gcd(84, 30))
