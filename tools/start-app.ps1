param([int]$Port = 4173)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (!(Test-Path -LiteralPath $pythonRuntime)) {
  $pythonRuntime = (Get-Command python -ErrorAction Stop).Source
}
Push-Location $projectRoot
try {
  Write-Host "매출 앱: http://127.0.0.1:$Port"
  & $pythonRuntime -m http.server $Port --bind 127.0.0.1
} finally {
  Pop-Location
}
