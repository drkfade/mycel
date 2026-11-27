# Removes only Mycel's installed payload and its exact user PATH entry.
& {
    $ErrorActionPreference = 'Stop'
    if ($env:OS -ne 'Windows_NT' -or -not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA on Windows is required.' }
    $root = Join-Path $env:LOCALAPPDATA 'Mycel'
    $bin = Join-Path $root 'bin'
    # User PATH is read and written raw through the registry. [Environment]::GetEnvironmentVariable('Path','User')
    # returns the expanded value and SetEnvironmentVariable writes REG_SZ, which would hard-code entries such as
    # %USERPROFILE%\AppData\Local\Microsoft\WindowsApps on every install, rollback and uninstall.
    function Test-MycelPathEntry([string]$entry, [string]$dir) {
        $e = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"')).TrimEnd('\')
        return $e -ieq $dir.TrimEnd('\')
    }
    # $null = not present (nothing to write); otherwise the raw value without Mycel's entries, all other entries kept.
    function Remove-MycelPathEntry([string]$raw, [string]$dir) {
        $entries = @($raw -split ';')
        $kept = @($entries | Where-Object { $_ -eq '' -or -not (Test-MycelPathEntry $_ $dir) })
        if ($kept.Count -eq $entries.Count) { return $null }
        # empty entries are the user's bytes (a trailing ';' included): kept, so install + uninstall round-trips exactly
        return ($kept -join ';')
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
    foreach ($dir in @($root, $bin)) {
        if ((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing redirected installation directory: $dir" }
    }
    # Delete an allow-list, so user projects or files placed beside the app survive.
    foreach ($name in @('mycel.exe', 'ply.cmd', 'LICENSE.txt', 'NODE-LICENSE.txt', 'README-windows.txt', 'install.ps1', 'uninstall.ps1')) {
        $file = Join-Path $bin $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force }
    }
    $userPath = Get-MycelUserPath
    $newUserPath = Remove-MycelPathEntry $userPath.Value $bin
    # Write only when Mycel's entry was there: an unchanged PATH is never rewritten.
    if ($null -ne $newUserPath) { Set-MycelUserPath ([pscustomobject]@{ Exists = ($newUserPath -ne ''); Value = $newUserPath; Kind = $userPath.Kind }) }
    $env:Path = (@($env:Path -split ';' | Where-Object { $_ -ne '' -and -not (Test-MycelPathEntry $_ $bin) }) -join ';')
    foreach ($dir in @($bin, $root)) {
        if ((Test-Path -LiteralPath $dir) -and @(Get-ChildItem -LiteralPath $dir -Force).Count -eq 0) { [IO.Directory]::Delete($dir) }
    }
    Write-Host 'Mycel uninstalled. Your programs and .ply registry were preserved.'
}
