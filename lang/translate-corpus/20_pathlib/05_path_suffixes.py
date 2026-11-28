from pathlib import PurePosixPath
p = PurePosixPath('/srv/holy/grail.tar.gz')
print(p.name, p.stem, p.suffix, p.suffixes)
