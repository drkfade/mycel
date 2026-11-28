with open('data.txt', 'r') as f:
    for i, line in enumerate(f):
        if line.strip() == '':
            print(f'Blank line at line #{i}')
