// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG, type RuntimeMessage } from '../shared/messages';
import {
  addClip,
  deleteClip,
  getAllClips,
  updateClip,
  clearAllClips,
  searchClips,
} from '../shared/embeddings/vector-store';
import { MAX_CAPTURE_CHARS } from '../shared/constants';
import {
  getReadLater,
  saveReadLater,
  getMaxHistorySize,
  getClipboardMonitoring,
} from '../shared/storage';
import type { ClipItem, ClipContentType, ClipSource } from '../shared/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function detectContentType(text: string): ClipContentType {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/.test(trimmed)) return 'link';
  if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(trimmed)) return 'email';
  if (/^```[\s\S]*```$/.test(trimmed) || /^\s{4}/.test(trimmed) || /[{}()[\];]/.test(trimmed.slice(0, 80))) return 'code';
  return 'text';
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildTags(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const main = hostname.split('.').slice(0, -1).join(' ').trim();
    return main ? [main.toLowerCase().slice(0, 32)] : [];
  } catch {
    return [];
  }
}

async function isRepeatOfLastClip(text: string): Promise<boolean> {
  const normalized = normalizeText(text);
  const all = await getAllClips();
  if (all.length === 0) return false;
  return normalizeText(all[0].text) === normalized;
}

async function enforceHistoryLimit(): Promise<void> {
  const [maxSize, all] = await Promise.all([getMaxHistorySize(), getAllClips()]);
  if (all.length <= maxSize) return;

  const nonPinned = all.filter((c) => !c.pinned);
  const toRemove = nonPinned.slice(-(all.length - maxSize));
  await Promise.all(toRemove.map((c) => deleteClip(c.id)));
}

async function captureClip(
  text: string,
  source: ClipSource,
  url?: string,
  title?: string,
): Promise<void> {
  const trimmed = text.slice(0, MAX_CAPTURE_CHARS);
  if (!trimmed.trim()) throw new Error('Nothing to save.');

  const monitoring = await getClipboardMonitoring();
  if (!monitoring && source === 'clipboard') throw new Error('Clipboard monitoring is off.');

  if (await isRepeatOfLastClip(trimmed)) throw new Error('Already in clipboard history.');

  const contentType = detectContentType(trimmed);
  const tags = buildTags(url);

  const clip: ClipItem = {
    id: generateId(),
    text: trimmed,
    contentType,
    source,
    timestamp: Date.now(),
    ...(url ? { url } : {}),
    ...(title ? { title } : {}),
    ...(tags.length ? { tags } : {}),
  };

  await addClip(clip);
  await enforceHistoryLimit();
  void chrome.runtime.sendMessage({ type: MSG.CLIP_ADDED }).catch(() => {});
}

async function checkReadLaterForTab(url: string): Promise<void> {
  const items = await getReadLater();
  const idx = items.findIndex((i) => i.url === url);
  if (idx === -1) return;

  const item = items[idx];
  items.splice(idx, 1);
  await saveReadLater(items);

  try {
    await captureClip(item.title ? `${item.title} — ${url}` : url, 'manual', url, item.title);
  } catch (err) {
    console.error('[Sonto] read-later capture failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sonto-save',
    title: 'Save to Clipboard History',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'sonto-read-later',
    title: 'Read Later in Sonto',
    contexts: ['page', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sonto-save') {
    const text = info.selectionText ?? '';
    const url = tab?.url ?? '';
    const title = tab?.title ?? '';
    if (!text.trim()) return;
    void (async () => {
      try {
        await captureClip(text, 'context-menu', url, title);
        if (tab?.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: 'Saved to clipboard history.' }).catch(() => {});
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Save failed.';
        if (tab?.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: msg, isError: true }).catch(() => {});
        }
      }
    })();
    return;
  }

  if (info.menuItemId === 'sonto-read-later') {
    const url = info.linkUrl ?? tab?.url ?? '';
    const title = info.linkUrl ? undefined : tab?.title;
    if (!url) return;
    void (async () => {
      const items = await getReadLater();
      if (!items.some((i) => i.url === url)) {
        items.push({ url, title, addedAt: Date.now() });
        await saveReadLater(items);
      }
    })();
    return;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'capture_selection') return;

  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'SONTO_CAPTURE_SHORTCUT' });
  })();
});

chrome.action.onClicked.addListener((tab) => {
  void chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    void checkReadLaterForTab(tab.url);
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === MSG.OPEN_SETTINGS) {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === MSG.CAPTURE_CLIP) {
    const { text, url, title, source } = message;
    void captureClip(text, source, url, title)
      .then(() => sendResponse({ ok: true, type: MSG.CAPTURE_SUCCESS }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, type: MSG.CAPTURE_ERROR, message: msg });
      });
    return true;
  }

  if (message.type === MSG.DELETE_CLIP) {
    void deleteClip(message.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, message: msg });
      });
    return true;
  }

  if (message.type === MSG.GET_ALL_CLIPS) {
    void getAllClips()
      .then((clips) => sendResponse({ ok: true, clips }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, message: msg });
      });
    return true;
  }

  if (message.type === MSG.SEARCH_CLIPS) {
    void searchClips(message.query)
      .then((clips) => sendResponse({ ok: true, clips }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, message: msg });
      });
    return true;
  }

  if (message.type === MSG.UPDATE_CLIP) {
    void updateClip(message.clip)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === MSG.CLEAR_CLIPS) {
    void clearAllClips()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === MSG.ADD_READ_LATER) {
    void (async () => {
      const items = await getReadLater();
      if (!items.some((i) => i.url === message.url)) {
        items.push({ url: message.url, title: message.title, addedAt: Date.now() });
        await saveReadLater(items);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === MSG.REMOVE_READ_LATER) {
    void (async () => {
      const items = await getReadLater();
      await saveReadLater(items.filter((i) => i.url !== message.url));
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === MSG.GET_READ_LATER) {
    void getReadLater()
      .then((items) => sendResponse({ ok: true, items }))
      .catch(() => sendResponse({ ok: true, items: [] }));
    return true;
  }
});
