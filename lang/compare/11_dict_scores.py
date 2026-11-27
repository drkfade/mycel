scores = {"ana": 91, "bo": 78, "cy": 85}
for name, score in scores.items():
    print(f"{name}: {score}")
print("best:", max(scores, key=scores.get))
