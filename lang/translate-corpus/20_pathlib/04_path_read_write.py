from pathlib import Path
p = Path('note.txt')
p.write_text('hello pathlib\n')
print(p.read_text(), end='')
