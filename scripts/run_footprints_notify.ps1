# Run footprint fetch and show a notification when complete.
# Usage: .\scripts\run_footprints_notify.ps1
# Or: pwsh -File scripts/run_footprints_notify.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ProjectRoot

Write-Host "Running csdap_planet_umbra_footprints.py ..."
& py scripts/csdap_planet_umbra_footprints.py
$exitCode = $LASTEXITCODE

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
    "Footprint fetch finished with exit code $exitCode.",
    "csda-fire"
)
exit $exitCode
