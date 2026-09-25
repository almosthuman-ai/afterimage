#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Run a native development check offscreen with the complete local runtime."""
import ctypes
import os
from pathlib import Path
import runpy
import subprocess
import sys


def on_named_private_desktop(name):
    if os.name != 'nt' or not name:
        return False
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.GetCurrentThreadId.restype = ctypes.c_uint32
    user32.GetThreadDesktop.argtypes = [ctypes.c_uint32]
    user32.GetThreadDesktop.restype = ctypes.c_void_p
    user32.GetUserObjectInformationW.argtypes = [ctypes.c_void_p, ctypes.c_int,
                                                 ctypes.c_void_p, ctypes.c_uint32,
                                                 ctypes.POINTER(ctypes.c_uint32)]
    user32.GetUserObjectInformationW.restype = ctypes.c_int
    desktop = user32.GetThreadDesktop(kernel32.GetCurrentThreadId())
    actual = ctypes.create_unicode_buffer(256)
    required = ctypes.c_uint32()
    return bool(desktop and user32.GetUserObjectInformationW(
        desktop, 2, actual, ctypes.sizeof(actual), ctypes.byref(required))
        and actual.value == name)


def main():
    arguments = sys.argv[1:]
    installed = bool(arguments and arguments[0] == '--installed')
    if installed:
        arguments.pop(0)
    if not arguments:
        print('Usage: run-native-check.py [--installed] <executable name> [arguments...]', file=sys.stderr)
        return 2
    build = runpy.run_path(str(Path(__file__).with_name('build-windows.py')))
    state = build['STATE']
    binary_dir = state / ('_install/bin' if installed else 'build/bin')
    name = Path(arguments[0])
    if name.name != str(name):
        print('Choose an executable name from the selected runtime directory.', file=sys.stderr)
        return 2
    executable = binary_dir / name
    if not executable.suffix:
        executable = executable.with_suffix('.exe')
    if not executable.is_file():
        print(f'Native check is not built: {executable}', file=sys.stderr)
        return 2
    env = build['environment']()
    if installed:
        windows = Path(os.environ['SYSTEMROOT'])
        env['PATH'] = os.pathsep.join(map(str, [binary_dir, windows / 'System32', windows]))
        env.pop('PYTHONPATH', None)
    else:
        env['PATH'] = os.pathsep.join([str(binary_dir), env['PATH']])
    env['QT_PLUGIN_PATH'] = str(state / '_install/plugins')
    private_desktop = os.environ.get('AFTERIMAGE_WORKSPACE_PRIVATE_DESKTOP_NAME', '')
    if private_desktop and not on_named_private_desktop(private_desktop):
        print('Workspace capture is not on its named private desktop.', file=sys.stderr)
        return 2
    env['QT_QPA_PLATFORM'] = 'windows' if private_desktop else 'offscreen'
    env['QT_QPA_FONTDIR'] = str(Path(os.environ['SYSTEMROOT']) / 'Fonts')
    # Test-specific configuration and explicitly supplied provider keys only.
    # The build environment itself continues to exclude application credentials.
    for key, value in os.environ.items():
        if key.startswith('AFTERIMAGE_') or key in ('OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'):
            env[key] = value
    flags = 0
    if os.name == 'nt':
        # Process-local, inherited by this child. Missing DLLs and crashes must
        # return a failing exit code, never interrupt the artist with OS dialogs.
        errors = 0x0001 | 0x0002 | 0x8000
        previous = ctypes.windll.kernel32.SetErrorMode(errors)
        ctypes.windll.kernel32.SetErrorMode(previous | errors)
        flags = subprocess.CREATE_NO_WINDOW
    result = subprocess.run([str(executable), *arguments[1:]],
                            cwd=state / '_install/bin', env=env, creationflags=flags)
    if result.returncode:
        print(f'{executable.name} failed: {result.returncode} '
              f'(0x{result.returncode & 0xffffffff:08X})', file=sys.stderr)
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
