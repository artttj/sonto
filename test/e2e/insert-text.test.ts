// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, closeBrowser, getSidebarPage, waitForElement } from './setup';
import type { Browser } from 'puppeteer';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Insert Text to Input', () => {
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

  it('creates prompt and shows insert button', async () => {
    const sidebar = await getSidebarPage(browser, extensionId);
    await delay(500);

    await waitForElement(sidebar, '#nav-prompts');
    await sidebar.click('#nav-prompts');
    await delay(300);

    await waitForElement(sidebar, '#btn-add-prompt');

    await sidebar.evaluate(() => {
      document.querySelector('#btn-add-prompt')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await delay(300);

    await waitForElement(sidebar, '#prompt-input');
    await sidebar.type('#prompt-input', 'Test Query From Extension');
    await delay(100);

    await sidebar.evaluate(() => {
      document.querySelector('#prompt-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await delay(800);

    const promptCards = await sidebar.$$('.clip-card.clip-type-prompt');
    expect(promptCards.length).toBeGreaterThanOrEqual(1);

    const insertBtn = await sidebar.$('.clip-btn-insert');
    expect(insertBtn).not.toBeNull();
  });
});