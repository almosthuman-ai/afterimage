"""Exercise the bundled Temple sketch on an isolated Windows desktop.

No desktop switching or screen capture occurs. The only result is the PNG and
text log in the requested output directory. This is a development probe, not
an application dependency.
"""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import uuid

from PIL import Image


class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD), ("lpReserved", wintypes.LPWSTR),
        ("lpDesktop", wintypes.LPWSTR), ("lpTitle", wintypes.LPWSTR),
        ("dwX", wintypes.DWORD), ("dwY", wintypes.DWORD),
        ("dwXSize", wintypes.DWORD), ("dwYSize", wintypes.DWORD),
        ("dwXCountChars", wintypes.DWORD), ("dwYCountChars", wintypes.DWORD),
        ("dwFillAttribute", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
        ("wShowWindow", wintypes.WORD), ("cbReserved2", wintypes.WORD),
        ("lpReserved2", ctypes.c_void_p), ("hStdInput", wintypes.HANDLE),
        ("hStdOutput", wintypes.HANDLE), ("hStdError", wintypes.HANDLE),
    ]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess", wintypes.HANDLE), ("hThread", wintypes.HANDLE),
        ("dwProcessId", wintypes.DWORD), ("dwThreadId", wintypes.DWORD),
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--processing-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--diagnose-form", action="store_true")
    args = parser.parse_args()
    args.output_dir = args.output_dir.resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    resources = Path(__file__).resolve().parents[1] / "resources"
    app = args.processing_root.resolve() / "app"
    java = app / "resources/jdk/bin/java.exe"
    output = args.output_dir / "private-processing.png"
    log_path = args.output_dir / "private-processing.log"

    with tempfile.TemporaryDirectory(prefix="temple-probe-") as temp:
        root = Path(temp)
        sketch = root / "TempleSeed"
        shutil.copytree(resources, sketch)
        source = root / "source.png"
        image = Image.new("RGBA", (160, 120))
        for y in range(120):
            for x in range(160):
                image.putpixel((x, y), (x * 255 // 159, y * 255 // 119, 120, 255))
        image.save(source)
        recipe = {
            "schemaVersion": 1, "seed": 886, "iteration": 0,
            "processStage": "chain", "baseMode": "field",
            "sourceFit": "contain", "sourceBackground": "keep",
            "colorMode": "source", "sourcePresence": 0,
            "palette": [5912639, 11102555, 13744796, 15921901],
            "layers": [],
            "effects": [{"id": "probe-band", "type": "band-rupture", "enabled": True,
                         "parameters": {"rupture": .48, "bands": 16, "scar": .24, "memory": .72},
                         "where": {"mode": "light", "threshold": .5, "softness": .12,
                                   "targetMemory": "source", "invert": False}}],
        }
        state = {"seed": 886, "parameters": {}, "recipe": recipe,
                 "width": 160, "height": 120, "frames": 1, "paletteRepeats": 1,
                 "outputDir": str(args.output_dir), "outputFile": str(output),
                 "sourceImage": str(source)}
        (sketch / "render-state.json").write_text('{"serve":true}', encoding="utf-8")

        user32 = ctypes.WinDLL("user32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        create_desktop = user32.CreateDesktopW
        create_desktop.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.c_void_p,
                                   wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        create_desktop.restype = wintypes.HANDLE
        close_desktop = user32.CloseDesktop
        close_desktop.argtypes = [wintypes.HANDLE]
        create_process = kernel32.CreateProcessW
        create_process.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p,
                                   ctypes.c_void_p, wintypes.BOOL, wintypes.DWORD,
                                   ctypes.c_void_p, wintypes.LPCWSTR,
                                   ctypes.POINTER(STARTUPINFOW), ctypes.POINTER(PROCESS_INFORMATION)]
        create_process.restype = wintypes.BOOL
        desktop_name = "AfterimageTempleProbe-" + uuid.uuid4().hex
        desktop = create_desktop(desktop_name, None, None, 0, 0x0002 | 0x0001 | 0x0080, None)
        if not desktop:
            raise OSError(ctypes.get_last_error(), "CreateDesktopW failed")
        try:
            import msvcrt
            import win32api
            import win32con
            import win32job
            job = win32job.CreateJobObject(None, "AfterimageTempleProbe-" + uuid.uuid4().hex)
            limits = win32job.QueryInformationJobObject(job, win32job.JobObjectExtendedLimitInformation)
            limits["BasicLimitInformation"]["LimitFlags"] = win32job.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            win32job.SetInformationJobObject(job, win32job.JobObjectExtendedLimitInformation, limits)
            with open(log_path, "wb") as log:
                handle = msvcrt.get_osfhandle(log.fileno())
                os.set_handle_inheritable(handle, True)
                startup = STARTUPINFOW()
                startup.cb = ctypes.sizeof(startup)
                startup.lpDesktop = desktop_name
                startup.dwFlags = 0x00000001 | 0x00000100
                startup.wShowWindow = 0
                startup.hStdInput = handle
                startup.hStdOutput = handle
                startup.hStdError = handle
                proc = PROCESS_INFORMATION()
                command = [str(java), "--enable-native-access=ALL-UNNAMED",
                           "-Dcompose.application.resources.dir=" + str(app / "resources"),
                           "-Dcompose.application.configure.swing.globals=true",
                           "-Dprocessing.version=4.5.6", "-Dprocessing.revision=1434",
                           "-Dskiko.library.path=" + str(app),
                           "-cp", str(app / "*"), "processing.app.ProcessingKt", "cli",
                           "--sketch=" + str(sketch), "--run"]
                import subprocess
                command_line = ctypes.create_unicode_buffer(subprocess.list2cmdline(command))
                started = create_process(str(java), command_line, None, None, True,
                                         0x08000000 | 0x00000200 | 0x00000004, None, str(app),
                                         ctypes.byref(startup), ctypes.byref(proc))
                if not started:
                    raise OSError(ctypes.get_last_error(), "CreateProcessW failed")
                try:
                    owned = win32api.OpenProcess(win32con.PROCESS_ALL_ACCESS, False, proc.dwProcessId)
                    try:
                        win32job.AssignProcessToJobObject(job, owned)
                    finally:
                        owned.Close()
                    kernel32.ResumeThread(proc.hThread)
                    for cycle in range(2):
                        if cycle:
                            state["recipe"]["effects"][0]["parameters"]["rupture"] = .8
                            state["outputFile"] = str(args.output_dir / "private-processing-second.png")
                        state["requestId"] = f"probe-{cycle}"
                        started_at = time.monotonic()
                        (sketch / "request.json").write_text(json.dumps(state), encoding="utf-8")
                        response_path = sketch / "response.json"
                        while not response_path.exists():
                            if time.monotonic() - started_at > 180:
                                raise TimeoutError("Persistent Processing did not render within three minutes")
                            if kernel32.WaitForSingleObject(proc.hProcess, 0) == 0:
                                raise RuntimeError("Persistent Processing exited; inspect the log")
                            time.sleep(.04)
                        response = json.loads(response_path.read_text(encoding="utf-8"))
                        response_path.unlink()
                        if response.get("error"):
                            raise RuntimeError(response["error"])
                        produced = Path(state["outputFile"])
                        if not produced.is_file():
                            raise RuntimeError("Private Processing did not return PNG; inspect the log")
                        with Image.open(produced) as rendered:
                            assert rendered.size == (160, 120), rendered.size
                        print(f"cycle={cycle} seconds={time.monotonic()-started_at:.3f} output={produced}")
                    if args.diagnose_form:
                        for edge in (160, 512, 1024):
                            form_recipe = {
                                "schemaVersion": 1, "revision": 1, "seed": 250405,
                                "baseMode": "kone", "processStage": "form", "sourcePresence": 0,
                                "palette": [0xC4FF23, 0x833DFF, 0xFF58AD, 0x111525],
                                "layers": [], "effects": [], "scorePosition": .31,
                                "koneForm": {"kind": "kone-form", "family": "kone", "seed": 250405,
                                             "parameters": {"ribCount": 32, "bodyRadius": .25,
                                                            "budding": 0, "molt": 0}},
                            }
                            form_path = args.output_dir / f"minimal-form-{edge}.png"
                            state_form = {"requestId": f"minimal-form-{edge}", "seed": 250405,
                                          "diagnostic": True,
                                          "parameters": {}, "recipe": form_recipe,
                                          "width": edge, "height": edge, "frames": 1,
                                          "paletteRepeats": 1, "outputDir": str(args.output_dir),
                                          "outputFile": str(form_path), "sourceImage": None}
                            started_at = time.monotonic()
                            (sketch / "request.json").write_text(json.dumps(state_form), encoding="utf-8")
                            response_path = sketch / "response.json"
                            while not response_path.exists():
                                if time.monotonic() - started_at > 12:
                                    print(f"form edge={edge} timeout=12s", flush=True)
                                    return
                                if kernel32.WaitForSingleObject(proc.hProcess, 0) == 0:
                                    raise RuntimeError("Persistent Processing exited during FORM diagnostic")
                                time.sleep(.05)
                            response = json.loads(response_path.read_text(encoding="utf-8"))
                            response_path.unlink()
                            print(f"form edge={edge} seconds={time.monotonic()-started_at:.3f} response={response} path={form_path}", flush=True)
                        return
                    art = {
                        "schemaVersion": 1, "revision": 1, "seed": 250405, "iteration": 0,
                        "scorePosition": .31, "baseMode": "kone", "processStage": "chain",
                        "sourceFit": "contain", "sourceBackground": "keep", "colorMode": "palette",
                        "sourcePresence": 0, "palette": [0xC4FF23, 0x833DFF, 0xFF58AD, 0x111525],
                        "layers": [], "effects": [
                            {"id": "temple-signal", "type": "signal-echo", "enabled": True,
                             "parameters": {"separation": 10, "bleed": .23, "scan": .18, "ghost": .22},
                             "where": {"mode": "edges", "threshold": .34, "softness": .18,
                                       "targetMemory": "source", "invert": False}}
                        ],
                        "formSelected": "kone-main",
                        "koneForm": {"kind": "kone-form", "family": "kone", "seed": 250405,
                                     "parameters": {"bodyRadius": .29, "axisStretch": 1.18,
                                                    "lobes": 7, "breathDepth": .38, "opening": .73,
                                                    "ribCount": 155, "twist": 1.57, "turn": 221,
                                                    "wound": .12, "foldDepth": .18, "molt": .18,
                                                    "budding": .1, "formPartX": .44, "formPartY": .5,
                                                    "formPartScale": .91, "formPartTurn": -12,
                                                    "formPartOpacity": 1}},
                    }
                    art["formStack"] = [{"id": "kone-main", "label": "Electric shell", "enabled": True,
                                         "form": art["koneForm"]},
                                        {"id": "knot-companion", "label": "Second body", "enabled": True,
                                         "form": {"kind": "kone-form", "family": "kone", "seed": 909089,
                                                  "parameters": {"bodyRadius": .23, "axisStretch": .82,
                                                                 "lobes": 4, "breathDepth": .51, "opening": .45,
                                                                 "ribCount": 95, "twist": 2.1, "turn": 141,
                                                                 "wound": .26, "foldDepth": .22,
                                                                 "formPartX": .73, "formPartY": .56,
                                                                 "formPartScale": .48, "formPartTurn": 28,
                                                                 "formPartOpacity": .83}}}]
                    art_path = args.output_dir / "temple-form-1024.png"
                    (args.output_dir / "temple-form-1024.recipe.json").write_text(
                        json.dumps(art, indent=2), encoding="utf-8")
                    art_state = {"requestId": "temple-form-art", "seed": 250405, "parameters": {},
                                 "recipe": art, "width": 1024, "height": 1024, "frames": 1,
                                 "paletteRepeats": 1, "outputDir": str(args.output_dir),
                                 "outputFile": str(art_path), "sourceImage": None}
                    started_at = time.monotonic()
                    (sketch / "request.json").write_text(json.dumps(art_state), encoding="utf-8")
                    response_path = sketch / "response.json"
                    while not response_path.exists():
                        if time.monotonic() - started_at > 180:
                            raise TimeoutError("The 1024px Temple study exceeded three minutes")
                        if kernel32.WaitForSingleObject(proc.hProcess, 0) == 0:
                            raise RuntimeError("Persistent Processing exited during the art render")
                        time.sleep(.05)
                    response = json.loads(response_path.read_text(encoding="utf-8"))
                    if response.get("error"):
                        raise RuntimeError(response["error"])
                    with Image.open(art_path) as rendered:
                        assert rendered.size == (1024, 1024), rendered.size
                    print(f"art seconds={time.monotonic()-started_at:.3f} output={art_path}")
                finally:
                    job.Close()
                    kernel32.CloseHandle(proc.hThread)
                    kernel32.CloseHandle(proc.hProcess)
        finally:
            close_desktop(desktop)


if __name__ == "__main__":
    main()
