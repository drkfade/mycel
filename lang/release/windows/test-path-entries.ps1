# Unit tests for the user-PATH editing that install.ps1/uninstall.ps1 ship. Loads the functions from the scripts' own
# AST (no copy), so it runs on any pwsh (macOS included) and on Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
function Import-ScriptFunction([string]$file, [string]$name) {
    $tokens = $null; $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw ($errors | Out-String) }
    $fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
    if (-not $fn) { throw "$name not found in $file" }
    . ([ScriptBlock]::Create($fn.Extent.Text.Replace("function $name", "function global:$name")))
}
Import-ScriptFunction (Join-Path $PSScriptRoot 'install.ps1') 'Test-MycelPathEntry'
Import-ScriptFunction (Join-Path $PSScriptRoot 'install.ps1') 'Add-MycelPathEntry'
Import-ScriptFunction (Join-Path $PSScriptRoot 'uninstall.ps1') 'Remove-MycelPathEntry'
$script:fails = 0; $script:count = 0
function Assert-Equal($want, $got, $name) { $script:count++; if (-not ($want -ceq $got)) { $script:fails++; Write-Output "FAIL $name`n  want: [$want]`n  got:  [$got]" } }
$env:MYCEL_T_HOME = 'C:\Users\Ana'
$bin = 'C:\Users\Ana\AppData\Local\Mycel\bin'
$raw = '%USERPROFILE%\AppData\Local\Microsoft\WindowsApps;%MYCEL_T_HOME%\.dotnet\tools;"C:\Program Files\x"'
# install: append keeps every other byte (no expansion of %VARS%), and repeat installs write nothing
Assert-Equal "$raw;$bin" (Add-MycelPathEntry $raw $bin) 'append keeps unexpanded entries'
Assert-Equal "a;$bin;" (Add-MycelPathEntry 'a;' $bin) 'trailing separator stays last'
Assert-Equal $bin (Add-MycelPathEntry '' $bin) 'empty PATH'
Assert-Equal $null (Add-MycelPathEntry "$raw;$bin" $bin) 'already present'
Assert-Equal $null (Add-MycelPathEntry "x;C:\USERS\ana\AppData\Local\Mycel\BIN\" $bin) 'present: case and trailing slash'
Assert-Equal $null (Add-MycelPathEntry 'x;%MYCEL_T_HOME%\AppData\Local\Mycel\bin' $bin) 'present: written with a variable'
Assert-Equal $null (Add-MycelPathEntry "x;`"$bin`"" $bin) 'present: quoted'
Assert-Equal "C:\Users\Ana\AppData\Local\Mycel\binx;$bin" (Add-MycelPathEntry 'C:\Users\Ana\AppData\Local\Mycel\binx' $bin) 'a sibling prefix is not the entry'
# uninstall: removes only Mycel's entries (every spelling), keeps the rest raw, and reports "nothing to do" as $null
Assert-Equal $raw (Remove-MycelPathEntry "$raw;$bin" $bin) 'remove keeps unexpanded entries'
Assert-Equal 'a;b' (Remove-MycelPathEntry "a;C:\users\ana\appdata\local\mycel\bin\;b;%MYCEL_T_HOME%\AppData\Local\Mycel\bin" $bin) 'remove every spelling'
Assert-Equal $null (Remove-MycelPathEntry $raw $bin) 'absent: no rewrite'
Assert-Equal '' (Remove-MycelPathEntry $bin $bin) 'only entry'
Assert-Equal 'a;;b' (Remove-MycelPathEntry "a;;$bin;b" $bin) 'remove keeps the user''s empty entries'
# install then uninstall restores the raw value exactly (first real-Windows CI run: a trailing ';' was lost)
foreach ($before in @('a', 'a;', "$raw;", ';', 'a;;b')) { Assert-Equal $before (Remove-MycelPathEntry (Add-MycelPathEntry $before $bin) $bin) "round trip [$before]" }
Remove-Item Env:\MYCEL_T_HOME
Write-Output "$($script:count - $script:fails)/$($script:count) PATH entry tests pass ($($PSVersionTable.PSVersion))"
if ($script:fails) { throw "$($script:fails) PATH entry test(s) failed" }
