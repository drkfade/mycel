# Offline per-user installer shipped inside the verified Mycel archive.
param([string]$SourceDir = $PSScriptRoot)
& {
    param($SourceDir)
    $ErrorActionPreference = 'Stop'
    if ($env:OS -ne 'Windows_NT') { throw 'Mycel requires Windows.' }
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set.' }
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { throw 'This Mycel package requires Windows x64.' }
    $root = Join-Path $env:LOCALAPPDATA 'Mycel'
    $bin = Join-Path $root 'bin'
    $files = @('mycel.exe', 'ply.cmd', 'LICENSE.txt', 'NODE-LICENSE.txt', 'README-windows.txt', 'install.ps1', 'uninstall.ps1')
    foreach ($name in $files) {
        if (-not [IO.File]::Exists((Join-Path $SourceDir $name))) { throw "Missing package file: $name" }
    }
    # Check the payload before changing an existing install or PATH.
    $version = & (Join-Path $SourceDir 'mycel.exe') --version
    if ($LASTEXITCODE -ne 0 -or $version -ne 'mycel 0.2.0') { throw 'Mycel executable smoke test failed.' }
    # User PATH is read and written raw through the registry. [Environment]::GetEnvironmentVariable('Path','User')
    # returns the expanded value and SetEnvironmentVariable writes REG_SZ, which would hard-code entries such as
    # %USERPROFILE%\AppData\Local\Microsoft\WindowsApps on every install, rollback and uninstall.
    function Test-MycelPathEntry([string]$entry, [string]$dir) {
        $e = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"')).TrimEnd('\')
        return $e -ieq $dir.TrimEnd('\')
    }
    # $null = already present (nothing to write); otherwise the raw value with $dir appended, all other bytes kept.
    function Add-MycelPathEntry([string]$raw, [string]$dir) {
        foreach ($entry in @($raw -split ';')) { if ($entry -ne '' -and (Test-MycelPathEntry $entry $dir)) { return $null } }
        if ($raw -eq '') { return $dir }
        # keep a trailing ';' last, so uninstall (which drops only Mycel's entry) restores the raw value byte-for-byte;
        # 'a;' + dir used to come back as 'a' (first real-Windows CI run: the runner's user PATH ends with ';')
        if ($raw.EndsWith(';')) { return $raw + $dir + ';' }
        return $raw + ';' + $dir
    }
    $realWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
    function Get-MycelUserPath {
        if (-not $realWindows) { return [pscustomobject]@{ Exists = $false; Value = ''; Kind = 'ExpandString' } }
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
        try {
            if ($null -eq $key -or $null -eq $key.GetValue('Path')) { return [pscustomobject]@{ Exists = $false; Value = ''; Kind = [Microsoft.Win32.RegistryValueKind]::ExpandString } }
            return [pscustomobject]@{ Exists = $true; Value = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); Kind = $key.GetValueKind('Path') }
        } finally { if ($key) { $key.Dispose() } }
    }
    function Set-MycelUserPath($state) {
        if (-not $realWindows) { return }
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
        try {
            if (-not $state.Exists) { $key.DeleteValue('Path', $false) }
            else {
                $kind = $state.Kind
                if ($kind -ne [Microsoft.Win32.RegistryValueKind]::String -and $kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) { $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString }
                $key.SetValue('Path', [string]$state.Value, $kind)
            }
        } finally { $key.Dispose() }
        # A raw registry write does not notify Explorer; a User-scope set/clear broadcasts WM_SETTINGCHANGE so new
        # terminals inherit the PATH without signing out.
        $probe = 'MYCEL_PATH_REFRESH_' + [Guid]::NewGuid().ToString('N')
        [Environment]::SetEnvironmentVariable($probe, '1', 'User')
        [Environment]::SetEnvironmentVariable($probe, $null, 'User')
    }
    [IO.Directory]::CreateDirectory($root) | Out-Null
    # Refuse redirected installation directories rather than writing through junctions.
    foreach ($dir in @($root, $bin)) {
        if ((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing redirected installation directory: $dir" }
    }
    $stage = Join-Path $root ('stage-' + [Guid]::NewGuid().ToString('N'))
    $backup = Join-Path $root ('previous-' + [Guid]::NewGuid().ToString('N'))
    $oldUserPath = Get-MycelUserPath
    $pathChanged = $false
    $oldProcessPath = $env:Path
    $hadBin = Test-Path -LiteralPath $bin
    $backedUp = $false
    $swapped = $false
    # Move unrelated children intact (including directories/junctions), rather
    # than copying through links or deleting user files with the old payload.
    function Move-Unrelated($from, $to) {
        foreach ($item in @(Get-ChildItem -LiteralPath $from -Force)) {
            if ($files -notcontains $item.Name) { Move-Item -LiteralPath $item.FullName -Destination (Join-Path $to $item.Name) -ErrorAction Stop }
        }
    }
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    try {
        foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $SourceDir $name) -Destination (Join-Path $stage $name) }
        if ($hadBin) {
            [IO.Directory]::Move($bin, $backup); $backedUp = $true
            Move-Unrelated $backup $stage
        }
        [IO.Directory]::Move($stage, $bin); $swapped = $true
        # Preserve every existing PATH entry, and avoid duplicates on repeat installs.
        $newUserPath = Add-MycelPathEntry $oldUserPath.Value $bin
        if ($null -ne $newUserPath) {
            $pathChanged = $true
            Set-MycelUserPath ([pscustomobject]@{ Exists = $true; Value = $newUserPath; Kind = $oldUserPath.Kind })
        }
        $current = @($env:Path -split ';' | Where-Object { $_ -ne '' })
        if (-not (@($current | Where-Object { Test-MycelPathEntry $_ $bin }).Count -gt 0)) { $env:Path = ($current + $bin) -join ';' }
    } catch {
        if ($backedUp) {
            # Restore moved children before removing a failed replacement. If
            # recovery itself fails, leave both directories available to recover.
            if ($swapped) { Move-Unrelated $bin $backup }
            else { Move-Unrelated $stage $backup }
        }
        if ($swapped) {
            Remove-Item -LiteralPath $bin -Recurse -Force
        }
        if ($backedUp) { [IO.Directory]::Move($backup, $bin); $backedUp = $false }
        # restore the exact prior bytes and value kind, and only if this run changed them
        if ($pathChanged) { Set-MycelUserPath $oldUserPath }
        $env:Path = $oldProcessPath
        throw
    } finally {
        if (-not $backedUp -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
    Write-Host "Installed Mycel to $bin. Run mycel --version (new terminals also inherit the updated user PATH)."
} $SourceDir
