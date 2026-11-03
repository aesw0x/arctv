# Rasterises tools/icon/app-icon.svg into tizen/icon.png (512x512, opaque black).
#
# The television wants a flat PNG, while the phone ships an Android adaptive icon: a vector drawn on
# a 108dp canvas that the launcher masks. Chrome renders the vector at full fidelity, so the icon
# stays one piece of artwork with two packs.

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$svg = Join-Path $PSScriptRoot 'app-icon.svg'
$png = Join-Path $root 'tizen\icon.png'

$chrome = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
    throw 'No Chrome or Edge found to rasterise the icon.'
}

& $chrome `
    --headless=new `
    --disable-gpu `
    --hide-scrollbars `
    --force-device-scale-factor=1 `
    --user-data-dir="$env:TEMP\arctv-icon" `
    --window-size=512,512 `
    --virtual-time-budget=3000 `
    --screenshot="$png" `
    ("file:///" + $svg.Replace('\', '/')) 2>&1 | Out-Null

if (-not (Test-Path $png)) { throw "Icon was not written to $png" }

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($png)
Write-Output ("{0} - {1}x{2}" -f $png, $image.Width, $image.Height)
$image.Dispose()
