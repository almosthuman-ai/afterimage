# Portable Windows preview

`scripts/package-windows.py` stages a portable Afterimage folder from the
existing `.afterimage/_install` snapshot. It does not compile, install, fetch
runtimes, or publish anything. Stage only after the native install is current:

```powershell
.afterimage/venv/Scripts/python.exe afterimage/scripts/package-windows.py
```

The script prints the folder under `.afterimage/releases/`. Add `--zip` to
create a ZIP beside it. `Afterimage.cmd` is the entry point after extraction;
`bin/afterimage.exe` also runs directly. Keep the package tree together. Save
artwork wherever you choose. Chat sign-in, API keys, settings, and application
cache stay in the Windows user profile and are not staged.

The package carries the runtime DLLs, Krita plugins and resources, embedded
Python, the complete pinned Codex vendor tree, the Processing application/JDK
needed by Glitch Temple, FFmpeg, Temple Studio assets, and their available
notices. It omits installed headers, import libraries, compiler tools, debug
symbols, Processing's separate editor launcher, development executables, and
local account or artwork files. The script writes `manifest.json` with every
packaged path, byte count, and SHA-256 digest.

Glitch Temple Studio needs the Microsoft Edge WebView2 Runtime already on
Windows or installed separately. See `RELEASE-NOTICES.md` for component
provenance and the remaining redistribution notice work before a public
release.

## Package proof

Use the native check runner's isolated package root. It places only the
package `bin` directory and Windows system directories on the child process
`PATH`. Qt plugins come from the package, and embedded Python resolves its own paths:

```powershell
.afterimage/venv/Scripts/python.exe afterimage/scripts/run-native-check.py --package-root 'F:/path/to/Afterimage-...-windows-x64' afterimage.exe --help
```

For a full workspace proof, `capture-workspace.py` creates a private Windows
desktop, then passes `--package-root` to that runner. A valid package check
opens an existing neutral KRA, renders the actual native window and artwork,
and exports an image without borrowing installed plugins or DLLs. Run that
check after the source install has finished, using isolated test resources;
no test should drive the physical desktop. Verify loaded module paths and Qt
plugin paths against the staged package before calling it portable.
