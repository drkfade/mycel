import random
random.seed(7)
deck = 'ace two three four'.split()
random.shuffle(deck)
print(deck)
print(random.sample([10, 20, 30, 40, 50], k=4))
