# Afterimage native identity

`mark.svg` and `splash.svg` are the editable sources for the Afterimage image-plane mark and startup splash. The PNGs and ICO are generated from those sources for Qt and Windows. They are original Afterimage artwork, credited to the Afterimage contributors under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode); the complete license text is `CC-BY-SA-4.0.txt`. Krita's original branding and splash assets remain in their upstream directories with their original credits.

Regenerate the fixed-size assets with ImageMagick on Windows:

```powershell
./render-assets.ps1
```

The splash intentionally leaves the lower-right area for Krita's actual loading text. The rasterized splash fixes the type appearance for the shipped Windows build; the SVG remains editable.
