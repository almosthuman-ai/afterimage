// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The host owns the exact bound KisDocument. No command consults the active tab.

type HostReply = { kind: 'reply'; id: number; ok: boolean; value?: unknown; error?: string };
type HostEvent = { kind: 'event'; name: string; payload?: unknown };
type HostMessage = HostReply | HostEvent;
type NativeWebView = {
  postMessage: (value: unknown) => void;
  addEventListener: (name: 'message', listener: (event: MessageEvent<HostMessage>) => void) => void;
};

declare global {
  interface Window {
    chrome?: { webview?: NativeWebView };
  }
}

const webview = window.chrome?.webview;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (cause: Error) => void }>();
const listeners = new Map<string, Set<(event: { event: string; payload: unknown }) => void>>();
let serial = 0;

webview?.addEventListener('message', ({ data }) => {
  if (data.kind === 'reply') {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.ok) request.resolve(data.value);
    else request.reject(new Error(data.error || 'Native Temple operation failed.'));
  } else if (data.kind === 'event') {
    for (const callback of listeners.get(data.name) ?? []) callback({ event: data.name, payload: data.payload });
  }
});

export function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!webview) return Promise.reject(new Error('The native Temple Studio host is unavailable.'));
  const id = ++serial;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    webview.postMessage({ kind: 'invoke', id, command, args });
  });
}

export function convertFileSrc(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `https://studio.afterimage.local/assets?path=${encodeURIComponent(path)}`;
}

export async function listen<T>(name: string, callback: (event: { event: string; payload: T }) => void): Promise<() => void> {
  const callbacks = listeners.get(name) ?? new Set();
  callbacks.add(callback as (event: { event: string; payload: unknown }) => void);
  listeners.set(name, callbacks);
  return () => {
    callbacks.delete(callback as (event: { event: string; payload: unknown }) => void);
    if (!callbacks.size) listeners.delete(name);
  };
}

export async function open(options: Record<string, unknown> = {}): Promise<string | null> {
  return invoke('dialog_open', { options });
}

export async function save(options: Record<string, unknown> = {}): Promise<string | null> {
  return invoke('dialog_save', { options });
}

export async function uploadImage(source: Blob, fileName: string): Promise<{ filePath: string; previewDataUrl: string }> {
  const response = await fetch(`/native/upload?name=${encodeURIComponent(fileName)}`, {
    method: 'POST', body: source, headers: { 'Content-Type': source.type || 'image/png' },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
