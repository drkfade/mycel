import datetime as dt
d = dt.date(2002, 3, 11)
print(d.isoformat())
print(d.strftime("%d/%m/%y"))
print(d.strftime("%A %d. %B %Y"))
print(d.replace(year=2005).isoformat())
