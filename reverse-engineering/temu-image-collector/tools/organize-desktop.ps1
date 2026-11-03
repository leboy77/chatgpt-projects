param(
  [switch]$Execute
)

$ErrorActionPreference = "Stop"
$desktop = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath("Desktop"))
$root = Join-Path $desktop "桌面整理_2026-10-29"

$categories = @(
  "00_常用快捷方式",
  "01_Temu首图采集器",
  "02_Temu其他工具",
  "03_办公文档与表格",
  "04_脚本与工具",
  "05_图片与设计",
  "06_压缩包与安装包",
  "07_跨境项目与资料",
  "08_待确认"
)

function Get-Category {
  param([System.IO.FileSystemInfo]$Item)

  $name = $Item.Name
  $extension = $Item.Extension.ToLowerInvariant()

  if ($name -eq "desktop.ini") {
    return $null
  }
  if ($extension -in @(".lnk", ".url")) {
    return "00_常用快捷方式"
  }
  if ($name -like "Temu商品首图采集器*" -or
      $name -like "TEMU产品列表图片下载*") {
    return "01_Temu首图采集器"
  }
  if ($name -like "Temu商品推广花费监控*" -or
      $name -like "TEMU图片助手*" -or
      $name -like "Temu下架助手*" -or
      $name -like "temu_data_*" -or
      $name -eq "下架图片合集") {
    return "02_Temu其他工具"
  }
  if ($extension -in @(".xlsx", ".xls", ".html", ".txt")) {
    return "03_办公文档与表格"
  }
  if ($extension -in @(".ps1", ".bat", ".js")) {
    return "04_脚本与工具"
  }
  if ($extension -in @(".jpg", ".jpeg", ".png", ".psd", ".avif") -or
      $name -eq "裤子改版图") {
    return "05_图片与设计"
  }
  if ($extension -in @(".zip", ".exe")) {
    return "06_压缩包与安装包"
  }
  if ($name -in @("2", "3", "新建文件夹", "新建文件夹 (7)")) {
    return "08_待确认"
  }
  if ($Item.PSIsContainer) {
    return "07_跨境项目与资料"
  }
  return "08_待确认"
}

$items = Get-ChildItem -LiteralPath $desktop -Force |
  Where-Object { $_.Name -ne "desktop.ini" }

$plan = foreach ($item in $items) {
  $category = Get-Category -Item $item
  if (-not $category) {
    continue
  }
  [pscustomobject]@{
    Item = $item
    Category = $category
    Destination = Join-Path (Join-Path $root $category) $item.Name
  }
}

$plan | Group-Object Category | Sort-Object Name | ForEach-Object {
  Write-Host ("{0}: {1} 项" -f $_.Name, $_.Count)
}

if (-not $Execute) {
  Write-Host "`nDRY RUN：未移动任何文件。使用 -Execute 执行整理。" -ForegroundColor Yellow
  $plan | Select-Object Category, @{n = "Name"; e = { $_.Item.Name } } |
    Format-Table -AutoSize
  exit 0
}

foreach ($category in $categories) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root $category) |
    Out-Null
}

$moved = [System.Collections.Generic.List[object]]::new()
$failed = [System.Collections.Generic.List[object]]::new()

foreach ($entry in $plan) {
  $sourcePath = [System.IO.Path]::GetFullPath($entry.Item.FullName)
  $destinationPath = [System.IO.Path]::GetFullPath($entry.Destination)
  if (-not $sourcePath.StartsWith($desktop, [System.StringComparison]::OrdinalIgnoreCase) -or
      -not $destinationPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe path: $sourcePath -> $destinationPath"
  }
  if (Test-Path -LiteralPath $destinationPath) {
    $failed.Add([pscustomobject]@{
      Name = $entry.Item.Name
      Category = $entry.Category
      Reason = "目标已存在"
    })
    continue
  }
  try {
    Move-Item -LiteralPath $sourcePath -Destination $destinationPath
    $moved.Add([pscustomobject]@{
      Name = $entry.Item.Name
      Category = $entry.Category
      Destination = $destinationPath
    })
  } catch {
    $failed.Add([pscustomobject]@{
      Name = $entry.Item.Name
      Category = $entry.Category
      Reason = $_.Exception.Message
    })
  }
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# 桌面整理索引")
$lines.Add("")
$lines.Add("- 整理时间：2026-10-29")
$lines.Add("- 原桌面项目：$($plan.Count)")
$lines.Add("- 成功移动：$($moved.Count)")
$lines.Add("- 未移动：$($failed.Count)")
$lines.Add("- 规则：只移动，不删除；原文件和目录内容保持不变。")
$lines.Add("")

foreach ($category in $categories) {
  $categoryItems = $moved | Where-Object Category -eq $category
  if (-not $categoryItems) {
    continue
  }
  $lines.Add("## $category")
  $lines.Add("")
  $lines.Add("| 原名称 | 新位置 |")
  $lines.Add("| --- | --- |")
  foreach ($item in $categoryItems) {
    $relative = [System.IO.Path]::GetRelativePath($root, $item.Destination)
    $lines.Add("| $($item.Name.Replace('|', '\|')) | $relative |")
  }
  $lines.Add("")
}

if ($failed.Count) {
  $lines.Add("## 未移动项目")
  $lines.Add("")
  $lines.Add("| 名称 | 分类 | 原因 |")
  $lines.Add("| --- | --- | --- |")
  foreach ($item in $failed) {
    $lines.Add("| $($item.Name.Replace('|', '\|')) | $($item.Category) | $($item.Reason.Replace('|', '\|')) |")
  }
  $lines.Add("")
}

$manifest = Join-Path $root "文件索引.md"
$lines | Set-Content -LiteralPath $manifest -Encoding utf8

Write-Host "`n整理完成：$root" -ForegroundColor Green
Write-Host "成功移动 $($moved.Count) 项，未移动 $($failed.Count) 项。"
Write-Host "文件索引：$manifest"
