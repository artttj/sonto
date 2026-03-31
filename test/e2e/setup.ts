// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import puppeteer, { Browser, Page } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

let browser: Browser | null = null;

const DIST_PATH = path.resolve(process.cwd(), 'dist');

async function findExtensionPath(): Promise<string> {
  if (!fs.existsSync(DIST_PATH)) {
    throw new Error(`dist/ folder not found. Run 'npm run build' first.`);
  }
  return DIST_PATH;
}

export async function launchBrowser(): Promise<{ browser: Browser; extensionId: string }> {
  const extensionPath = await findExtensionPath();

  browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  // Wait a moment for extension to load
  await new Promise(resolve => setTimeout(resolve, 500));

  // Get extension ID by finding the service worker or extension page
  const extensionId = await getExtensionId(browser);

  if (!extensionId) {
    throw new Error('Could not find extension ID. Make sure the extension is loaded correctly.');
  }

  console.log(`Extension ID: ${extensionId}`);
  return { browser, extensionId };
}

async function getExtensionId(browser: Browser): Promise<string> {
  // Method 1: Check targets
  const targets = await browser.targets();
  for (const target of targets) {
    const url = target.url();
    if (url.startsWith('chrome-extension://')) {
      const match = url.match(/chrome-extension:\/\/([a-p]{32})\//);
      if (match) return match[1];
    }
  }

  // Method 2: Check workers
  const contexts = browser.browserContexts();
  for (const ctx of contexts) {
    const targets2 = ctx.targets();
    for (const target of targets2) {
      const url = target.url();
      if (url.startsWith('chrome-extension://')) {
        const match = url.match(/chrome-extension:\/\/([a-p]{32})\//);
        if (match) return match[1];
      }
    }
  }

  // Method 3: Check service worker (if available)
  try {
    const serviceWorkers = browser.serviceWorkers?.();
    if (serviceWorkers) {
      for (const sw of serviceWorkers) {
        const url = sw.url();
        if (url.includes('service-worker')) {
          const match = url.match(/chrome-extension:\/\/([a-p]{32})\//);
          if (match) return match[1];
        }
      }
    }
  } catch {
    // Method not available in this browser version
  }

  return '';
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function getSidebarPage(browser: Browser, extensionId: string): Promise<Page> {
  const sidebarUrl = `chrome-extension://${extensionId}/sidebar/sidebar.html`;
  const sidebarPage = await browser.newPage();
  await sidebarPage.goto(sidebarUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return sidebarPage;
}

export async function getSettingsPage(browser: Browser, extensionId: string): Promise<Page> {
  const settingsUrl = `chrome-extension://${extensionId}/settings/settings.html`;
  const settingsPage = await browser.newPage();
  await settingsPage.goto(settingsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return settingsPage;
}

export async function takeScreenshot(page: Page, name: string): Promise<string> {
  const screenshotDir = path.resolve(process.cwd(), 'docs/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

export async function waitForElement(page: Page, selector: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

export async function waitForClickable(page: Page, selector: string, timeout = 5000): Promise<void> {
  await page.waitForFunction((sel: string) => {
    const el = document.querySelector(sel);
    return el && el instanceof HTMLElement && el.offsetParent !== null;
  }, { timeout }, selector);
}

export { Browser, Page };