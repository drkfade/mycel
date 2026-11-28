grades = {"ann": [90, 85, 77], "ben": [60, 72], "cat": [100]}
for name in sorted(grades):
    g = grades[name]
    avg = sum(g) / len(g)
    status = "pass" if avg >= 70 else "fail"
    print(f"{name:<5}{avg:6.1f} {status}")
best = max(grades, key=lambda n: sum(grades[n]) / len(grades[n]))
print("best:", best)
