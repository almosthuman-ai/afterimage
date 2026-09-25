$ErrorActionPreference = 'Stop'

$brandDir = $PSScriptRoot
if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
    throw 'ImageMagick (magick) is required to render the branding assets.'
}

$iconPaths = foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $path = Join-Path $brandDir "$size-apps-afterimage.png"
    & magick -background none -density 384 (Join-Path $brandDir 'mark.svg') -resize "${size}x${size}" -strip "PNG32:$path"
    if ($LASTEXITCODE -ne 0) { throw "Could not render $path" }
    $path
}

& magick -background none -density 192 (Join-Path $brandDir 'splash.svg') -resize '960x480' -strip "PNG32:$(Join-Path $brandDir 'splash.png')"
if ($LASTEXITCODE -ne 0) { throw 'Could not render splash.png' }

& magick @iconPaths (Join-Path $brandDir 'afterimage.ico')
if ($LASTEXITCODE -ne 0) { throw 'Could not render afterimage.ico' }
