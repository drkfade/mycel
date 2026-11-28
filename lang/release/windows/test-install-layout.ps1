# Filesystem acceptance on Windows; on macOS only the version-check child is a
# synthetic executable. This does not prove Windows PE execution or user PATH.
param([string]$Installer = (Join-Path $PSScriptRoot 'install.ps1'))
$ErrorActionPreference = 'Stop'
$release = Split-Path -Parent $PSScriptRoot
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('mycel-layout-' + [Guid]::NewGuid().ToString('N'))
$saved = @{}
foreach ($key in @('OS', 'LOCALAPPDATA', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432', 'Path')) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
$windowsHost = $env:OS -eq 'Windows_NT'
# Raw registry bytes + kind (the [Environment] User API would expand %VARS% and write REG_SZ on restore).
$oldUserPath = $null
if ($windowsHost) {
    $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
    if ($k -and $null -ne $k.GetValue('Path')) { $oldUserPath = @([string]$k.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames), $k.GetValueKind('Path')) }
    if ($k) { $k.Dispose() }
}
function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
try {
    $source = Join-Path $temporary 'payload'
    [IO.Directory]::CreateDirectory($source) | Out-Null
    foreach ($name in @('LICENSE.txt', 'NODE-LICENSE.txt')) { Copy-Item -LiteralPath (Join-Path $release $name) -Destination $source }
    foreach ($name in @('README-windows.txt', 'uninstall.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $source }
    Copy-Item -LiteralPath $Installer -Destination (Join-Path $source 'install.ps1')
    [IO.File]::WriteAllText((Join-Path $source 'myc.cmd'), "@echo off`r`n`"%~dp0mycel.exe`" %*`r`n")
    [IO.File]::WriteAllText((Join-Path $source 'ply.cmd'), "@echo off`r`n`"%~dp0mycel.exe`" %*`r`n")
    $executable = Join-Path $source 'mycel.exe'
    if ($windowsHost) { Copy-Item -LiteralPath (Join-Path $release 'dist/mycel.exe') -Destination $executable }
    else {
        [IO.File]::WriteAllText($executable, "#!/bin/sh`nprintf 'mycel 0.2.1\n'`n")
        & /bin/chmod 755 $executable
        if ($LASTEXITCODE -ne 0) { throw 'Could not prepare synthetic child.' }
        $env:OS = 'Windows_NT'
        $env:PROCESSOR_ARCHITECTURE = 'AMD64'
        $env:PROCESSOR_ARCHITEW6432 = ''
    }
    $env:LOCALAPPDATA = Join-Path $temporary 'local space Ω'
    $bin = Join-Path (Join-Path $env:LOCALAPPDATA 'Mycel') 'bin'
    $code = [ScriptBlock]::Create([IO.File]::ReadAllText($Installer))
    & $code -SourceDir $source
    $userFile = Join-Path $bin 'user-notes.txt'
    $userDirectory = Join-Path $bin 'user-project'
    [IO.File]::WriteAllText($userFile, 'unrelated bytes Ω')
    [IO.Directory]::CreateDirectory($userDirectory) | Out-Null
    [IO.File]::WriteAllText((Join-Path $userDirectory 'source.myc'), 'print(42)')
    & $code -SourceDir $source
    Assert-True ([IO.File]::Exists($userFile)) 'Reinstall deleted an unrelated file.'
    Assert-True ([IO.File]::ReadAllText($userFile) -ceq 'unrelated bytes Ω') 'Reinstall changed unrelated bytes.'
    Assert-True ([IO.File]::ReadAllText((Join-Path $userDirectory 'source.myc')) -ceq 'print(42)') 'Reinstall lost a user directory.'
    # Fail after the first unrelated child moved: rollback must restore both the
    # old executable and every user child, rather than deleting the staging tree.
    $script:moves = 0
    function Move-Item {
        [CmdletBinding()] param([string]$LiteralPath, [string]$Destination)
        $script:moves++
        if ($script:moves -eq 2) { throw 'Injected preservation failure.' }
        Microsoft.PowerShell.Management\Move-Item @PSBoundParameters
    }
    $caught = $false
    try { & $code -SourceDir $source } catch {
        Assert-True ($_.Exception.Message -match 'Injected preservation failure') 'Unexpected rollback error.'
        $caught = $true
    } finally { Remove-Item Function:\Move-Item }
    Assert-True $caught 'Fault injection did not reach the replacement path.'
    Assert-True ([IO.File]::ReadAllText($userFile) -ceq 'unrelated bytes Ω') 'Rollback lost a user file.'
    Assert-True ([IO.File]::ReadAllText((Join-Path $userDirectory 'source.myc')) -ceq 'print(42)') 'Rollback lost a user directory.'
    Assert-True ((& (Join-Path $bin 'mycel.exe') --version) -eq 'mycel 0.2.1') 'Rollback lost the old executable.'
    Assert-True (@(Get-ChildItem -LiteralPath (Split-Path -Parent $bin) | Where-Object { $_.Name -ne 'bin' }).Count -eq 0) 'Install left staging/backup directories after recovery.'
    Write-Output "PASS: reinstall preserves unrelated file/directory bytes; injected mid-move failure restores old payload and user files ($($PSVersionTable.PSVersion), $windowsHost Windows host)."
} finally {
    if ($windowsHost) {
        $k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
        if ($oldUserPath) { $k.SetValue('Path', $oldUserPath[0], $oldUserPath[1]) } else { $k.DeleteValue('Path', $false) }
        $k.Dispose()
    }
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
