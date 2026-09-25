# Afterimage module map

Status: Krita-based successor built and running in an isolated Windows development install. Product integration is unfinished; this is not a release. Original Compositor is preserved. Origin: https://github.com/almosthuman-ai/afterimage. Upstream: https://invent.kde.org/graphics/krita.git. Starting source: 188d77827a (2026-09-24).

## Goal

A beautiful, responsive Windows creative workplace where pixel artists, comic creators, glitch artists and people making everyday graphics can finish work they are proud of. Human tools and the AI collaborator share the actual artwork. Large documents, sustained experimentation, editable text, original sources and reliable recovery are first-class design conditions.

## Owners

| Work | Source | Boundary |
| --- | --- | --- |
| Native application and identity | `krita/`, `libs/ui/` | Existing Krita application/document ownership; separate Afterimage identity and per-user state |
| Painting, images, history, scheduling | `libs/image/`, `libs/pigment/` | Preserve the native tiled engine and artistic semantics |
| Native collaboration | `plugins/dockers/afterimage/` | Native dock, app-server session, paginated conversations, document inspection/preview and undoable layer properties; retained generation candidates |
| Glitch creative integration | `plugins/dockers/afterimage/`, `afterimage/temple/` (planned) | Complete current source behavior and retained editable recipes; original source repo read-only |
| Build and packaging | `afterimage/scripts/build-windows.py`, upstream CMake | Isolated Windows toolchain/dependencies under `.afterimage/`; upstream build system; packaging pending |

## Integration sources

Glitch Temple remote `https://github.com/taimei886/glitch-temple.git`, source revision `f4cde5d`; local reconciliation `9a1a7de` retains the earlier Tai Mei MIT attribution commit. The pull included 56 upstream commits and current declared version 0.47.3. Source has materially richer FORM, palette, ASCII/Language Body, audio-bending, targeting and time/material workflows than the old Compositor copy. Coverage must be grounded in that revision, not the old copied effect catalog.

Existing Compositor owns historical `.compwin` and `.compbook` files, provider artifacts and chat state. It is a migration source; no files or auth are silently borrowed or overwritten.

## Current packet

Windows LLVM-MinGW 20251118 (Clang 21.1.6), Python 3.13 and CMake 3.31.10 are installed under `.afterimage/`; upstream Qt5 dependencies are downloaded. The full native build, including Python bindings, has passed and installed into `.afterimage/_install`. Preserve `PROCESSOR_ARCHITECTURE` in the isolated build environment and select `XSIMD_ARCH=x86-64`; omitting processor information caused missing optimized drawing implementations at link time. SIP 6.10 is installed in the local venv because prebuilt SIP launchers are not relocatable. PyQt 5.15.11 comes from upstream dependencies.

The collaborator dock implements New Chat, paginated history, sign-in, streaming, inline questions/approvals, document inspection and generation candidate placement through Krita's native importer. `AfterimageSession` owns JSON-RPC and app-owned authentication. The bundled official Codex 0.156.0 runtime preserves its complete vendor layout; sign-in does not borrow another application's account files. Tests inject an isolated runtime and state directory directly: changing QSettings' default format does not isolate the explicit organization/application constructor on Windows.

`AfterimageDocumentBridge` captures shared native tiles under the image scheduler, then renders bounded canvas/selection previews on a worker. Its layer rename and opacity operations use native undo commands and report completion after the scheduler finishes. A turn keeps its original document even if the artist changes tabs. `AfterimageImageStore` retains provider originals, alpha-bearing PNGs, thumbnails and source previews with provenance on worker threads. Encoded cloud results and local file artifacts use the same store; local model inference is not implemented.

Standalone native tests pass for chat lifecycle, stopping, reopening, reconnection, history order, cross-thread notification filtering, alpha/provenance preservation, source-preview retention and settings isolation. The real signed-out Codex runtime accepts initialization, account inspection, dynamic document-tool registration and the history protocol. The installed app opens native KRA documents, loads Python and the native dock, discovers real Codex models, and reports its signed-out state. Authenticated conversation/image generation, native crop-aligned placement/masks, broader editing tools, separate API routes, complete Temple workflows and artwork migration remain to be completed and exercised.

Renaming the application requires the `afterimagerc` embedded resource alias in `krita/krita.qrc`; otherwise KConfig cannot find the shipped default layout and starts with hidden toolbars and docks. The first Afterimage workspace adds the collaborator beside the native painting layout; later launches retain the artist's arrangement. Branding still includes upstream splash/welcome artwork and needs a deliberate Afterimage design.

Commands, from this repository: `.afterimage/venv/Scripts/python.exe afterimage/scripts/build-windows.py configure`, `build`, `install`, or `test-session`. `prepare-dev-runtime.py --codex-package <official-package-root>` installs the Codex vendor tree and C++ runtime DLLs. `launch-dev.py [artwork-path]` opens the native app with only installed runtime dependencies on PATH. `check-app-server.py --runtime <codex.exe>` checks the real protocol without authentication or model calls. Build logs and generated state stay under `.afterimage/`. Afterimage has its own application name, executable, settings and diagnostic log names; resource compatibility retains upstream `share/krita` paths and attribution. Release packaging and third-party notices are still owed.

The unused historical `../compositor-krita` clone is excluded from workspace VS Code repository discovery, watching and search. Both clones ignore generated toolchains/dependencies. The active source repository is `afterimage`.
