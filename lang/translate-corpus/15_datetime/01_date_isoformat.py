import datetime as dt
d1 = dt.date.fromisoformat('2019-12-04')
d2 = dt.date.fromisoformat('20191204')
print(d1.isoformat(), d2.year, d2.month, d2.day)
