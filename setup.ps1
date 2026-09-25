$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 20+ (24 LTS recommended), including npm, first.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install npm with Node.js, then reopen your terminal.' }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Install Python 3.12 and add it to PATH first.' }
& python -c "import sys; assert sys.version_info >= (3,12), 'Python 3.12+ is required'"
if ($LASTEXITCODE) { throw 'Python 3.12+ is required.' }
& npm.cmd ci
if ($LASTEXITCODE) { throw 'Node dependency installation failed.' }
& node setup-model.js
if ($LASTEXITCODE) { throw 'Laya model installation failed.' }
& (Join-Path $PSScriptRoot 'setup-von.ps1')
Write-Host 'Setup complete. Run .\start.ps1 or npm start, then open http://127.0.0.1:8776.'
