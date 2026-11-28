# Mycel 0.2 alpha Windows x64. Publish this rendered script only after review.
# Usage: irm https://ol1x.xyz/mycel/install.ps1 | iex
& {
    $ErrorActionPreference = 'Stop'
    $temporary = $null
    $oldTls = [Net.ServicePointManager]::SecurityProtocol
    try {
        if ($env:OS -ne 'Windows_NT') { throw 'Mycel requires Windows.' }
        if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { throw 'This installer requires Windows x64.' }
        [Net.ServicePointManager]::SecurityProtocol = $oldTls -bor [Net.SecurityProtocolType]::Tls12
        $temporary = Join-Path ([IO.Path]::GetTempPath()) ('mycel-' + [Guid]::NewGuid().ToString('N'))
        [IO.Directory]::CreateDirectory($temporary) | Out-Null
        $archive = Join-Path $temporary 'mycel.zip'
        $url = 'https://ol1x.xyz/mycel/download/Mycel-0.2.0-alpha-windows-x64.zip'
        $expected = '@ZIP_SHA256@'
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
        $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
        if ($actual -ine $expected) { throw "Mycel download SHA-256 mismatch. Expected $expected; got $actual. Nothing installed." }
        # Check entry names before extraction. Hash validation precedes any payload execution.
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            $wanted = @('mycel.exe', 'ply.cmd', 'LICENSE.txt', 'NODE-LICENSE.txt', 'README-windows.txt', 'install.ps1', 'uninstall.ps1')
            if ($zip.Entries.Count -ne $wanted.Count) { throw 'Unexpected package entry count.' }
            foreach ($entry in $zip.Entries) {
                if ($wanted -cnotcontains $entry.FullName -or $entry.Length -gt 200000000) { throw "Unexpected package entry: $($entry.FullName)" }
            }
            if (@($zip.Entries.FullName | Select-Object -Unique).Count -ne $wanted.Count) { throw 'Duplicate package entries.' }
        } finally { $zip.Dispose() }
        $source = Join-Path $temporary 'payload'
        Expand-Archive -LiteralPath $archive -DestinationPath $source
        # A scriptblock works under the same policy as the caller's iex invocation;
        # no machine execution policy is changed and no elevation is requested.
        $installer = [ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $source 'install.ps1')))
        & $installer -SourceDir $source
    } catch {
        Write-Error "Mycel installation failed: $($_.Exception.Message)" -ErrorAction Continue
        return
    } finally {
        [Net.ServicePointManager]::SecurityProtocol = $oldTls
        if ($temporary -and (Test-Path -LiteralPath $temporary)) { Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
