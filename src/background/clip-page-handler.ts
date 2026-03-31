// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { sontoItemHandler } from './sonto-item-handler';
import type { ClipPageMessage } from '../shared/messages';

export class ClipPageHandler {
  async clipPage(): Promise<{ ok: true; item?: unknown } | { ok: false; message: string }> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        return { ok: false, message: 'Cannot clip this page type. Navigate to a regular web page.' };
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: MSG.CLIP_PAGE });

      if (!response?.success) {
        return { ok: false, message: response?.error ?? 'Failed to extract page content.' };
      }

      const content = response.content as string;
      const title = response.title as string;
      const url = response.url as string;

      if (!content || content.trim().length < 20) {
        return { ok: false, message: 'No meaningful content found on this page.' };
      }

      const item = await sontoItemHandler.create(content, 'clip', 'page-clip', {
        contentType: 'text',
        url,
        title,
        tags: [],
      });

      return { ok: true, item };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clip failed.';
      if (msg.includes('Receiving end does not exist')) {
        return { ok: false, message: 'Extension not connected to this tab. Try refreshing the page.' };
      }
      return { ok: false, message: msg };
    }
  }
}

export const clipPageHandler = new ClipPageHandler();

export function registerClipPageHandlers(
  register: (type: string, handler: import('./message-router').MessageHandler) => void,
): void {
  register(MSG.CLIP_PAGE, async () => {
    const result = await clipPageHandler.clipPage();
    return result;
  });
}
