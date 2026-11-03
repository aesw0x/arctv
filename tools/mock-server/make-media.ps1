# Generates a seekable test video for the mock server.
#
#   powershell -ExecutionPolicy Bypass -File make-media.ps1
#
# 120 seconds of 1080p test pattern at ~3 Mbps with a tone, which is close enough to a real
# 1080p Telegram film that seeking and throughput behave the same way.

$ErrorActionPreference = 'Stop'

$mediaDir = Join-Path $PSScriptRoot 'media'
New-Item -ItemType Directory -Force -Path $mediaDir | Out-Null

$out = Join-Path $mediaDir 'sample.mp4'

if (Test-Path $out) {
    $existing = (Get-Item $out).Length
    Write-Host "already exists: $out ($([math]::Round($existing / 1MB, 1)) MB)"
    exit 0
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg is not on PATH. Install it, or drop any video into $mediaDir as sample.mp4"
    exit 1
}

Write-Host 'rendering 120s 1080p test pattern...'

& ffmpeg -y -hide_banner -loglevel warning `
    -f lavfi -i "testsrc2=size=1920x1080:rate=30" `
    -f lavfi -i "sine=frequency=440:sample_rate=48000" `
    -t 120 `
    -c:v libx264 -preset veryfast -b:v 3M -pix_fmt yuv420p -g 60 `
    -c:a aac -b:a 128k `
    -shortest `
    -movflags +faststart `
    $out

$size = (Get-Item $out).Length
Write-Host "wrote $out ($([math]::Round($size / 1MB, 1)) MB)"
