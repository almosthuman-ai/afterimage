# Afterimage portable preview: source and runtime notices

Afterimage is a fork of Krita. Its source is available at
https://github.com/almosthuman-ai/afterimage. The package includes the
repository's `COPYING`, `AUTHORS`, `README.packagers.md`, current `README.md`,
and preserved `UPSTREAM-README.md` in this notices folder. Those files retain
the upstream project and contributor record. The package also retains the
installed `share/licenses/` tree.

The executable package contains these separately sourced runtimes:

| Component | Packaged path | Notice and source |
| --- | --- | --- |
| Official Codex Windows vendor tree, 0.156.0 | `bin/tools/codex/` | `CODEX-LICENSE`, `CODEX-NOTICE`; https://github.com/openai/codex/tree/rust-v0.156.0 |
| Processing 4.5.6 application and bundled JDK | `bin/processing/app/` | `PROCESSING-LICENSE.md`, bundled JDK `legal/` and `NOTICE`; https://github.com/processing/processing4/tree/processing-1434-4.5.6 |
| Gyan FFmpeg full build 8.1.2 | `bin/ffmpeg/` | Bundled `LICENSE` and `README.txt`; https://www.gyan.dev/ffmpeg/builds/ |
| Glitch Temple Studio 0.47.3, source `9a1a7de` | `bin/temple-studio/` | Bundled `LICENSE`, `TEMPLE-LICENSE`, `UPSTREAM.md`; its `webview2-notices/` holds the Microsoft SDK license and notice. |
| Afterimage icon and splash | Embedded application resources; `share/afterimage/branding/` | Original Afterimage SVG sources, attribution, and full CC-BY-SA-4.0 license are included. |
| Qt, KDE Frameworks, Python, Krita libraries, and compiler runtimes | `bin/`, `lib/`, `python/`, `plugins/`, `qml/`, `share/` | Upstream source and available installed notices are retained. A component-by-component binary redistribution notice inventory has not yet been completed. |

Glitch Temple Studio needs the Microsoft Edge WebView2 Runtime on Windows.
This package contains the architecture-matched WebView2 loader and SDK notices,
but does not include the external Runtime. If it is absent, obtain it from
https://developer.microsoft.com/en-us/microsoft-edge/webview2/.

This is a locally staged preview, not a published binary release. Before public
redistribution, reconcile the remaining Qt/KDE/Python/compiler runtime notice
inventory and any corresponding-source obligations for the exact binary build.
The package manifest records the included files and SHA-256 hashes; its Git
revision identifies the checkout at packaging time, not a verified build
attestation.
