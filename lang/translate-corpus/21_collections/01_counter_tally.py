from collections import Counter
cnt = Counter()
for word in ['red', 'blue', 'red', 'green', 'blue', 'blue']:
    cnt[word] += 1
print(cnt['blue'], cnt['red'], cnt['yellow'])
print(cnt.most_common(2))
