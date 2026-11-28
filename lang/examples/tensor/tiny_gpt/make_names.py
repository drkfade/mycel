# Writes names.txt: made-up names built from syllables with a fixed seed (so the file is reproducible).
import random
random.seed(11)
onsets = ["", "b", "br", "c", "d", "dr", "f", "g", "gl", "h", "j", "k", "l", "m", "n", "p", "r", "s", "sh", "t", "th", "v", "w", "z"]
vowels = ["a", "e", "i", "o", "u", "ai", "ea", "ia", "io"]
codas = ["", "", "", "l", "n", "r", "s", "th", "m", "nd", "rn", "x"]
endings = ["a", "o", "en", "is", "or", "el", "an", "ia", "in", "ar", "us", "ee"]

def name():
    n = random.choice([2, 2, 3])
    s = ""
    for i in range(n - 1):
        s += random.choice(onsets if i else onsets[1:]) + random.choice(vowels) + random.choice(codas)
    s += random.choice(onsets[1:]) + random.choice(endings)
    return s

names = set()
while len(names) < 1000:
    n = name()
    if 4 <= len(n) <= 9:
        names.add(n)
names = sorted(names)
random.shuffle(names)
open("names.txt", "w").write("\n".join(names) + "\n")
print(len(names), sum(len(n) + 1 for n in names), "characters")
