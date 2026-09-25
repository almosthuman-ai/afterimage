#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Afterimage contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the real runtime protocol with an isolated signed-out account, without model calls."""
import argparse
import importlib.util
import json
from pathlib import Path
import queue
import subprocess
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', type=Path, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('build', Path(__file__).with_name('build-windows.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
root = build.STATE / 'protocol-smoke'
home = root / 'codex'
home.mkdir(parents=True, exist_ok=True)
env = build.environment()
env['CODEX_HOME'] = str(home)
messages = queue.Queue()

with (root / 'runtime.stderr.log').open('w', encoding='utf-8') as diagnostic:
    process = subprocess.Popen([str(args.runtime), 'app-server', '-c', 'features.image_generation=true'],
        cwd=root, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=diagnostic,
        text=True, encoding='utf-8')

    def read():
        for line in process.stdout:
            messages.put(json.loads(line))
        messages.put(None)

    threading.Thread(target=read, daemon=True).start()

    def request(number, method, params, unmaterialized_thread=None):
        process.stdin.write(json.dumps({'id': number, 'method': method, 'params': params}) + '\n')
        process.stdin.flush()
        deadline = time.monotonic() + 30
        while True:
            try:
                message = messages.get(timeout=max(.1, deadline - time.monotonic()))
            except queue.Empty:
                raise RuntimeError(f'{method}: no response; see {root / "runtime.stderr.log"}')
            if message is None:
                raise RuntimeError(f'Runtime exited during {method}; see {root / "runtime.stderr.log"}')
            if message.get('id') != number:
                continue
            if 'error' in message:
                error = message['error']
                if unmaterialized_thread and error.get('code') == -32600 and error.get('message', '').startswith(f'thread {unmaterialized_thread} is not materialized yet;'):
                    print(method + ': correctly reports that the new thread has no persisted messages', flush=True)
                    return {}
                raise RuntimeError(f'{method}: {message["error"]}')
            print(method + ': accepted', flush=True)
            return message.get('result', {})

    try:
        request(1, 'initialize', {'clientInfo': {'name': 'afterimage', 'title': 'Afterimage', 'version': '0.1.0'},
            'capabilities': {'experimentalApi': True}})
        process.stdin.write('{"method":"initialized","params":{}}\n')
        process.stdin.flush()
        account = request(2, 'account/read', {'refreshToken': False})
        assert not account.get('account'), 'Protocol probe must remain signed out'
        tool = {'type': 'function', 'name': 'afterimage_document', 'description': 'Inspect the bound artwork.',
            'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}}
        thread = request(3, 'thread/start', {'cwd': str(root), 'approvalPolicy': 'on-request',
            'sandbox': 'workspace-write', 'dynamicTools': [tool]})
        request(4, 'thread/turns/list', {'threadId': thread['thread']['id'], 'sortDirection': 'desc', 'itemsView': 'full', 'limit': 20}, unmaterialized_thread=thread['thread']['id'])
        print('Isolated signed-out protocol check passed. No model request was made.')
    finally:
        process.stdin.close()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
