// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { registerAllHandlers } from './handlers';
import { handleMessage } from './message-router';
import { clipHandler } from './clip-handler';
import { readLaterHandler } from './read-later-handler';
import { badgeHandler } from './badge-handler';
import { sontoItemHandler } from './sonto-item-handler';
import { runMigrationIfNeeded } from './migration';
import type { RuntimeMessage } from '../shared/messages';

chrome.runtime.onInstalled.addListener((details) => {
  void runMigrationIfNeeded();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'sonto-save',
      title: 'Save to Clipboard History',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: 'sonto-save-prompt',
      title: 'Save as Prompt',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: 'sonto-read-later',
      title: 'Read Later in Sonto',
      contexts: ['page', 'link'],
    });
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
        await clipHandler.capture(text, 'context-menu', url, title);
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

  if (info.menuItemId === 'sonto-save-prompt') {
    const text = info.selectionText ?? '';
    if (!text.trim()) return;
    void (async () => {
      try {
        await sontoItemHandler.create(text, 'prompt', 'context-menu');
        void chrome.runtime.sendMessage({ type: MSG.PROMPT_ADDED }).catch(() => {});
        if (tab?.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: 'Saved as prompt.' }).catch(() => {});
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
      await readLaterHandler.add(url, title);
    })();
    return;
  }
});

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (command === 'capture_selection') {
      await chrome.tabs.sendMessage(tab.id, { type: 'SONTO_CAPTURE_SHORTCUT' });
    }

    if (command === 'quick_search') {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.QUICK_SEARCH });
    }
  })();
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    console.error('Failed to open side panel:', e);
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    void (async () => {
      const item = await readLaterHandler.checkUrl(tab.url!);
      if (item) {
        try {
          await clipHandler.capture(item.title ? `${item.title} — ${tab.url}` : tab.url!, 'manual', tab.url, item.title);
        } catch (err) {
          console.error('[Sonto] read-later capture failed:', err);
        }
      }
    })();
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  return handleMessage(message, sender, sendResponse);
});

registerAllHandlers();

void badgeHandler.restoreBadge();
