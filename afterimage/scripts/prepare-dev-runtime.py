#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Stage local, pinned runtimes beside the ignored Windows development install."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.afterimage'
BIN = STATE / '_install' / 'bin'
CODEX_TARGET = 'x86_64-pc-windows-msvc'
CODEX_VERSION = '0.156.0'
PROCESSING_VERSION = '4.5.6'
FFMPEG_VERSION = '8.1.2'


def codex_manifest(vendor: Path) -> dict:
    manifest_path = vendor / 'codex-package.json'
    if not manifest_path.is_file():
        raise RuntimeError(f'Missing Codex vendor manifest: {manifest_path}')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if (manifest.get('version'), manifest.get('target'), manifest.get('entrypoint')) != (
        CODEX_VERSION, CODEX_TARGET, 'bin/codex.exe'
    ) or not (vendor / 'bin' / 'codex.exe').is_file():
        raise RuntimeError(f'Expected the complete official Codex {CODEX_VERSION} {CODEX_TARGET} vendor tree: {vendor}')
    return manifest


def stage_codex(package: Path | None) -> None:
    installed = BIN / 'tools' / 'codex'
    if package is not None:
        vendor = package / 'node_modules' / '@openai' / 'codex-win32-x64' / 'vendor' / CODEX_TARGET
        codex_manifest(vendor)
        if not (installed / 'codex-package.json').is_file():
            shutil.copytree(vendor, installed, dirs_exist_ok=True)
        else:
            codex_manifest(installed)
    codex_manifest(installed)
    print(f'Codex {CODEX_VERSION}: {installed}')


def stage_mingw() -> None:
    runtime = STATE / 'toolchain' / 'llvm-mingw-20251118-ucrt-x86_64' / 'x86_64-w64-mingw32' / 'bin'
    for name in ('libc++.dll', 'libunwind.dll', 'libwinpthread-1.dll', 'libomp.dll'):
        target = BIN / name
        if not target.is_file():
            source = runtime / name
            if not source.is_file():
                raise RuntimeError(f'Missing native runtime DLL: {source}')
            shutil.copy2(source, target)
    qt_conf = BIN / 'qt.conf'
    if not qt_conf.is_file():
        qt_conf.write_text('[Paths]\nPrefix=..\nPlugins=plugins\nQml2Imports=qml\n', encoding='utf-8')


def processing_valid(root: Path) -> bool:
    app = root / 'app'
    return ((app / 'resources' / 'jdk' / 'bin' / 'java.exe').is_file()
            and any(app.glob(f'app-{PROCESSING_VERSION}-*.jar'))
            and (app / 'resources' / 'jdk' / 'NOTICE').is_file())


def stage_processing(source: Path) -> None:
    target = BIN / 'processing'
    if not processing_valid(source):
        raise RuntimeError(f'Expected official portable Processing {PROCESSING_VERSION}: {source}')
    if not processing_valid(target):
        shutil.copytree(source, target, dirs_exist_ok=True)
    if not processing_valid(target):
        raise RuntimeError(f'Processing staging did not complete: {target}')
    print(f'Processing {PROCESSING_VERSION}: {target}')


def default_ffmpeg_root() -> Path | None:
    explicit = os.environ.get('AFTERIMAGE_TEMPLE_FFMPEG')
    if explicit:
        return Path(explicit).resolve().parent.parent
    found = shutil.which('ffmpeg')
    if found:
        candidate = Path(found).resolve().parent.parent
        if (candidate / 'LICENSE').is_file() and (candidate / 'README.txt').is_file():
            return candidate
    local = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft' / 'WinGet' / 'Packages'
    candidates = sorted(local.glob('Gyan.FFmpeg_Microsoft.Winget.Source_*/ffmpeg-8.1.2-full_build'))
    return candidates[0] if candidates else None


def ffmpeg_version(binary: Path) -> str:
    if not binary.is_file():
        raise RuntimeError(f'Missing FFmpeg binary: {binary}')
    result = subprocess.run([str(binary), '-version'], check=True, capture_output=True, text=True,
                            timeout=15, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    first_line = result.stdout.splitlines()[0] if result.stdout else ''
    if f'ffmpeg version {FFMPEG_VERSION}' not in first_line:
        raise RuntimeError(f'Expected FFmpeg {FFMPEG_VERSION}, got {first_line!r}: {binary}')
    return first_line


def copy_if_changed(source: Path, target: Path) -> None:
    if not source.is_file():
        raise RuntimeError(f'Missing runtime license or binary: {source}')
    if not target.is_file() or source.stat().st_size != target.stat().st_size:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def stage_ffmpeg(source: Path) -> None:
    target = BIN / 'ffmpeg'
    ffmpeg_version(source / 'bin' / 'ffmpeg.exe')
    for relative in ('bin/ffmpeg.exe', 'LICENSE', 'README.txt'):
        copy_if_changed(source / relative, target / relative)
    ffmpeg_version(target / 'bin' / 'ffmpeg.exe')
    print(f'FFmpeg {FFMPEG_VERSION}: {target / "bin" / "ffmpeg.exe"}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--codex-package', type=Path,
                        help='Official npm package root; optional when the pinned vendor tree is already installed')
    parser.add_argument('--processing-root', type=Path, default=STATE / 'runtime' / 'processing' / 'Processing',
                        help='Local official Processing 4.5.6 portable root')
    parser.add_argument('--ffmpeg-root', type=Path,
                        help='Local FFmpeg 8.1.2 build root containing bin/ffmpeg.exe, LICENSE and README.txt')
    args = parser.parse_args()
    BIN.mkdir(parents=True, exist_ok=True)
    stage_codex(args.codex_package)
    stage_mingw()
    stage_processing(args.processing_root)
    ffmpeg_root = args.ffmpeg_root or default_ffmpeg_root()
    if ffmpeg_root is None:
        raise RuntimeError('FFmpeg 8.1.2 was not found locally; pass --ffmpeg-root.')
    stage_ffmpeg(ffmpeg_root)
    print('No authentication files or account state were copied.')


if __name__ == '__main__':
    main()
