$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$releaseRoot = Join-Path $projectDir "release"
$packageDir = Join-Path $releaseRoot "TemuDownlistExtension"
$resolvedProject = [System.IO.Path]::GetFullPath($projectDir)
$resolvedRelease = [System.IO.Path]::GetFullPath($releaseRoot)
if (-not $resolvedRelease.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside the project directory."
}

if (Test-Path -LiteralPath $packageDir) {
    Remove-Item -LiteralPath $packageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

$items = @(
    "manifest.json",
    "background.js",
    "content.js",
    "page-bridge.js",
    "shared.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "README.md",
    "preview.png",
    "icons",
    "templates",
    "vendor"
)

foreach ($item in $items) {
    Copy-Item -LiteralPath (Join-Path $projectDir $item) -Destination $packageDir -Recurse -Force
}
$zipPath = Join-Path $releaseRoot "TemuDownlistExtension_v2.4.1.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Get-Item -LiteralPath $zipPath | Select-Object FullName, Length, LastWriteTime
