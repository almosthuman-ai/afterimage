# Development runtime notices

`scripts/prepare-dev-runtime.py` stages these local dependencies under the
ignored `.afterimage/_install/bin/` development install. This is not a public
installer or a complete release redistribution manifest.

| Runtime | Pinned version | Installed location | Upstream notices |
| --- | --- | --- | --- |
| Official Codex Windows vendor tree | 0.156.0 | `tools/codex/` | Preserved with the complete vendor tree and its resources. |
| Processing portable Windows | 4.5.6 | `processing/` | Preserved with the complete portable tree, including `app/resources/jdk/NOTICE` and bundled JDK `legal/` files. |
| Gyan FFmpeg full build | 8.1.2 | `ffmpeg/bin/ffmpeg.exe` | `ffmpeg/LICENSE` and `ffmpeg/README.txt` are copied beside the executable. |
| LLVM MinGW runtime DLLs | 2025-11-18 toolchain | `bin/` | From the existing local development toolchain; release notices remain to be assembled for public distribution. |

The script uses the installed Codex vendor tree when its pinned manifest is
already present. It copies no authentication or account state, does not
download runtimes, and leaves the original local runtime sources in place.
Run it after `build-windows.py install`, while the app is closed:

```powershell
.afterimage/venv/Scripts/python.exe afterimage/scripts/prepare-dev-runtime.py --ffmpeg-root C:/path/to/ffmpeg-8.1.2-full_build
```

`--processing-root` can point at another local official 4.5.6 portable root.
`--codex-package` is needed only when the complete pinned Codex vendor tree is
not already installed.
