# Glitch Temple Studio source

This directory began as a source copy of Tai Mei and Sazed's Glitch Temple
0.47.3 at commit `9a1a7de4a24880190065f0c76d5fdf1df22d20d6`. The original
checkout at `F:/Axiomatic/augmented-environment/glitch-temple` is read-only.
The original `LICENSE` is copied beside this note. Afterimage's WebView2 host
and bridge adaptations live here so the source Studio's creative controls can
work against native Krita documents; they do not replace Tai Mei's authorship.

The development WebView2 SDK is official `Microsoft.Web.WebView2` NuGet
`1.0.4191.47` (package SHA-256
`f492bbf547d0da329553b6727435b677579b1e9f91cc9e4a1ad029366d5f23d0`)
under ignored `.afterimage/runtime/webview2-sdk/1.0.4191.47/package/`. Its
`LICENSE.txt` and `NOTICE.txt` remain in that package. The installed system
WebView2 runtime was `153.0.4234.48` when integration began.

Build the UI from this directory with `npm ci` and `npm run build`. The Vite
output is `dist/` and will be installed beside the native plugin at a path
chosen by its local CMake target. The JavaScript bridge replaces Tauri APIs;
the original Tauri Rust backend is not shipped or started by Afterimage.
