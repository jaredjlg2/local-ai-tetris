$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv-von\Scripts\python.exe')) {
    python -m venv .venv-von
    if ($LASTEXITCODE) { throw 'Could not create the Von Python environment. Python 3.12+ is required.' }
}
& .\.venv-von\Scripts\python.exe -m pip install -r von-requirements.lock.txt
if ($LASTEXITCODE) { throw 'Von dependency installation failed.' }
& .\.venv-von\Scripts\python.exe setup-von.py
if ($LASTEXITCODE) { throw 'Von model download failed.' }
Write-Host 'Von is installed. Restart the Tetris server to load it.'
