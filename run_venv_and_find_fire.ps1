# Create .venv, install deps, run find-fire script for GEE.
# Requires: Python 3 on PATH (install from https://www.python.org/downloads/ and check "Add to PATH").
$ErrorActionPreference = "Stop"
$proj = $PSScriptRoot
Set-Location $proj

$py = $null
foreach ($name in @("python", "python3", "py")) {
    $c = Get-Command $name -ErrorAction SilentlyContinue
    if ($c) { $py = $c.Name; break }
}
if (-not $py) {
    Write-Host "Python not found. Install from https://www.python.org/downloads/ and add to PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Using: $py" -ForegroundColor Cyan
if (-not (Test-Path ".venv")) {
    Write-Host "Creating .venv..." -ForegroundColor Cyan
    & $py -m venv .venv
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$activate = Join-Path $proj ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $activate)) {
    Write-Host ".venv\Scripts\Activate.ps1 not found." -ForegroundColor Red
    exit 1
}
. $activate
Write-Host "Installing pystac-client geopandas requests..." -ForegroundColor Cyan
pip install --quiet pystac-client geopandas requests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Running run_find_fire_for_gee.py..." -ForegroundColor Cyan
python scripts/run_find_fire_for_gee.py
exit $LASTEXITCODE
