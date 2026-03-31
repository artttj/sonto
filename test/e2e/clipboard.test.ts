// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, closeBrowser, getSidebarPage } from './setup';
import type { Browser, Page } from 'puppeteer';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Clipboard Rendering', () => {
  let browser: Browser;
  let extensionId: string;

  beforeAll(async () => {
    const result = await launchBrowser();
    browser = result.browser;
    extensionId = result.extensionId;
  }, 30000);

  afterAll(async () => {
    await closeBrowser();
  });

  async function addClipViaStorage(page: Page, content: string, options?: { pinned?: boolean; url?: string }): Promise<void> {
    await page.evaluate((data) => {
      const now = Date.now();
      const item = {
        id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'clip',
        content: data.content,
        contentType: data.content.startsWith('http') ? 'link' : data.content.includes('function') ? 'code' : 'text',
        source: 'manual',
        origin: 'manual',
        url: data.options?.url,
        tags: [],
        createdAt: now,
        pinned: data.options?.pinned ?? false,
        zenified: false,
      };

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('sonto_db_v2', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('sonto_items')) {
            const store = db.createObjectStore('sonto_items', { keyPath: 'id' });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('pinned', 'pinned', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('sonto_items', 'readwrite');
          const store = tx.objectStore('sonto_items');
          store.put(item);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, { content, options });
    await delay(200);
  }

  async function addPromptViaStorage(page: Page, content: string, options?: { title?: string; color?: string }): Promise<void> {
    await page.evaluate((data) => {
      const now = Date.now();
      const item = {
        id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'prompt',
        content: data.content,
        contentType: 'text',
        source: 'manual',
        origin: 'user',
        title: data.options?.title,
        tags: [],
        createdAt: now,
        pinned: false,
        zenified: false,
        metadata: data.options?.color ? { color: data.options.color } : undefined,
      };

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('sonto_db_v2', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('sonto_items')) {
            const store = db.createObjectStore('sonto_items', { keyPath: 'id' });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('sonto_items', 'readwrite');
          const store = tx.objectStore('sonto_items');
          store.put(item);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, { content, options });
    await delay(200);
  }

  async function reloadSidebar(page: Page): Promise<void> {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await delay(500);
  }

  it('renders clips with content field from unified storage', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await sidebar.setViewport({ width: 420, height: 800 });

    // Add test clip directly to new unified storage
    const testContent = 'Test clip content for rendering verification';
    await addClipViaStorage(sidebar, testContent);

    // Reload sidebar to trigger re-fetch
    await reloadSidebar(sidebar);

    // Wait for clip list to be populated
    await sidebar.waitForFunction(() => {
      const list = document.querySelector('#clip-list');
      if (!list) return false;
      const cards = list.querySelectorAll('.clip-card');
      return cards.length > 0;
    }, { timeout: 5000 });

    // Verify the clip content is rendered
    const clipText = await sidebar.evaluate(() => {
      const preview = document.querySelector('.clip-text-preview');
      return preview?.textContent ?? '';
    });

    expect(clipText).toContain(testContent);
  }, 20000);

  it('renders code clips with proper formatting', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await sidebar.setViewport({ width: 420, height: 800 });

    const codeContent = 'function hello() { return "world"; }';
    await addClipViaStorage(sidebar, codeContent);
    await reloadSidebar(sidebar);

    await sidebar.waitForFunction(() => {
      const list = document.querySelector('#clip-list');
      return list?.querySelectorAll('.clip-card').length > 0;
    }, { timeout: 5000 });

    const hasCodeBlock = await sidebar.evaluate(() => {
      return !!document.querySelector('.clip-code-preview');
    });

    expect(hasCodeBlock).toBe(true);
  }, 20000);

  it('renders link clips with URL', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await sidebar.setViewport({ width: 420, height: 800 });

    await addClipViaStorage(sidebar, 'https://github.com/artttj/sonto', {
      url: 'https://github.com/artttj/sonto',
    });
    await reloadSidebar(sidebar);

    await sidebar.waitForFunction(() => {
      const list = document.querySelector('#clip-list');
      return list?.querySelectorAll('.clip-card').length > 0;
    }, { timeout: 5000 });

    const hasLink = await sidebar.evaluate(() => {
      return !!document.querySelector('.clip-source-url');
    });

    expect(hasLink).toBe(true);
  }, 20000);

  it('renders pinned clips in pinned section', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await sidebar.setViewport({ width: 420, height: 800 });

    await addClipViaStorage(sidebar, 'Pinned test clip', { pinned: true });
    await reloadSidebar(sidebar);

    await sidebar.waitForFunction(() => {
      const list = document.querySelector('#clip-list');
      return list?.querySelectorAll('.clip-card').length > 0;
    }, { timeout: 5000 });

    const hasPinnedSection = await sidebar.evaluate(() => {
      return !!document.querySelector('.pinned-separator');
    });

    expect(hasPinnedSection).toBe(true);

    const hasPinnedCard = await sidebar.evaluate(() => {
      return !!document.querySelector('.clip-pinned');
    });

    expect(hasPinnedCard).toBe(true);
  }, 20000);

  it('renders prompts with content field', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await sidebar.setViewport({ width: 420, height: 800 });

    const promptContent = 'Test prompt for rendering verification';
    await addPromptViaStorage(sidebar, promptContent, { title: 'Test Prompt' });
    await reloadSidebar(sidebar);

    // Switch to prompts tab
    await sidebar.evaluate(() => {
      const promptsTab = document.querySelector('#nav-prompts') as HTMLElement;
      promptsTab?.click();
    });
    await delay(300);

    // Wait for prompts to render
    await sidebar.waitForFunction(() => {
      const list = document.querySelector('#prompts-list');
      if (!list) return false;
      const cards = list.querySelectorAll('.clip-card');
      return cards.length > 0;
    }, { timeout: 5000 });

    // Verify prompt content is rendered
    const promptText = await sidebar.evaluate(() => {
      const preview = document.querySelector('#prompts-list .clip-text-preview');
      return preview?.textContent ?? '';
    });

    expect(promptText).toContain(promptContent);
  }, 20000);

  it('renders prompts with color tags', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await sidebar.setViewport({ width: 420, height: 800 });

    await addPromptViaStorage(sidebar, 'Colored prompt test', {
      title: 'Colored',
      color: 'blue',
    });
    await reloadSidebar(sidebar);

    // Switch to prompts tab
    await sidebar.evaluate(() => {
      const promptsTab = document.querySelector('#nav-prompts') as HTMLElement;
      promptsTab?.click();
    });
    await delay(300);

    await sidebar.waitForFunction(() => {
      const list = document.querySelector('#prompts-list');
      return list?.querySelectorAll('.clip-card').length > 0;
    }, { timeout: 5000 });

    const hasColorDot = await sidebar.evaluate(() => {
      return !!document.querySelector('.prompt-color-tag');
    });

    expect(hasColorDot).toBe(true);
  }, 20000);
});
