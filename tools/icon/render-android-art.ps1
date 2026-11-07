# Rasterises the Android TV artwork from the vectors in this folder:
#   android-banner.svg -> android-tv/app/src/main/res/drawable-nodpi/banner.png  (640x360)
#   tizen/icon.png     -> android-tv/app/src/main/res/drawable-nodpi/ic_launcher.png
#
# The television's home screen wants a flat PNG for its tile, exactly as the Tizen and webOS
# packages do, so the same Chrome path that renders the panel icon renders this one. The launcher
# icon is not re-drawn at all — it is the file the other two packages already ship.

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$svg = Join-Path $PSScriptRoot 'android-banner.svg'
$dst = Join-Path $root 'android-tv\app\src\main\res\drawable-nodpi'
$out = Join-Path $dst 'banner.png'

if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

$chrome = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
    throw 'No Chrome or Edge found to rasterise the banner.'
}

& $chrome `
    --headless=new `
    --disable-gpu `
    --hide-scrollbars `
    --force-device-scale-factor=1 `
    --user-data-dir="$env:TEMP\arctv-android-art" `
    --window-size=640,360 `
    --virtual-time-budget=3000 `
    --screenshot="$out" `
    ("file:///" + $svg.Replace('\', '/')) 2>&1 | Out-Null

if (-not (Test-Path $out)) { throw "Banner was not written to $out" }

Copy-Item (Join-Path $root 'tizen\icon.png') (Join-Path $dst 'ic_launcher.png') -Force

Add-Type -AssemblyName System.Drawing
foreach ($file in @($out, (Join-Path $dst 'ic_launcher.png'))) {
    $image = [System.Drawing.Image]::FromFile($file)
    Write-Output ("{0} - {1}x{2}" -f $file, $image.Width, $image.Height)
    $image.Dispose()
}
