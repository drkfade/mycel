from pathlib import PurePosixPath
p = PurePosixPath('/etc')
q = p / 'init.d' / 'apache2'
print(str(q))
print(q.name, q.stem, q.suffix)
