from pathlib import PurePosixPath
p = PurePosixPath('/usr/bin/python3')
print(p.name, p.parent.name, p.parts)
