with open('log.txt', 'w') as f:
    f.write('start\n')
with open('log.txt', 'a') as f:
    f.write('next\n')
with open('log.txt', 'r') as f:
    print(f.read(), end='')
