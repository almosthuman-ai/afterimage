#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build with the isolated upstream-compatible toolchain, without changing PATH globally."""
import argparse
import ctypes
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.afterimage'


def environment():
    # CI utilities serialize their environment. Do not pass application credentials.
    keep = {'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE',
            'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
            'PROGRAMDATA', 'ALLUSERSPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS',
            'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION'}
    result = {key: value for key, value in os.environ.items() if key.upper() in keep}
    compiler = STATE / 'toolchain/llvm-mingw-20251118-ucrt-x86_64/bin'
    paths = [compiler, STATE / 'venv/Scripts', STATE / '_install/bin', STATE / '_install/lib',
             Path(os.environ['SYSTEMROOT']) / 'System32', Path(os.environ['SYSTEMROOT']),
             Path(os.environ['PROGRAMFILES']) / 'Git/cmd']
    # Temple's preserved Studio is built with Node. Keep only the discovered
    # tool directory, not the calling shell's credentials or full environment.
    node = shutil.which('node')
    if node:
        paths.append(Path(node).parent)
    result['PATH'] = os.pathsep.join(map(str, paths))
    if os.environ.get('AFTERIMAGE_WEBVIEW2_SDK_ROOT'):
        result['AFTERIMAGE_WEBVIEW2_SDK_ROOT'] = os.environ['AFTERIMAGE_WEBVIEW2_SDK_ROOT']
    result['PYTHONUNBUFFERED'] = '1'
    result['PYTHONPATH'] = str(STATE / '_install/lib/site-packages')
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if os.name == 'nt':
        # Child tools report loader failures through their exit codes, never
        # desktop dialogs. This changes only this process and its children.
        errors = 0x0001 | 0x0002 | 0x8000
        previous = ctypes.windll.kernel32.SetErrorMode(errors)
        ctypes.windll.kernel32.SetErrorMode(previous | errors)
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['dependencies', 'configure', 'build', 'install', 'test-session', 'test-workflow'])
    parser.add_argument('--jobs', type=int, default=max(1, (os.cpu_count() or 4) // 2))
    parser.add_argument('--target', default='all')
    args = parser.parse_args()
    env = environment()
    cmake = str(STATE / 'venv/Scripts/cmake.exe')
    if args.action == 'test-workflow':
        result = subprocess.call([cmake, '--build', str(STATE / 'build'), '--parallel', str(args.jobs),
                                  '--target', 'afterimage_workflow_tests', 'kritaafterimage'], cwd=STATE, env=env)
        if result:
            return result
        result = subprocess.call([sys.executable, str(Path(__file__).with_name('run-native-check.py')),
                                  'afterimage_workflow_tests.exe', '-o',
                                  str(STATE / 'workflow-results.txt') + ',txt'], cwd=ROOT)
        if (STATE / 'workflow-results.txt').is_file():
            print((STATE / 'workflow-results.txt').read_text(encoding='utf-8', errors='replace'))
        return result
    if args.action == 'test-session':
        env['QT_QPA_PLATFORM'] = 'offscreen'
        env['QT_PLUGIN_PATH'] = str(STATE / '_install/plugins')
        commands = [
            [cmake, '-S', str(ROOT / 'plugins/dockers/afterimage/tests'), '-B', str(STATE / 'session-tests'),
             '-G', 'Ninja', '-DCMAKE_CXX_COMPILER=clang++', '-DCMAKE_PREFIX_PATH=' + str(STATE / '_install')],
            [cmake, '--build', str(STATE / 'session-tests'), '--parallel', str(args.jobs)],
            [str(STATE / 'session-tests/afterimage_session_tests.exe'), '-o', str(STATE / 'session-test-results.txt') + ',txt']]
        for command in commands:
            result = subprocess.call(command, cwd=STATE, env=env)
            if result:
                print('Failed:', command[0], 'exit', result)
                return result
        print((STATE / 'session-test-results.txt').read_text(encoding='utf-8'))
        return 0
    if args.action == 'dependencies':
        command = [str(STATE / 'venv/Scripts/python.exe'), '-u',
                   str(STATE / 'deps-management/tools/setup-env.py'), '--full-krita-env',
                   '--venv', str(STATE / 'venv'), '--path', str(STATE / 'toolchain/llvm-mingw-20251118-ucrt-x86_64/bin'),
                   '--path', str(STATE / 'venv/Scripts')]
    elif args.action == 'configure':
        command = [cmake, '-S', str(ROOT), '-B', str(STATE / 'build'), '-G', 'Ninja',
                   '-DCMAKE_BUILD_TYPE=RelWithDebInfo', '-DCMAKE_C_COMPILER=clang', '-DCMAKE_CXX_COMPILER=clang++',
                   '-DCMAKE_PREFIX_PATH=' + str(STATE / '_install'),
                   '-DCMAKE_INSTALL_PREFIX=' + str(STATE / '_install'), '-DXSIMD_ARCH=x86-64',
                   '-DSIP_MODULE_EXECUTABLE=' + str(STATE / 'venv/Scripts/sip-module.exe'),
                   '-DBUILD_TESTING=OFF', '-DFOUNDATION_BUILD=ON', '-DKRITA_ENABLE_PCH=OFF']
    elif args.action == 'build':
        command = [cmake, '--build', str(STATE / 'build'), '--parallel', str(args.jobs), '--target', args.target]
    else:
        command = [cmake, '--install', str(STATE / 'build')]
    return subprocess.call(command, cwd=STATE, env=env)


if __name__ == '__main__':
    raise SystemExit(main())
