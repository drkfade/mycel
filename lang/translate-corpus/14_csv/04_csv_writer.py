import csv
with open('out.csv', 'w', newline='') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(['item', 'qty'])
    writer.writerow(['apple', 3])
    writer.writerow(['pear', 5])
with open('out.csv', newline='') as csvfile:
    for row in csv.reader(csvfile):
        print(','.join(row))
