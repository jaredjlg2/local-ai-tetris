$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tetrisNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $tetrisNode) { throw 'Install Node.js 20 or newer and add it to PATH, then reopen the terminal.' }
$tetrisNodePath = $tetrisNode.Source
Write-Host 'Open http://127.0.0.1:8776 in your browser. Keep this terminal open; Ctrl+C stops the game server.'
& $tetrisNodePath server.js
