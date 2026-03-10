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

function extractSurroundingContext(selection: Selection): string {
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;
  if (!el) return '';

  const block = el.closest('p, li, blockquote, td, article, section, div') ?? el;
  const text = (block.textContent ?? '').replace(/\s+/g, ' ').trim();
  const selected = selection.toString().trim();

  if (text === selected || text.length < selected.length + 20) return '';
  return text.slice(0, 500);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'SONTO_CAPTURE_SHORTCUT') {
    triggerCapture();
  }
  if (message && message.type === 'SONTO_TOAST') {
    showToast(message.message, !!message.isError);
  }
});

function triggerCapture(): void {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';

  if (!text) {
    showToast('Select some text first.', true);
    return;
  }

  let context: string | undefined;
  if (selection && selection.rangeCount > 0) {
    const surrounding = extractSurroundingContext(selection);
    if (surrounding && surrounding !== text) context = surrounding;
  }

  chrome.runtime.sendMessage({
    type: MSG.CAPTURE_SNIPPET,
    text,
    url: location.href,
    title: document.title,
    ...(context ? { context } : {}),
  }, (response) => {
    if (chrome.runtime.lastError) {
      showToast('Could not save. Try again.', true);
      return;
    }
    if (response?.ok) {
      showToast('Saved to Sonto.');
    } else {
      showToast(response?.message ?? 'Save failed.', true);
    }
  });
}