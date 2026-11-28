import csv
for row in csv.reader(['one,two,three', 'four,five,six']):
    print(row)
