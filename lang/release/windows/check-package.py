"""Independent ZIP reader/CRC/license/hash verification. Never executes the PE."""
from pathlib import Path
import hashlib
import json
import re
import tempfile
import zipfile

release = Path(__file__).resolve().parents[1]
dist = release / 'dist'
name = 'Mycel-0.1.0-alpha-windows-x64.zip'
archive = dist / name
sha = lambda data: hashlib.sha256(data).hexdigest()
receipt = json.loads((release / 'work/windows/package-receipt.json').read_text())
expected = ['mycel.exe', 'ply.cmd', 'LICENSE.txt', 'NODE-LICENSE.txt', 'README-windows.txt', 'install.ps1', 'uninstall.ps1']
assert sha(archive.read_bytes()) == receipt['sha256']
assert (dist / (name + '.sha256')).read_text() == f"{receipt['sha256']}  {name}\n"
with zipfile.ZipFile(archive) as z:
    assert z.namelist() == expected, z.namelist()
    assert z.testzip() is None
    with tempfile.TemporaryDirectory(prefix='mycel-zip-verify-') as directory:
        z.extractall(directory)
        for file in expected:
            data = (Path(directory) / file).read_bytes()
            assert sha(data) == receipt['files'][file], file
            source = dist / file if file == 'mycel.exe' else release / file if file in ('LICENSE.txt', 'NODE-LICENSE.txt') else release / 'windows' / file
            if file != 'ply.cmd':
                assert data == source.read_bytes(), file
        # Independent of license.mjs: the shipped licence carries both full texts verbatim and no old EULA.
        shipped = (Path(directory) / 'LICENSE.txt').read_text()
        for part in ('LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE'):
            assert (release.parent / part).read_text().rstrip() in shipped, f'LICENSE.txt lacks {part}'
        for word in ('DRAFT', 'proprietary', 'Proprietary', 'End-User License'):
            assert word not in shipped, f'LICENSE.txt still says {word!r}'
        assert (Path(directory) / 'ply.cmd').read_bytes() == b'@echo off\r\n"%~dp0mycel.exe" %*\r\n'
bootstrap = (dist / 'install.ps1').read_text()
assert f"$expected = '{receipt['sha256']}'" in bootstrap
assert re.search(r'^\s*exit\b', bootstrap, re.I | re.M) is None
assert '@ZIP_SHA256@' not in bootstrap
print(f"PASS: ZIP CRC/extraction, exact seven files, Apache-2.0 OR MIT licence, executable identity, shim and pinned bootstrap hash.\n{receipt['sha256']}  {name}")
