// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { registerAllHandlers } from './handlers';
import { handleMessage } from './message-router';
import { clipHandler } from './clip-handler';
import { clipPageHandler } from './clip-page-handler';
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
      id: 'sonto-clip-page',
      title: 'Clip Page',
      contexts: ['page'],
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

  if (info.menuItemId === 'sonto-clip-page') {
    void (async () => {
      try {
        const result = await clipPageHandler.clipPage();
        if (result.ok) {
          if (tab?.id) {
            void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: 'Page clipped.' }).catch(() => {});
          }
          void chrome.runtime.sendMessage({ type: MSG.CLIP_ADDED }).catch(() => {});
        } else {
          if (tab?.id) {
            void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: result.message, isError: true }).catch(() => {});
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Clip failed.';
        if (tab?.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: msg, isError: true }).catch(() => {});
        }
      }
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


chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  return handleMessage(message, sender, sendResponse);
});

registerAllHandlers();

void badgeHandler.restoreBadge();
