import datetime as dt
t1 = dt.datetime.fromisoformat('2011-11-04T00:05:23')
print(t1.isoformat())
print(t1.hour, t1.minute, t1.second)
