$ErrorActionPreference = "Stop"

$nativeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionDir = Split-Path -Parent $nativeDir
$manifestPath = Join-Path $extensionDir "manifest.json"
$helperPath = Join-Path $nativeDir "TemuDownlistHelper.exe"

if (-not (Test-Path -LiteralPath $helperPath)) {
    & (Join-Path $nativeDir "build-helper.ps1")
}

$manifestJson = [System.IO.File]::ReadAllText(
    $manifestPath,
    [System.Text.Encoding]::UTF8
)
$extensionManifest = $manifestJson | ConvertFrom-Json
$publicKey = [Convert]::FromBase64String($extensionManifest.key)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $hash = $sha256.ComputeHash($publicKey)
}
finally {
    $sha256.Dispose()
}

$hex = -join ($hash[0..15] | ForEach-Object { $_.ToString("x2") })
$alphabet = "abcdefghijklmnop"
$extensionId = -join ($hex.ToCharArray() | ForEach-Object {
    $alphabet[[Convert]::ToInt32([string]$_, 16)]
})

if ($extensionId -ne "mcgadkimbdnkdmcchihilkaghjefklpo") {
    throw "Unexpected extension ID: $extensionId"
}

$installDir = Join-Path $env:LOCALAPPDATA "TemuDownlistExtension\native"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$installedHelper = Join-Path $installDir "TemuDownlistHelper.exe"
Get-CimInstance Win32_Process |
    Where-Object { $_.ExecutablePath -eq $installedHelper } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process -Name "TemuDownlistHelper" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400
Copy-Item -LiteralPath $helperPath -Destination $installedHelper -Force

$hostManifestPath = Join-Path $installDir "com.jlkj.temu_downlist.json"
$hostManifest = [ordered]@{
    "name" = "com.jlkj.temu_downlist";
    "description" = "Temu downlist and image helper";
    "path" = $installedHelper;
    "type" = "stdio";
    "allowed_origins" = @("chrome-extension://$extensionId/")
}
$json = $hostManifest | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($hostManifestPath, $json, $utf8NoBom)

$registryRoots = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.jlkj.temu_downlist",
    "HKCU:\Software\Chromium\NativeMessagingHosts\com.jlkj.temu_downlist",
    "HKCU:\Software\BitBrowser\NativeMessagingHosts\com.jlkj.temu_downlist"
)

foreach ($registryPath in $registryRoots) {
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -Path $registryPath -Value $hostManifestPath
}

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "TemuDownlistHelper.lnk"
$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedHelper
$shortcut.Arguments = "--http"
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7
$shortcut.Save()

Start-Process -FilePath $installedHelper -ArgumentList "--http" -WindowStyle Hidden

Write-Host "Native helper installed."
Write-Host "Extension ID: $extensionId"
Write-Host "Helper: $installedHelper"
Write-Host "Native host manifest: $hostManifestPath"
Write-Host "Startup shortcut: $shortcutPath"
Write-Host "HTTP helper started on 127.0.0.1:17866."
Write-Host "Restart BitBrowser completely."
