# Rebuild platform icons from the adopted white-background logo. Windows PowerShell.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$project = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Image]::FromFile((Join-Path $project 'public/assets/branding/METEOR_RACE_logo_w.png'))
$output = Join-Path $project 'public/assets/branding/icons'
[System.IO.Directory]::CreateDirectory($output) | Out-Null
try {
  foreach ($size in @(16,32,48,180,192,512)) {
    $bitmap = [System.Drawing.Bitmap]::new($size,$size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($source,0,0,$size,$size)
      $bitmap.Save((Join-Path $output "icon-$size.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
  # ICO directory containing three PNG frames; no external converter required.
  $frames = @(16,32,48) | ForEach-Object { ,([System.IO.File]::ReadAllBytes((Join-Path $output "icon-$_.png"))) }
  $stream = [System.IO.File]::Create((Join-Path $project 'public/favicon.ico'))
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]3)
    $offset = 6 + 16 * 3
    for ($i=0; $i -lt 3; $i++) {
      $size = @(16,32,48)[$i]
      $writer.Write([byte]$size); $writer.Write([byte]$size)
      $writer.Write([byte]0); $writer.Write([byte]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32)
      $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
      $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
  } finally { $writer.Dispose() }
} finally { $source.Dispose() }
Write-Output 'Platform icons generated.'
