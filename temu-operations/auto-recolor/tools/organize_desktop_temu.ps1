param(
  [string]$Desktop = "C:\Users\QZJLKJ\Desktop",
  [string]$DestinationName = "TEMU图片助手整理"
)

$ErrorActionPreference = "Stop"
$Desktop = [System.IO.Path]::GetFullPath($Desktop)
$Destination = Join-Path $Desktop $DestinationName
$LiveOuter = Join-Path $Desktop "TEMU图片助手v0.5.0"
$LiveManifest = Join-Path $LiveOuter "TEMU图片助手v0.5.0\manifest.json"

if (-not (Test-Path -LiteralPath $Desktop -PathType Container)) {
  throw "桌面目录不存在: $Desktop"
}
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
  New-Item -ItemType Directory -Path $Destination | Out-Null
}

$moved = @()
$items = @(Get-ChildItem -LiteralPath $Desktop -Force |
  Where-Object {
    $_.FullName -ne $Destination -and
    $_.Name -like "TEMU图片助手*" -and
    -not (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and
          $_.Name -eq "TEMU图片助手v0.5.0")
  } |
  Sort-Object Name)
$items = @($items | Where-Object { $_.Name -eq "TEMU图片助手v0.5.0" }) +
         @($items | Where-Object { $_.Name -ne "TEMU图片助手v0.5.0" })

foreach ($item in $items) {
  $target = Join-Path $Destination $item.Name
  if (Test-Path -LiteralPath $target) {
    throw "目标已存在，停止移动避免覆盖: $target"
  }
  $source = $item.FullName
  Move-Item -LiteralPath $source -Destination $target
  $moved += "$source`t->`t$target"
}

# 当前浏览器从 v0.5.0 外层目录加载扩展。移动后在原位置创建隐藏目录联接，
# 保证 Chrome 的既有 unpacked 路径继续有效。
$liveTarget = Join-Path $Destination "TEMU图片助手v0.5.0"
if (($moved | Where-Object { $_ -like "$LiveOuter`t*" }).Count -gt 0) {
  New-Item -ItemType Junction -Path $LiveOuter -Target $liveTarget | Out-Null
  $junction = Get-Item -LiteralPath $LiveOuter -Force
  $junction.Attributes = $junction.Attributes -bor [System.IO.FileAttributes]::Hidden
} elseif (Test-Path -LiteralPath $LiveOuter) {
  $junction = Get-Item -LiteralPath $LiveOuter -Force
  if (-not ($junction.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw "运行目录未移动，且原位置不是目录联接，停止以避免破坏扩展"
  }
  $junction.Attributes = $junction.Attributes -bor [System.IO.FileAttributes]::Hidden
}

if (-not (Test-Path -LiteralPath $LiveManifest -PathType Leaf)) {
  throw "移动后无法通过原扩展路径读取 manifest: $LiveManifest"
}

$manifest = Get-Content -LiteralPath $LiveManifest -Raw | ConvertFrom-Json
$lines = @(
  "TEMU图片助手桌面整理",
  "整理时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "整理目录: $Destination",
  "当前运行扩展: $LiveOuter (隐藏目录联接)",
  "扩展版本: $($manifest.version)",
  "",
  "移动项目:"
) + $moved
$lines | Set-Content -LiteralPath (Join-Path $Destination "整理清单.txt") -Encoding UTF8

Write-Output "DESTINATION=$Destination"
Write-Output "MOVED=$($moved.Count)"
Write-Output "LIVE_MANIFEST_OK=$LiveManifest"
Write-Output "VERSION=$($manifest.version)"
