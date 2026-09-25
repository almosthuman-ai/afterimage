#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prepare the ignored native development install with its own runtime dependencies."""
import argparse
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.afterimage'
parser = argparse.ArgumentParser()
parser.add_argument('--codex-package', type=Path, required=True,
                    help='Official npm @openai/codex package root; only its vendor runtime is copied')
args = parser.parse_args()
vendor = args.codex_package / 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc'
manifest = json.loads((vendor / 'codex-package.json').read_text(encoding='utf-8'))
assert manifest['target'] == 'x86_64-pc-windows-msvc' and manifest['entrypoint'] == 'bin/codex.exe'
binary = STATE / '_install/bin'
binary.mkdir(parents=True, exist_ok=True)
shutil.copytree(vendor, binary / 'tools/codex', dirs_exist_ok=True)
runtime = STATE / 'toolchain/llvm-mingw-20251118-ucrt-x86_64/x86_64-w64-mingw32/bin'
for name in ['libc++.dll', 'libunwind.dll', 'libwinpthread-1.dll', 'libomp.dll']:
    shutil.copy2(runtime / name, binary / name)
(binary / 'qt.conf').write_text('[Paths]\nPrefix=..\nPlugins=plugins\nQml2Imports=qml\n', encoding='utf-8')
print('Prepared native development runtime with Codex', manifest['version'])
print('Authentication is created separately by Afterimage; no account files were copied.')
