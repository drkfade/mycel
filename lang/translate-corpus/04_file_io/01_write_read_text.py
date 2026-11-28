with open('workfile.txt', 'w') as f:
    f.write('This is a test\n')
    f.write('Second line\n')

with open('workfile.txt', 'r') as f:
    read_data = f.read()
print(read_data, end='')
