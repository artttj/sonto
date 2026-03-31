// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, closeBrowser, getSidebarPage, getSettingsPage, takeScreenshot, waitForElement } from './setup';
import type { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function ensureScreenshotDir(): Promise<void> {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function setViewport(page: Page, width: number, height: number, scale: number = 3): Promise<void> {
  await page.setViewport({ width, height, deviceScaleFactor: scale });
}

async function setZenDisplay(page: Page, mode: 'feed' | 'cosmos'): Promise<void> {
  await page.evaluate((m) => {
    chrome.storage.local.set({ sonto_zen_display: m });
  }, mode);
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => {
    chrome.storage.local.set({ sonto_theme: t });
  }, theme);
}

async function addSampleClips(page: Page): Promise<void> {
  await page.evaluate(() => {
    const now = Date.now();
    const clips = [
      {
        id: `${now}-1`,
        type: 'clip',
        content: 'The best way to predict the future is to create it. — Peter Drucker',
        contentType: 'text',
        source: 'manual',
        origin: 'manual',
        tags: [],
        createdAt: now - 3600000,
        pinned: true,
        zenified: false,
      },
      {
        id: `${now}-2`,
        type: 'clip',
        content: 'function debounce(fn: Function, ms: number) {\n  let timeout: ReturnType<typeof setTimeout>;\n  return (...args: unknown[]) => {\n    clearTimeout(timeout);\n    timeout = setTimeout(() => fn(...args), ms);\n  };\n}',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: [],
        createdAt: now - 7200000,
        pinned: false,
        zenified: false,
      },
      {
        id: `${now}-3`,
        type: 'clip',
        content: 'https://github.com/artttj/sonto',
        contentType: 'link',
        source: 'clipboard',
        origin: 'clipboard',
        url: 'https://github.com/artttj/sonto',
        title: 'artttj/sonto - GitHub',
        tags: [],
        createdAt: now - 10800000,
        pinned: false,
        zenified: false,
      },
      {
        id: `${now}-4`,
        type: 'clip',
        content: 'Simplicity is the ultimate sophistication. — Leonardo da Vinci',
        contentType: 'text',
        source: 'manual',
        origin: 'manual',
        tags: [],
        createdAt: now - 14400000,
        pinned: false,
        zenified: false,
      },
      {
        id: `${now}-5`,
        type: 'clip',
        content: 'npm install --save-dev typescript esbuild vitest',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: [],
        createdAt: now - 18000000,
        pinned: false,
        zenified: false,
      },
      {
        id: `${now}-6`,
        type: 'clip',
        content: 'contact@example.com',
        contentType: 'email',
        source: 'clipboard',
        origin: 'clipboard',
        tags: [],
        createdAt: now - 21600000,
        pinned: false,
        zenified: false,
      },
      {
        id: `${now}-7`,
        type: 'clip',
        content: 'Write code that is easy to delete, not easy to extend.',
        contentType: 'text',
        source: 'manual',
        origin: 'manual',
        tags: [],
        createdAt: now - 25200000,
        pinned: false,
        zenified: false,
      },
      {
        id: `${now}-8`,
        type: 'clip',
        content: 'const result = await fetch(url).then(r => r.json());',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: [],
        createdAt: now - 28800000,
        pinned: false,
        zenified: false,
      },
    ];

    // Open new unified IndexedDB
    const request = indexedDB.open('sonto_db_v2', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sonto_items')) {
        const store = db.createObjectStore('sonto_items', { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('sonto_items', 'readwrite');
      const store = tx.objectStore('sonto_items');
      for (const clip of clips) {
        store.put(clip);
      }
      tx.oncomplete = () => db.close();
    };
  });
  await delay(800);
}

describe('Screenshot Generation', () => {
  let browser: Browser;
  let extensionId: string;

  beforeAll(async () => {
    await ensureScreenshotDir();
    const result = await launchBrowser();
    browser = result.browser;
    extensionId = result.extensionId;
  }, 30000);

  afterAll(async () => {
    await closeBrowser();
  });

  it('captures sidebar dark theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');
    await delay(500);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_sidebar_dark');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures sidebar light theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');
    await delay(500);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_sidebar_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures clipboard with content dark theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    // Add sample clips
    await addSampleClips(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#clip-list');
    await delay(800);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_clipboard_dark');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures clipboard with content light theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    // Add sample clips
    await addSampleClips(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#clip-list');
    await delay(800);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_clipboard_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen cosmos mode', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'cosmos');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    // Click feed button to enter zen mode
    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(2000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_cosmos');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen cosmos mode variant 2', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'cosmos');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(3000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_cosmos_2');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen cosmos mode variant 3', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'cosmos');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(4500);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_cosmos_3');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen feed mode', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'feed');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    // Click feed button to enter zen mode
    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(2000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_feed');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen feed mode variant 2', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'feed');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(4000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_feed_2');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen feed mode variant 3', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'feed');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(6000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_feed_3');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen feed light mode', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await setZenDisplay(sidebar, 'feed');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(3000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_feed_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures zen cosmos light mode', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await setZenDisplay(sidebar, 'cosmos');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(2500);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_cosmos_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings page', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    const screenshotPath = await takeScreenshot(settings, 'e2e_settings_clipboard');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings feed tab', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    await settings.click('[data-tab="feed"]');
    await delay(300);

    const screenshotPath = await takeScreenshot(settings, 'e2e_settings_feed');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures prompt modal open', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#btn-add-prompt');

    await sidebar.evaluate(() => {
      const btn = document.querySelector('#btn-add-prompt') as HTMLElement;
      if (btn) btn.click();
    });
    await delay(300);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_prompt_modal');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures promo screenshot 1280x800', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 1280, 800, 2);
    await setTheme(sidebar, 'dark');
    await setZenDisplay(sidebar, 'feed');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await waitForElement(sidebar, '#btn-feed');
    await delay(100);
    await sidebar.evaluate(() => {
  const btn = document.querySelector('#btn-feed');
  if (btn) btn.click();
});
    await delay(3000);

    const screenshotPath = await takeScreenshot(sidebar, 'webstore_promo_1280x800');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});