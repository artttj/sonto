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
        tags: ['quotes', 'inspiration'],
        createdAt: now - 3600000,
        zenified: false,
      },
      {
        id: `${now}-2`,
        type: 'clip',
        content: 'function debounce(fn: Function, ms: number) {\n  let timeout: ReturnType<typeof setTimeout>;\n  return (...args: unknown[]) => {\n    clearTimeout(timeout);\n    timeout = setTimeout(() => fn(...args), ms);\n  };\n}',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: ['typescript', 'utils'],
        createdAt: now - 7200000,
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
        tags: ['project'],
        createdAt: now - 10800000,
        zenified: false,
      },
      {
        id: `${now}-4`,
        type: 'clip',
        content: 'Simplicity is the ultimate sophistication. — Leonardo da Vinci',
        contentType: 'text',
        source: 'manual',
        origin: 'manual',
        tags: ['quotes'],
        createdAt: now - 14400000,
        zenified: false,
      },
      {
        id: `${now}-5`,
        type: 'clip',
        content: 'npm install --save-dev typescript esbuild vitest',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: ['npm', 'dev'],
        createdAt: now - 18000000,
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
        zenified: false,
      },
      {
        id: `${now}-7`,
        type: 'clip',
        content: 'Write code that is easy to delete, not easy to extend.',
        contentType: 'text',
        source: 'manual',
        origin: 'manual',
        tags: ['quotes', 'engineering'],
        createdAt: now - 25200000,
        zenified: false,
      },
      {
        id: `${now}-8`,
        type: 'clip',
        content: 'const result = await fetch(url).then(r => r.json());',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: ['javascript', 'api'],
        createdAt: now - 28800000,
        zenified: false,
      },
      {
        id: `${now}-9`,
        type: 'clip',
        content: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand. — Martin Fowler',
        contentType: 'text',
        source: 'manual',
        origin: 'manual',
        tags: ['quotes', 'clean code'],
        createdAt: now - 32400000,
        zenified: false,
      },
      {
        id: `${now}-10`,
        type: 'clip',
        content: 'git checkout -b feature/my-new-feature && git push -u origin feature/my-new-feature',
        contentType: 'code',
        source: 'clipboard',
        origin: 'clipboard',
        tags: ['git', 'workflow'],
        createdAt: now - 36000000,
        zenified: false,
      },
    ];

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('sonto_db_v2', 3);
      request.onerror = () => reject(request.error);
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
        for (const clip of clips) {
          store.put(clip);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await delay(500);
}

async function addSamplePrompts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const now = Date.now();
    const prompts = [
      {
        id: `${now}-p1`,
        type: 'prompt',
        content: 'Explain this code like I\'m five years old. What does it do and why?',
        label: 'Code Explainer',
        color: 'blue',
        createdAt: now - 3600000,
      },
      {
        id: `${now}-p2`,
        type: 'prompt',
        content: 'Review this code for bugs, security issues, and improvements. Suggest refactoring opportunities.',
        label: 'Code Review',
        color: 'purple',
        createdAt: now - 7200000,
      },
      {
        id: `${now}-p3`,
        type: 'prompt',
        content: 'Convert this code to TypeScript. Add proper types and interfaces.',
        label: 'To TypeScript',
        color: 'yellow',
        createdAt: now - 10800000,
      },
      {
        id: `${now}-p4`,
        type: 'prompt',
        content: 'Write unit tests for this function using vitest. Cover edge cases.',
        label: 'Unit Tests',
        color: 'green',
        createdAt: now - 14400000,
      },
    ];

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('sonto_db_v2', 3);
      request.onerror = () => reject(request.error);
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
        for (const prompt of prompts) {
          store.put(prompt);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await delay(500);
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

    const screenshotPath = await takeScreenshot(sidebar, 'sidebar_dark');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures sidebar light theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');
    await delay(500);

    const screenshotPath = await takeScreenshot(sidebar, 'sidebar_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures clipboard with content dark theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await addSampleClips(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#clip-list');
    await delay(800);

    const screenshotPath = await takeScreenshot(sidebar, 'clipboard_dark');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures clipboard with content light theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await addSampleClips(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#clip-list');
    await delay(800);

    const screenshotPath = await takeScreenshot(sidebar, 'clipboard_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures prompts view with content dark theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await addSamplePrompts(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#nav-prompts');

    await sidebar.evaluate(() => {
      const promptsTab = document.querySelector('#nav-prompts') as HTMLElement;
      if (promptsTab) promptsTab.click();
    });
    await delay(500);
    await waitForElement(sidebar, '#prompts-list');
    await delay(500);

    const screenshotPath = await takeScreenshot(sidebar, 'prompts_dark');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures prompts view with content light theme', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'light');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await addSamplePrompts(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#nav-prompts');

    await sidebar.evaluate(() => {
      const promptsTab = document.querySelector('#nav-prompts') as HTMLElement;
      if (promptsTab) promptsTab.click();
    });
    await delay(500);
    await waitForElement(sidebar, '#prompts-list');
    await delay(500);

    const screenshotPath = await takeScreenshot(sidebar, 'prompts_light');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures prompt modal open', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#nav-prompts');

    await sidebar.evaluate(() => {
      const promptsTab = document.querySelector('#nav-prompts') as HTMLElement;
      if (promptsTab) promptsTab.click();
    });
    await delay(500);

    await waitForElement(sidebar, '#prompts-content:not(.hidden)');
    await waitForElement(sidebar, '#btn-add-prompt');
    await delay(300);

    await sidebar.evaluate(() => {
      const btn = document.querySelector('#btn-add-prompt') as HTMLElement;
      if (btn) btn.click();
    });

    await sidebar.waitForSelector('#prompt-modal:not(.hidden)', { timeout: 5000 });
    await delay(500);

    const screenshotPath = await takeScreenshot(sidebar, 'prompt_modal');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings clipboard tab', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    const screenshotPath = await takeScreenshot(settings, 'settings_clipboard');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings language tab', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    await settings.click('[data-tab="language"]');
    await delay(300);

    const screenshotPath = await takeScreenshot(settings, 'settings_language');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings security tab', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    await settings.click('[data-tab="security"]');
    await delay(300);

    const screenshotPath = await takeScreenshot(settings, 'settings_security');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings data tab', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    await settings.click('[data-tab="data"]');
    await delay(300);

    const screenshotPath = await takeScreenshot(settings, 'settings_data');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures settings about tab', async () => {
    const settings = await getSettingsPage(browser, extensionId);
    await setViewport(settings, 900, 1000);
    await waitForElement(settings, '.settings-layout');

    await settings.click('[data-tab="about"]');
    await delay(300);

    const screenshotPath = await takeScreenshot(settings, 'settings_about');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures promo screenshot 1280x800', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 1280, 800, 2);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '.header');

    await addSampleClips(sidebar);
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#clip-list');
    await delay(800);

    const screenshotPath = await takeScreenshot(sidebar, 'promo_1280x800');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('captures add clip modal', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await setViewport(sidebar, 420, 800);
    await setTheme(sidebar, 'dark');
    await sidebar.reload({ waitUntil: 'domcontentloaded' });
    await waitForElement(sidebar, '#btn-add-clip');

    await sidebar.evaluate(() => {
      const btn = document.querySelector('#btn-add-clip') as HTMLElement;
      if (btn) btn.click();
    });

    await sidebar.waitForSelector('#add-clip-modal:not(.hidden)', { timeout: 5000 });
    await delay(300);

    const screenshotPath = await takeScreenshot(sidebar, 'add_clip_modal');
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
