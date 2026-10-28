$ErrorActionPreference = "Stop"

$nativeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $nativeDir "TemuDownlistHelper.cs"
$output = Join-Path $nativeDir "TemuDownlistHelper.exe"
$frameworkDir = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319"
$compiler = Join-Path $frameworkDir "csc.exe"

if (-not (Test-Path -LiteralPath $compiler)) {
    $frameworkDir = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319"
    $compiler = Join-Path $frameworkDir "csc.exe"
}

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "未找到 .NET Framework C# 编译器 csc.exe"
}

$webExtensions = Join-Path $frameworkDir "System.Web.Extensions.dll"
$drawing = Join-Path $frameworkDir "System.Drawing.dll"
$core = Join-Path $frameworkDir "System.Core.dll"

& $compiler `
    /nologo `
    /target:exe `
    /optimize+ `
    /platform:x64 `
    "/out:$output" `
    "/reference:$webExtensions" `
    "/reference:$drawing" `
    "/reference:$core" `
    $source

if ($LASTEXITCODE -ne 0) {
    throw "本地助手编译失败，退出码：$LASTEXITCODE"
}

Get-Item -LiteralPath $output | Select-Object FullName, Length, LastWriteTime
