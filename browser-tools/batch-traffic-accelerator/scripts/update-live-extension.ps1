param(
    [string] $ExtensionId = "bhmhfpjlddpdjddliojgekelackinkmf"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$targetRoot = Join-Path $projectRoot "batch-traffic-demo"
if (-not (Test-Path -LiteralPath $targetRoot)) {
    throw "The installed extension directory does not exist: $targetRoot"
}

New-Item -ItemType Directory -Path (Join-Path $targetRoot "demo") -Force | Out-Null

foreach ($name in @(
    "manifest.json",
    "background.js",
    "PRD.md",
    "TECHNICAL_DESIGN.md",
    "AGENTS.md",
    "README.md",
    "IMPLEMENTATION_PATH.md"
)) {
    Copy-Item `
        -LiteralPath (Join-Path $projectRoot $name) `
        -Destination $targetRoot `
        -Force
}

foreach ($directory in @(
    "assets",
    "content",
    "sidepanel",
    "demo"
)) {
    Copy-Item `
        -Path (Join-Path $projectRoot "$directory\*") `
        -Destination (Join-Path $targetRoot $directory) `
        -Recurse `
        -Force
}

$bitBrowserProcessIds = @(
    Get-Process -Name "BitBrowser" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Id
)
if (-not $bitBrowserProcessIds.Count) {
    throw "BitBrowser is not running."
}

$candidatePorts = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $bitBrowserProcessIds -contains $_.OwningProcess } |
        Select-Object -ExpandProperty LocalPort -Unique |
        Sort-Object
)

$debugPort = $null
foreach ($port in $candidatePorts) {
    try {
        $targets = Invoke-RestMethod `
            -Uri "http://127.0.0.1:$port/json/list" `
            -TimeoutSec 1
        if ($targets | Where-Object {
            $_.url -eq "chrome://extensions/" -or
            $_.url -like "chrome-extension://$ExtensionId/*"
        }) {
            $debugPort = $port
            break
        }
    }
    catch {
        continue
    }
}

if (-not $debugPort) {
    throw "Could not find the BitBrowser DevTools endpoint."
}

& node `
    (Join-Path $PSScriptRoot "reload-live-extension.mjs") `
    "--port=$debugPort" `
    "--id=$ExtensionId"

if ($LASTEXITCODE -ne 0) {
    throw "Extension reload failed with exit code $LASTEXITCODE."
}

Write-Output "Live extension updated: $targetRoot"
