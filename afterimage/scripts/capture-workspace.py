#!/usr/bin/env python3
"""Render one real Afterimage workspace on a never-switched Windows desktop."""
import ctypes
import os
from pathlib import Path
import subprocess
import sys
import uuid


class BasicLimit(ctypes.Structure):
    _fields_ = [
        ('per_process_time', ctypes.c_longlong), ('per_job_time', ctypes.c_longlong),
        ('flags', ctypes.c_uint32), ('min_working_set', ctypes.c_size_t),
        ('max_working_set', ctypes.c_size_t), ('active_process_limit', ctypes.c_uint32),
        ('affinity', ctypes.c_size_t), ('priority_class', ctypes.c_uint32),
        ('scheduling_class', ctypes.c_uint32)]


class IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in (
        'read_operations', 'write_operations', 'other_operations',
        'read_bytes', 'write_bytes', 'other_bytes')]


class ExtendedLimit(ctypes.Structure):
    _fields_ = [('basic', BasicLimit), ('io', IoCounters),
                ('process_memory_limit', ctypes.c_size_t),
                ('job_memory_limit', ctypes.c_size_t),
                ('peak_process_memory_used', ctypes.c_size_t),
                ('peak_job_memory_used', ctypes.c_size_t)]


class StartupInfo(ctypes.Structure):
    _fields_ = [('cb', ctypes.c_uint32), ('reserved', ctypes.c_void_p),
                ('desktop', ctypes.c_wchar_p), ('title', ctypes.c_wchar_p),
                ('x', ctypes.c_uint32), ('y', ctypes.c_uint32),
                ('x_size', ctypes.c_uint32), ('y_size', ctypes.c_uint32),
                ('x_count_chars', ctypes.c_uint32), ('y_count_chars', ctypes.c_uint32),
                ('fill_attribute', ctypes.c_uint32), ('flags', ctypes.c_uint32),
                ('show_window', ctypes.c_uint16), ('reserved2_bytes', ctypes.c_uint16),
                ('reserved2', ctypes.c_void_p), ('std_input', ctypes.c_void_p),
                ('std_output', ctypes.c_void_p), ('std_error', ctypes.c_void_p)]


class ProcessInfo(ctypes.Structure):
    _fields_ = [('process', ctypes.c_void_p), ('thread', ctypes.c_void_p),
                ('process_id', ctypes.c_uint32), ('thread_id', ctypes.c_uint32)]


def main():
    if os.name != 'nt' or len(sys.argv) != 4:
        print('Usage: capture-workspace.py <existing KRA> <output PNG> <isolated resources>',
              file=sys.stderr)
        return 2
    source, output, resources = [Path(argument).resolve() for argument in sys.argv[1:]]
    if not source.is_file() or source.suffix.lower() != '.kra' or \
            output.suffix.lower() != '.png' or not output.parent.is_dir() or \
            not resources.is_dir():
        print('Capture needs an existing KRA, PNG parent, and isolated resource folder.',
              file=sys.stderr)
        return 2

    project = Path(__file__).resolve().parents[2]
    launcher = project / 'afterimage/scripts/run-native-check.py'
    python = project / '.afterimage/venv/Scripts/python.exe'
    if not launcher.is_file() or not python.is_file():
        print('The canonical native-check launcher is unavailable.', file=sys.stderr)
        return 2

    desktop_name = 'AfterimageWorkspaceProof-' + uuid.uuid4().hex
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    user32.CreateDesktopW.argtypes = [ctypes.c_wchar_p, ctypes.c_void_p,
                                      ctypes.c_void_p, ctypes.c_uint32,
                                      ctypes.c_uint32, ctypes.c_void_p]
    user32.CreateDesktopW.restype = ctypes.c_void_p
    desktop = user32.CreateDesktopW(desktop_name, None, None, 0,
                                     0x0002 | 0x0001 | 0x0080, None)
    if not desktop:
        print(f'Could not create private workspace desktop: {ctypes.get_last_error()}',
              file=sys.stderr)
        return 2

    job = None
    process = ProcessInfo()
    try:
        kernel32.CreateJobObjectW.restype = ctypes.c_void_p
        job = kernel32.CreateJobObjectW(None, None)
        limits = ExtendedLimit()
        limits.basic.flags = 0x2000  # Kill owned children if this proof wrapper exits.
        if not job or not kernel32.SetInformationJobObject(
                ctypes.c_void_p(job), 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            print(f'Could not own workspace subprocesses: {ctypes.get_last_error()}',
                  file=sys.stderr)
            return 2
        env = os.environ.copy()
        env['AFTERIMAGE_WORKSPACE_PRIVATE_DESKTOP_NAME'] = desktop_name
        env['AFTERIMAGE_WORKSPACE_CAPTURE_OUTPUT'] = str(output)
        command = [str(python), str(launcher), '--installed', 'afterimage.exe',
                   '--nosplash', '--resource-location', str(resources), str(source)]
        command_line = ctypes.create_unicode_buffer(subprocess.list2cmdline(command))
        environment = ctypes.create_unicode_buffer(
            '\0'.join(f'{key}={value}' for key, value in sorted(env.items())) + '\0\0')
        startup = StartupInfo()
        startup.cb = ctypes.sizeof(startup)
        startup.desktop = desktop_name
        kernel32.CreateProcessW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p,
            ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_uint32,
            ctypes.c_void_p, ctypes.c_wchar_p, ctypes.POINTER(StartupInfo),
            ctypes.POINTER(ProcessInfo)]
        if not kernel32.CreateProcessW(str(python), command_line, None, None, False,
                0x00000004 | 0x08000000 | 0x00000400, environment, str(project),
                ctypes.byref(startup), ctypes.byref(process)):
            print(f'Could not launch private workspace: {ctypes.get_last_error()}',
                  file=sys.stderr)
            return 2
        if not kernel32.AssignProcessToJobObject(ctypes.c_void_p(job), process.process):
            print(f'Could not own workspace subprocesses: {ctypes.get_last_error()}',
                  file=sys.stderr)
            return 2
        if kernel32.ResumeThread(process.thread) == 0xFFFFFFFF:
            print(f'Could not resume private workspace: {ctypes.get_last_error()}',
                  file=sys.stderr)
            return 2
        if kernel32.WaitForSingleObject(process.process, 180000) != 0:
            print('Private workspace proof exceeded three minutes.', file=sys.stderr)
            return 1
        code = ctypes.c_uint32()
        if not kernel32.GetExitCodeProcess(process.process, ctypes.byref(code)):
            return 2
        return code.value
    finally:
        if job:
            kernel32.CloseHandle(ctypes.c_void_p(job))
        if process.thread:
            kernel32.CloseHandle(process.thread)
        if process.process:
            kernel32.CloseHandle(process.process)
        user32.CloseDesktop(ctypes.c_void_p(desktop))


if __name__ == '__main__':
    raise SystemExit(main())
