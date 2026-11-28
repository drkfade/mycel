try:
    with open('does_not_exist.txt', 'r') as f:
        print(f.read())
except Exception:
    print('cannot open missing file')
