// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { launchBrowser, closeBrowser, getSidebarPage, waitForElement } from './setup';
import type { Browser, Page } from 'puppeteer';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Sonto Sidebar E2E', () => {
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

  describe('Sidebar initialization', () => {
    let sidebar: Page;

    beforeEach(async () => {
      sidebar = await getSidebarPage(browser, extensionId);
    });

    it('loads the sidebar view', async () => {
      await waitForElement(sidebar, '#view-zen');
      await waitForElement(sidebar, '#view-clipboard');

      const title = await sidebar.title();
      expect(title).toBe('Sonto');
    });

    it('shows zen feed element', async () => {
      await waitForElement(sidebar, '#zen-feed');

      const zenFeed = await sidebar.$('#zen-feed');
      expect(zenFeed).not.toBeNull();
    });

    it('has clipboard view element', async () => {
      await waitForElement(sidebar, '#view-clipboard');

      const clipboardView = await sidebar.$('#view-clipboard');
      expect(clipboardView).not.toBeNull();
    });

    it('displays header with brand and controls', async () => {
      await waitForElement(sidebar, '.header');

      const brand = await sidebar.$('.brand');
      expect(brand).not.toBeNull();

      const themeBtn = await sidebar.$('#btn-theme');
      expect(themeBtn).not.toBeNull();

      const settingsBtn = await sidebar.$('#btn-settings');
      expect(settingsBtn).not.toBeNull();

      const feedBtn = await sidebar.$('#btn-feed');
      expect(feedBtn).not.toBeNull();
    });
  });

  describe('Theme toggle', () => {
    let sidebar: Page;

    beforeEach(async () => {
      sidebar = await getSidebarPage(browser, extensionId);
    });

    it('has theme toggle button', async () => {
      await waitForElement(sidebar, '#btn-theme');

      const themeBtn = await sidebar.$('#btn-theme');
      expect(themeBtn).not.toBeNull();
    });

    it('toggles theme when clicked', async () => {
      await waitForElement(sidebar, '#btn-theme');

      // Check theme is applied to document
      const initialTheme = await sidebar.evaluate(() => {
        return document.documentElement.dataset.theme;
      });
      expect(initialTheme).toBe('dark');

      await sidebar.click('#btn-theme');
      await delay(500);

      const newTheme = await sidebar.evaluate(() => {
        return document.documentElement.dataset.theme;
      });
      expect(newTheme).toBe('light');
    });
  });

  describe('Clipboard view', () => {
    let sidebar: Page;

    beforeEach(async () => {
      sidebar = await getSidebarPage(browser, extensionId);
    });

    it('has search input in clipboard view', async () => {
      await waitForElement(sidebar, '#clipboard-search');

      const searchInput = await sidebar.$('#clipboard-search');
      expect(searchInput).not.toBeNull();

      const placeholder = await sidebar.$eval('#clipboard-search', el => (el as HTMLInputElement).placeholder);
      expect(placeholder).toContain('Search');
    });

    it('has add prompt button', async () => {
      await waitForElement(sidebar, '#btn-add-prompt');

      const addBtn = await sidebar.$('#btn-add-prompt');
      expect(addBtn).not.toBeNull();
    });

    it('shows empty state when no clips', async () => {
      await waitForElement(sidebar, '#clip-list');

      const clips = await sidebar.$$('#clip-list .clip-item');
      expect(clips.length).toBe(0);
    });
  });

  describe('Prompt modal', () => {
    let sidebar: Page;

    beforeEach(async () => {
      sidebar = await getSidebarPage(browser, extensionId);
      await waitForElement(sidebar, '#nav-prompts');
      await sidebar.click('#nav-prompts');
      await delay(200);
    });

    it('opens prompt modal when clicking add button', async () => {
      await waitForElement(sidebar, '#btn-add-prompt');
      await waitForElement(sidebar, '#prompt-modal');

      const modalHidden = await sidebar.$eval('#prompt-modal', el => el.classList.contains('hidden'));
      expect(modalHidden).toBe(true);

      await sidebar.evaluate(() => {
        document.querySelector('#btn-add-prompt')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await delay(200);

      const modalVisible = await sidebar.$eval('#prompt-modal', el => el.classList.contains('hidden'));
      expect(modalVisible).toBe(false);
    });

    it('closes prompt modal when clicking cancel', async () => {
      await waitForElement(sidebar, '#btn-add-prompt');

      await sidebar.evaluate(() => {
        document.querySelector('#btn-add-prompt')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await delay(200);

      await sidebar.evaluate(() => {
        document.querySelector('#prompt-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await delay(200);

      const modalHidden = await sidebar.$eval('#prompt-modal', el => el.classList.contains('hidden'));
      expect(modalHidden).toBe(true);
    });

    it('has textarea and buttons in modal', async () => {
      await waitForElement(sidebar, '#prompt-modal');

      const textarea = await sidebar.$('#prompt-input');
      expect(textarea).not.toBeNull();

      const cancelBtn = await sidebar.$('#prompt-cancel');
      expect(cancelBtn).not.toBeNull();

      const saveBtn = await sidebar.$('#prompt-save');
      expect(saveBtn).not.toBeNull();
    });
  });

  describe('Feed toggle', () => {
    let sidebar: Page;

    beforeEach(async () => {
      sidebar = await getSidebarPage(browser, extensionId);
    });

    it('has feed button that toggles view', async () => {
      await waitForElement(sidebar, '#btn-feed');

      const feedBtn = await sidebar.$('#btn-feed');
      expect(feedBtn).not.toBeNull();
    });
  });
});