data = [4, 8, 15, 16, 23, 42]
n = len(data)
mean = sum(data) / n
var = sum((x - mean) ** 2 for x in data) / n
srt = sorted(data)
median = (srt[n // 2 - 1] + srt[n // 2]) / 2 if n % 2 == 0 else srt[n // 2]
print(f"mean={mean:.2f} var={var:.2f} median={median}")
