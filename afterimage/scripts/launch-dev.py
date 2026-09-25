#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Open the development install using only its packaged native dependencies."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

spec = importlib.util.spec_from_file_location('build', Path(__file__).with_name('build-windows.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
binary = build.STATE / '_install/bin'
env = build.environment()
env['PATH'] = os.pathsep.join(map(str, [binary, Path(os.environ['SYSTEMROOT']) / 'System32',
                                      Path(os.environ['SYSTEMROOT'])]))
env.pop('PYTHONPATH', None)
with (build.STATE / 'app.stdout.log').open('w', encoding='utf-8') as output, \
     (build.STATE / 'app.stderr.log').open('w', encoding='utf-8') as errors:
    process = subprocess.Popen([str(binary / 'afterimage.exe'), *sys.argv[1:]], cwd=binary, env=env,
                               stdout=output, stderr=errors)
print('Afterimage development process:', process.pid)
