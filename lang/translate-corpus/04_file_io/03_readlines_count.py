with open('notes.txt', 'r') as f:
    lines = f.readlines()
print('lines:', len(lines))
for line in lines:
    print(line.strip())
