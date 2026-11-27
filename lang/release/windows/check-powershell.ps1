# Parse without running installers; also rejects statements that could close an iex shell.
$ErrorActionPreference = 'Stop'
$release = Split-Path -Parent $PSScriptRoot
$files = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1')
if (Test-Path -LiteralPath (Join-Path $release 'dist/install.ps1')) { $files += Get-Item -LiteralPath (Join-Path $release 'dist/install.ps1') }
foreach ($file in $files) {
    $tokens = $null; $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw ($errors | Out-String) }
    $exits = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.ExitStatementAst] }, $true)
    if ($exits.Count) { throw "Forbidden shell-closing statement in $file" }
    Write-Output "PASS parse/no-exit: $($file.Name)"
}
