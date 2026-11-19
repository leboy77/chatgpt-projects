$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "..")
)
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $projectRoot "manifest.json") | ConvertFrom-Json
$outputPath = Join-Path $projectRoot "batch-traffic-accelerator-v$($manifest.version).zip"
$temporaryDirectory = Join-Path $projectRoot ".package-demo"

if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
}

New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
    foreach ($name in @(
        "manifest.json",
        "background.js",
        "content",
        "sidepanel",
        "assets",
        "demo",
        "PRD.md",
        "TECHNICAL_DESIGN.md",
        "AGENTS.md",
        "README.md",
        "IMPLEMENTATION_PATH.md"
    )) {
        Copy-Item `
            -LiteralPath (Join-Path $projectRoot $name) `
            -Destination $temporaryDirectory `
            -Recurse
    }

    Compress-Archive `
        -Path (Join-Path $temporaryDirectory "*") `
        -DestinationPath $outputPath `
        -Force

    Write-Output $outputPath
}
finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}
