// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';

function showToast(message: string, isError = false): void {
  const existing = document.getElementById('sonto-toast');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'sonto-toast';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      color: #fff;
      background: ${isError ? '#c0392b' : '#1a1a1a'};
      border: 1px solid ${isError ? '#e74c3c' : '#333'};
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-width: 320px;
      word-break: break-word;
      animation: slide-in 0.18s ease-out;
    }
    @keyframes slide-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  setTimeout(() => host.remove(), 2500);
}

let monitoringEnabled = true;
let lastKnownClipboard = '';
let pendingPollTimer: ReturnType<typeof setTimeout> | null = null;

void chrome.storage.local.get('sonto_clipboard_monitoring').then((result) => {
  monitoringEnabled = (result['sonto_clipboard_monitoring'] as boolean | undefined) ?? true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'sonto_clipboard_monitoring' in changes) {
    monitoringEnabled = (changes['sonto_clipboard_monitoring'].newValue as boolean | undefined) ?? true;
  }
});

function sendClip(text: string, source: 'clipboard' | 'shortcut'): void {
  chrome.runtime.sendMessage(
    {
      type: MSG.CAPTURE_CLIP,
      text,
      url: location.href,
      title: document.title,
      source,
    },
    (response) => {
      if (chrome.runtime.lastError) return;
      if (source === 'shortcut') {
        if (response?.ok) {
          showToast('Saved to clipboard history.');
        } else {
          showToast(response?.message ?? 'Save failed.', true);
        }
      }
    },
  );
}

function triggerCapture(): void {
  const text = window.getSelection()?.toString().trim() ?? '';

  if (!text) {
    showToast('Select some text first.', true);
    return;
  }

  sendClip(text, 'shortcut');
}

async function pollClipboard(): Promise<void> {
  if (!monitoringEnabled) return;
  if (!document.hasFocus()) return;

  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text || text === lastKnownClipboard) return;
    lastKnownClipboard = text;
    sendClip(text, 'clipboard');
  } catch {
    // clipboard read permission denied or not available — ignore
  }
}

function schedulePoll(): void {
  if (pendingPollTimer !== null) return;
  pendingPollTimer = setTimeout(() => {
    pendingPollTimer = null;
    void pollClipboard();
  }, 150);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'SONTO_CAPTURE_SHORTCUT') {
    triggerCapture();
  }
  if (message && message.type === 'SONTO_TOAST') {
    showToast(message.message, !!message.isError);
  }
});

// Ctrl+C / keyboard copy — most reliable path
document.addEventListener('copy', (e) => {
  if (!monitoringEnabled) return;

  const text =
    (e.clipboardData?.getData('text/plain') ?? '').trim() ||
    window.getSelection()?.toString().trim() ||
    '';

  if (!text) return;

  lastKnownClipboard = text;
  sendClip(text, 'clipboard');
});

// Right-click context menu "Copy" does not fire the copy event.
// Track selection text and poll the clipboard briefly after mouseup/keyup
// so we catch context menu copies without polling constantly.
document.addEventListener('mouseup', () => {
  const selected = window.getSelection()?.toString().trim() ?? '';
  if (selected) schedulePoll();
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'c' && (e.ctrlKey || e.metaKey)) return; // handled by copy event
  const selected = window.getSelection()?.toString().trim() ?? '';
  if (selected) schedulePoll();
});
