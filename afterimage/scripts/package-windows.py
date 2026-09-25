#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Stage a portable Windows preview from the existing installed runtime."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".afterimage"
INSTALL = STATE / "_install"
RELEASES = STATE / "releases"

RUNTIME_LIB_DIRS = (
    "kritaplugins", "krita-python-libs", "mlt", "gettext"
)
EXCLUDED_SHARE_DIRS = {
    "aclocal", "cmake", "ECM", "eigen3", "man", "pkgconfig", "doc",
    "dlfcn-win32", "qlogging-categories5"
}
REQUIRED = (
    "bin/afterimage.exe", "bin/afterimage_comic_pdf_worker.exe", "bin/qt.conf",
    "bin/WebView2Loader.dll", "bin/tools/codex/codex-package.json",
    "bin/tools/codex/bin/codex.exe", "bin/processing/app/resources/jdk/bin/java.exe",
    "bin/ffmpeg/bin/ffmpeg.exe", "bin/ffmpeg/LICENSE",
    "bin/temple-studio/index.html", "bin/temple-studio/LICENSE",
    "plugins/platforms/qwindows.dll", "python/python313.dll",
    "share/krita", "lib/site-packages"
)


def require_installed_runtime() -> dict:
    missing = [relative for relative in REQUIRED if not (INSTALL / relative).exists()]
    if missing:
        raise RuntimeError("Installed runtime is incomplete: " + ", ".join(missing))
    package = json.loads((INSTALL / "bin/tools/codex/codex-package.json").read_text(encoding="utf-8"))
    if (package.get("version"), package.get("target"), package.get("entrypoint")) != (
        "0.156.0", "x86_64-pc-windows-msvc", "bin/codex.exe"
    ):
        raise RuntimeError("The official Codex vendor tree differs from the pinned Windows runtime.")
    if "Prefix=.." not in (INSTALL / "bin/qt.conf").read_text(encoding="utf-8"):
        raise RuntimeError("qt.conf does not use the relocatable prefix layout.")
    return package


def copy_tree(relative: str, destination: Path, ignore=None) -> None:
    source = INSTALL / relative
    if not source.is_dir():
        raise RuntimeError(f"Missing runtime directory: {source}")
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target, copy_function=shutil.copy2, ignore=ignore)


def processing_omit(directory: str, names: list[str]) -> set[str]:
    folder = Path(directory)
    omitted = {name for name in names if Path(name).suffix.lower() in {".pdb", ".lib", ".a", ".h"}}
    if folder.parts[-3:] == ("resources", "jdk", "include"):
        omitted.update(names)
    if folder.name == "jdk":
        omitted.add("include")
    if folder.name == "java" and folder.parent.name == "modes":
        omitted.add("examples")
    return omitted


def development_omit(directory: str, names: list[str]) -> set[str]:
    omitted = {name for name in names if Path(name).suffix.lower() in {".a", ".lib", ".pdb", ".h"}}
    if Path(directory).name == "vpl":
        omitted.add("examples")
    return omitted


def stage_runtime(destination: Path) -> None:
    binary = destination / "bin"
    binary.mkdir(parents=True)
    installed_bin = INSTALL / "bin"
    for file in installed_bin.iterdir():
        if file.is_file() and (file.suffix.lower() == ".dll" or file.name in {
            "afterimage.exe", "afterimage.com", "afterimage_comic_pdf_worker.exe", "qt.conf"
        }):
            shutil.copy2(file, binary / file.name)

    for relative in ("bin/tools/codex", "bin/ffmpeg", "bin/temple-studio"):
        copy_tree(relative, destination)
    # Temple uses Processing's application jars and bundled JDK directly. The
    # separate Processing GUI launcher/runtime is not invoked by Afterimage.
    copy_tree("bin/processing/app", destination, ignore=processing_omit)

    for relative in ("etc", "python", "qml", "translations"):
        copy_tree(relative, destination, ignore=development_omit)
    shutil.copytree(INSTALL / "plugins", destination / "plugins",
                    ignore=lambda folder, names: {"designer"} if Path(folder).name == "plugins" else set(),
                    copy_function=shutil.copy2)
    for name in RUNTIME_LIB_DIRS:
        copy_tree("lib/" + name, destination)
    # The installed Python prefix also contains SIP/PyQt build machinery and
    # headers. Krita scripts need the runtime PyQt5 modules, not that toolchain.
    copy_tree("lib/site-packages/PyQt5", destination,
              ignore=lambda directory, names: {"bindings", "__pycache__"} & set(names))
    shutil.copy2(INSTALL / "lib/site-packages/sitecustomize.py",
                 destination / "lib/site-packages/sitecustomize.py")
    for child in (INSTALL / "share").iterdir():
        if child.is_dir() and child.name not in EXCLUDED_SHARE_DIRS:
            copy_tree("share/" + child.name, destination, ignore=development_omit)

    notices = destination / "notices"
    notices.mkdir()
    for name in ("COPYING", "AUTHORS", "README.packagers.md", "README.md"):
        shutil.copy2(ROOT / name, notices / name)
    shutil.copy2(ROOT / "afterimage/RELEASE-NOTICES.md", notices / "RELEASE-NOTICES.md")
    shutil.copy2(ROOT / "afterimage/UPSTREAM-README.md", notices / "UPSTREAM-README.md")
    for file in (ROOT / "afterimage/notices").iterdir():
        if file.is_file():
            shutil.copy2(file, notices / file.name)

    (destination / "Afterimage.cmd").write_text(
        "@echo off\r\n"
        "setlocal\r\n"
        "set \"PATH=%~dp0bin;%SystemRoot%\\System32;%SystemRoot%\"\r\n"
        "start \"\" /D \"%~dp0bin\" \"%~dp0bin\\afterimage.exe\" %*\r\n",
        encoding="ascii", newline=""
    )
    (destination / "README.txt").write_text(
        "Afterimage portable Windows preview\n\n"
        "Double-click Afterimage.cmd to open the art workplace. "
        "You can also run bin\\afterimage.exe directly.\n"
        "Keep this folder together. Save artwork wherever you choose. "
        "Chat sign-in, provider keys, and settings stay in your Windows user profile.\n"
        "Glitch Temple Studio needs the Microsoft WebView2 Runtime installed on Windows.\n"
        "See notices\\RELEASE-NOTICES.md for provenance and current redistribution gaps.\n",
        encoding="utf-8"
    )


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_revision() -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                            capture_output=True, text=True, check=True)
    return result.stdout.strip()


def write_manifest(destination: Path, version: str, codex: dict) -> dict:
    entries = []
    for path in sorted(destination.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Runtime contains a link requiring individual review: {path}")
        if path.is_file():
            relative = path.relative_to(destination).as_posix()
            entries.append({"path": relative, "bytes": path.stat().st_size, "sha256": hash_file(path)})
    manifest = {
        "format": 1,
        "name": "Afterimage portable Windows preview",
        "version": version,
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "checkoutRevisionAtPackaging": git_revision(),
        "binaryProvenance": "Hashes identify this installed binary snapshot; the current checkout revision is not an attestation of its build inputs.",
        "platform": "Windows x86-64",
        "components": {
            "Codex": codex["version"], "Processing": "4.5.6 application runtime",
            "FFmpeg": "8.1.2", "WebView2LoaderSDK": "1.0.4191.47"
        },
        "externalRuntime": ["Microsoft Edge WebView2 Runtime (Evergreen) for Glitch Temple Studio"],
        "source": "https://github.com/almosthuman-ai/afterimage",
        "fileCount": len(entries),
        "payloadBytes": sum(entry["bytes"] for entry in entries),
        "files": entries,
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def archive(destination: Path) -> Path:
    output = destination.with_name(destination.name + ".zip")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=6, allowZip64=True) as bundle:
        for path in sorted(destination.rglob("*")):
            if path.is_file():
                bundle.write(path, (Path(destination.name) / path.relative_to(destination)).as_posix())
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", action="store_true", help="Also create a portable ZIP beside the staged folder")
    args = parser.parse_args()
    codex = require_installed_runtime()
    RELEASES.mkdir(parents=True, exist_ok=True)
    revision = git_revision()[:12]
    version = "0.1.0-preview+g" + revision
    base_name = "Afterimage-" + version + "-windows-x64"
    destination = RELEASES / base_name
    if destination.exists() or destination.with_name(destination.name + ".zip").exists():
        destination = RELEASES / (base_name + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    temporary = Path(tempfile.mkdtemp(prefix=".package-staging-", dir=RELEASES))
    try:
        stage_runtime(temporary)
        manifest = write_manifest(temporary, version, codex)
        temporary.rename(destination)
    except Exception:
        print(f"Staging stopped; partial files preserved for inspection at {temporary}", file=sys.stderr)
        raise
    print(f"Staged {manifest['fileCount']} files ({manifest['payloadBytes'] / 1024**3:.2f} GiB): {destination}")
    if args.zip:
        output = archive(destination)
        print(f"ZIP {output.stat().st_size / 1024**3:.2f} GiB: {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Packaging failed: {error}", file=sys.stderr)
        raise SystemExit(1)
