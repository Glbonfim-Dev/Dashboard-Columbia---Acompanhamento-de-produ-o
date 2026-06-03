param(
  [int]$Port = 8787,
  [string]$Bind = "0.0.0.0",
  [string]$JsonPath = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$serverPath = Join-Path $projectRoot "dashboard_server.py"

if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
  throw "dashboard_server.py was not found at: $serverPath"
}

$localPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$pythonCommand = $null
$usePyLauncher = $false

if (Test-Path -LiteralPath $localPython -PathType Leaf) {
  $pythonCommand = [pscustomobject]@{ Source = $localPython }
} else {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
}

if (-not $pythonCommand -or ($pythonCommand.Source -like "*WindowsApps*")) {
  $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
  $usePyLauncher = $true
}

if (-not $pythonCommand) {
  throw "Python was not found. Install Python 3 or add it to PATH."
}

$serverArgs = @(
  $serverPath,
  "--host", $Bind,
  "--port", $Port
)

if (-not [string]::IsNullOrWhiteSpace($JsonPath)) {
  $serverArgs += @("--json", $JsonPath)
}

Write-Host "Starting dashboard backend..."
Write-Host "Frontend: http://localhost:$Port/"
Write-Host "API:      http://localhost:$Port/api/dashboard"
Write-Host "Status:   http://localhost:$Port/api/status"
Write-Host ""
Write-Host "For other users on the same network, use: http://<this-computer-ip>:$Port/"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

$env:PYTHONDONTWRITEBYTECODE = "1"

if ($usePyLauncher) {
  & $pythonCommand.Source -3 @serverArgs
} else {
  & $pythonCommand.Source @serverArgs
}
