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

async function setViewport(page: Page, width: number, height: number): Promise<void> {
  await page.setViewport({ width, height });
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
    const clips = [
      {
        id: 'clip-1',
        text: 'The best way to predict the future is to create it. — Peter Drucker',
        contentType: 'text',
        source: 'manual',
        timestamp: Date.now() - 3600000,
        pinned: true,
      },
      {
        id: 'clip-2',
        text: 'function debounce(fn: Function, ms: number) {\n  let timeout: ReturnType<typeof setTimeout>;\n  return (...args: unknown[]) => {\n    clearTimeout(timeout);\n    timeout = setTimeout(() => fn(...args), ms);\n  };\n}',
        contentType: 'code',
        source: 'clipboard',
        timestamp: Date.now() - 7200000,
      },
      {
        id: 'clip-3',
        text: 'https://github.com/artttj/sonto',
        contentType: 'link',
        source: 'clipboard',
        url: 'https://github.com/artttj/sonto',
        title: 'artttj/sonto - GitHub',
        timestamp: Date.now() - 10800000,
      },
      {
        id: 'clip-4',
        text: 'Simplicity is the ultimate sophistication. — Leonardo da Vinci',
        contentType: 'text',
        source: 'manual',
        timestamp: Date.now() - 14400000,
      },
      {
        id: 'clip-5',
        text: 'npm install --save-dev typescript esbuild vitest',
        contentType: 'code',
        source: 'clipboard',
        timestamp: Date.now() - 18000000,
      },
      {
        id: 'clip-6',
        text: 'contact@example.com',
        contentType: 'email',
        source: 'clipboard',
        timestamp: Date.now() - 21600000,
      },
      {
        id: 'clip-7',
        text: 'Write code that is easy to delete, not easy to extend.',
        contentType: 'text',
        source: 'manual',
        timestamp: Date.now() - 25200000,
      },
      {
        id: 'clip-8',
        text: 'const result = await fetch(url).then(r => r.json());',
        contentType: 'code',
        source: 'clipboard',
        timestamp: Date.now() - 28800000,
      },
    ];

    // Open IndexedDB with correct database name
    const request = indexedDB.open('sonto_db', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('clips')) {
        db.createObjectStore('clips', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('clips', 'readwrite');
      const store = tx.objectStore('clips');
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
    await sidebar.click('#btn-feed');
    await delay(1500);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_cosmos');
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
    await sidebar.click('#btn-feed');
    await delay(2000);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_zen_feed');
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

    await sidebar.click('#btn-add-prompt');
    await delay(300);

    const screenshotPath = await takeScreenshot(sidebar, 'e2e_prompt_modal');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});