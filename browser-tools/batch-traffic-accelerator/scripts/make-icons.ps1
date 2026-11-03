$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$assetDirectory = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "..\assets")
)
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null

foreach ($size in @(16, 48, 128)) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    try {
        $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $rect,
            [System.Drawing.Color]::FromArgb(108, 82, 255),
            [System.Drawing.Color]::FromArgb(77, 49, 201),
            45
        )
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $radius = [Math]::Max(3, $size * 0.24)
        $diameter = $radius * 2
        $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
        $path.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
        $path.AddArc(
            $size - $diameter,
            $size - $diameter,
            $diameter,
            $diameter,
            0,
            90
        )
        $path.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
        $path.CloseFigure()
        $graphics.FillPath($brush, $path)

        $pen = New-Object System.Drawing.Pen(
            [System.Drawing.Color]::White,
            [Math]::Max(1.4, $size * 0.085)
        )
        $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $startX = $size * 0.30
        $startY = $size * 0.68
        $endX = $size * 0.69
        $endY = $size * 0.29
        $graphics.DrawLine($pen, $startX, $startY, $endX, $endY)
        $graphics.DrawLine($pen, $size * 0.48, $size * 0.28, $endX, $endY)
        $graphics.DrawLine($pen, $endX, $endY, $size * 0.70, $size * 0.50)

        $outputPath = Join-Path $assetDirectory "icon$size.png"
        $bitmap.Save(
            $outputPath,
            [System.Drawing.Imaging.ImageFormat]::Png
        )
        Write-Output $outputPath
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
