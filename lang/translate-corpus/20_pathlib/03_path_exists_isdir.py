from pathlib import Path
p = Path('.')
q = p / 'hello.txt'
print(q.exists(), q.is_file(), p.is_dir())
