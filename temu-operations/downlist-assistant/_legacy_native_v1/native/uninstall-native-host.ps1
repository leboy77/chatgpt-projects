$ErrorActionPreference = "Stop"

$registryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.jlkj.temu_downlist",
    "HKCU:\Software\Chromium\NativeMessagingHosts\com.jlkj.temu_downlist",
    "HKCU:\Software\BitBrowser\NativeMessagingHosts\com.jlkj.temu_downlist"
)

foreach ($registryPath in $registryPaths) {
    if (Test-Path -Path $registryPath) {
        Remove-Item -Path $registryPath -Recurse -Force
    }
}

$installDir = Join-Path $env:LOCALAPPDATA "TemuDownlistExtension\native"
$installedHelper = Join-Path $installDir "TemuDownlistHelper.exe"
Get-CimInstance Win32_Process |
    Where-Object { $_.ExecutablePath -eq $installedHelper } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process -Name "TemuDownlistHelper" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400

$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "TemuDownlistHelper.lnk"
if (Test-Path -LiteralPath $startupShortcut) {
    Remove-Item -LiteralPath $startupShortcut -Force
}

if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
}

Write-Host "本地助手已卸载。扩展目录和已保存图片未删除。"
