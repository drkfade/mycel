# Run on disposable Windows CI users only. User PATH is restored even on failure.
param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Bootstrap)
$ErrorActionPreference = 'Stop'
$Archive = (Resolve-Path -LiteralPath $Archive).Path
$Bootstrap = (Resolve-Path -LiteralPath $Bootstrap).Path
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('mycel-install-test-' + [Guid]::NewGuid().ToString('N'))
$oldLocal = $env:LOCALAPPDATA
# Raw registry value + kind: the [Environment] User API expands %VARS% and writes REG_SZ, so it cannot restore exactly.
function Get-RawUserPath {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
    try {
        if ($null -eq $key -or $null -eq $key.GetValue('Path')) { return [pscustomobject]@{ Exists = $false; Value = ''; Kind = [Microsoft.Win32.RegistryValueKind]::ExpandString } }
        [pscustomobject]@{ Exists = $true; Value = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); Kind = $key.GetValueKind('Path') }
    } finally { if ($key) { $key.Dispose() } }
}
function Set-RawUserPath($state) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
    try { if ($state.Exists) { $key.SetValue('Path', $state.Value, $state.Kind) } else { $key.DeleteValue('Path', $false) } } finally { $key.Dispose() }
}
$oldUserPath = Get-RawUserPath
$oldPath = $env:Path
function Assert-True($value, $message) { if (-not $value) { throw $message } }
try {
    [IO.Directory]::CreateDirectory($temporary) | Out-Null
    $source = Join-Path $temporary 'payload'
    Expand-Archive -LiteralPath $Archive -DestinationPath $source
    $env:LOCALAPPDATA = Join-Path $temporary 'local space Ω'
    $bin = Join-Path $env:LOCALAPPDATA 'Mycel\bin'
    $script:downloadArchive = $Archive
    # Seed an unexpanded entry, as Windows' own default user PATH has (%USERPROFILE%\AppData\Local\Microsoft\WindowsApps).
    $seeded = '%USERPROFILE%\mycel-ci-probe' + $(if ($oldUserPath.Value) { ';' + $oldUserPath.Value } else { '' })
    Set-RawUserPath ([pscustomobject]@{ Exists = $true; Value = $seeded; Kind = [Microsoft.Win32.RegistryValueKind]::ExpandString })
    # Both bootstrap executions use the staged archive; this test never contacts production.
    function Invoke-WebRequest { param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile) Copy-Item -LiteralPath $script:downloadArchive -Destination $OutFile }
    $bootstrapCode = [ScriptBlock]::Create([IO.File]::ReadAllText($Bootstrap))
    & $bootstrapCode
    Assert-True ([IO.File]::Exists((Join-Path $bin 'mycel.exe'))) 'Bootstrap did not install the executable.'
    Assert-True ((& (Join-Path $bin 'mycel.exe') --version) -eq 'mycel 0.2.1') 'Installed executable failed.'
    Assert-True ($LASTEXITCODE -eq 0) 'Installed executable returned failure.'
    $afterInstall = Get-RawUserPath
    Assert-True ($afterInstall.Kind -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) "Install changed the user PATH kind to $($afterInstall.Kind)."
    $wantInstall = if ($seeded.EndsWith(';')) { $seeded + $bin + ';' } else { $seeded + ';' + $bin }  # Add-MycelPathEntry's trailing-';' rule
    Assert-True ($afterInstall.Value -ceq $wantInstall) "Install did not append exactly one raw entry: $($afterInstall.Value) (seeded: $seeded)"
    Set-Content -LiteralPath (Join-Path $bin 'keep-user-file.txt') -Value 'preserve me'
    $installer = [ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $source 'install.ps1')))
    & $installer -SourceDir $source
    Assert-True ((Get-Content -LiteralPath (Join-Path $bin 'keep-user-file.txt') -Raw).Trim() -eq 'preserve me') 'Reinstall removed an unrelated file.'
    $entries = @([Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_.TrimEnd('\') -ieq $bin.TrimEnd('\') })
    Assert-True ($entries.Count -eq 1) 'Reinstall duplicated or omitted the PATH entry.'
    $uninstall = [ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $source 'uninstall.ps1')))
    & $uninstall
    Assert-True (-not [IO.File]::Exists((Join-Path $bin 'mycel.exe'))) 'Uninstall left the executable.'
    Assert-True ([IO.File]::Exists((Join-Path $bin 'keep-user-file.txt'))) 'Uninstall removed an unrelated file.'
    Assert-True (@([Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_.TrimEnd('\') -ieq $bin.TrimEnd('\') }).Count -eq 0) 'Uninstall left the user PATH entry.'
    $afterUninstall = Get-RawUserPath
    Assert-True ($afterUninstall.Value -ceq $seeded -and $afterUninstall.Kind -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) "Uninstall did not restore the raw user PATH: $($afterUninstall.Kind) $($afterUninstall.Value)"
    & $uninstall
    Assert-True ((Get-RawUserPath).Value -ceq $seeded) 'A second uninstall rewrote an unchanged PATH.'
    $script:downloadArchive = Join-Path $temporary 'tampered.zip'
    Copy-Item -LiteralPath $Archive -Destination $script:downloadArchive
    [IO.File]::AppendAllText($script:downloadArchive, 'tamper')
    $errors = @(& $bootstrapCode 2>&1)
    Assert-True (($errors | Out-String) -match 'SHA-256 mismatch') 'Tampered download was not rejected for its hash.'
    Assert-True (-not [IO.File]::Exists((Join-Path $bin 'mycel.exe'))) 'Tampered download installed an executable.'
    Write-Host 'PASS: bootstrap, offline reinstall, PATH dedup, raw REG_EXPAND_SZ PATH kept, uninstall preservation, tampered hash and shell survival.'
} finally {
    Set-RawUserPath $oldUserPath
    $env:Path = $oldPath
    $env:LOCALAPPDATA = $oldLocal
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
