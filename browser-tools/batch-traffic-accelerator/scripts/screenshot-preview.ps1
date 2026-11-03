param(
    [string] $OutputPath = "demo-preview.png"
)

$ErrorActionPreference = "Stop"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$arguments = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,1000",
    "--virtual-time-budget=2500",
    "--screenshot=$resolvedOutput",
    "http://127.0.0.1:8899/demo/preview.html"
)

$process = Start-Process `
    -FilePath $edge `
    -ArgumentList $arguments `
    -WindowStyle Hidden `
    -PassThru `
    -Wait

if ($process.ExitCode -ne 0) {
    throw "Edge screenshot process exited with code $($process.ExitCode)."
}

Write-Output $resolvedOutput
