// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from 'lucide';
import { MSG } from '../shared/messages';
import {
  getSettings,
  isOnboardingDone,
  setOnboardingDone,
} from '../shared/storage';
import type { ReadLaterItem } from '../shared/types';
import { ClipboardManager } from './clipboard-manager';
import {
  ThemeController,
  ViewController,
  PromptModalController,
  ReadLaterBarController,
} from './controllers';

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

class SontoSidebar {
  private language = 'en';

  private readonly feedBtn = qs<HTMLButtonElement>('#btn-feed');
  private readonly backBtn = qs<HTMLButtonElement>('#btn-back');
  private readonly themeBtn = qs<HTMLButtonElement>('#btn-theme');
  private readonly settingsBtn = qs<HTMLButtonElement>('#btn-settings');
  private readonly viewZen = qs<HTMLElement>('#view-zen');
  private readonly viewClipboard = qs<HTMLElement>('#view-clipboard');
  private readonly zenFeedEl = qs<HTMLElement>('#zen-feed');
  private readonly cosmosViewEl = qs<HTMLElement>('#cosmos-view');
  private readonly clipListEl = qs<HTMLElement>('#clip-list');
  private readonly searchInputEl = qs<HTMLInputElement>('#clipboard-search');

  private readonly clipManager = new ClipboardManager(this.clipListEl);
  private readonly themeController = new ThemeController(this.themeBtn);
  private viewController!: ViewController;
  private promptModalController!: PromptModalController;

  private currentDomain = '';

  async init(): Promise<void> {
    this.settingsBtn.addEventListener('click', () => {
      void chrome.runtime.openOptionsPage();
    });

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.CLIP_ADDED) {
        void this.clipManager.load(this.currentDomain);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const mode = this.viewController?.getMode();
        if (mode === 'clipboard') {
          void (async () => {
            await this.refreshDomain();
            await this.clipManager.load(this.currentDomain);
          })();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      const mode = this.viewController?.getMode();
      if (mode === 'clipboard') {
        if (e.key === '/' && document.activeElement !== this.searchInputEl) {
          e.preventDefault();
          this.searchInputEl.focus();
          return;
        }
        if (document.activeElement === this.searchInputEl) return;
        if (this.clipManager.handleKey(e)) {
          e.preventDefault();
          return;
        }
      }
    });

    let searchDebounce: ReturnType<typeof setTimeout> | null = null;
    const doSearch = () => void this.clipManager.search(this.searchInputEl.value);
    this.searchInputEl.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(doSearch, 400);
    });
    this.searchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchDebounce) clearTimeout(searchDebounce);
        doSearch();
      }
    });

    await this.initControllers();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sonto_drip_interval_ms) {
        const ms = changes.sonto_drip_interval_ms.newValue as number;
        this.viewController?.updateDripInterval(ms);
      }
      if (area === 'local' && changes.sonto_theme) {
        const newTheme = changes.sonto_theme.newValue as 'dark' | 'light';
        this.themeController.setTheme(newTheme);
        this.viewController?.setZenTheme(newTheme);
      }
    });

    try {
      const [settings, onboardingDone] = await Promise.all([
        getSettings(),
        isOnboardingDone(),
      ]);
      this.language = settings.language ?? 'en';

      if (!onboardingDone) {
        await setOnboardingDone();
      }

      createIcons({ icons, attrs: { strokeWidth: 1.5 } });
    } catch (err) {
      console.error('[Sonto] Failed to initialize settings:', err);
    }
  }

  private async initControllers(): Promise<void> {
    await this.themeController.init();

    const readLaterBar = new ReadLaterBarController({
      bar: qs('#read-later-bar'),
      countEl: qs('#read-later-count'),
      listEl: qs('#read-later-list'),
      viewBtn: qs('#btn-view-later'),
    });
    void readLaterBar.init();

    const settingsPromise = Promise.all([
      getSettings(),
      isOnboardingDone(),
    ]);

    const [settings, _onboardingDone] = await settingsPromise;
    this.language = settings.language ?? 'en';
    const theme = this.themeController.getTheme();

    await this.refreshDomain();

    this.promptModalController = new PromptModalController({
      modal: qs('#prompt-modal'),
      input: qs('#prompt-input'),
      cancelBtn: qs('#prompt-cancel'),
      saveBtn: qs('#prompt-save'),
      addBtn: qs('#btn-add-prompt'),
      onSaved: async () => {
        await this.refreshDomain();
        await this.clipManager.load(this.currentDomain);
      },
    });
    this.promptModalController.init();

    this.viewController = new ViewController({
      viewZen: this.viewZen,
      viewClipboard: this.viewClipboard,
      feedBtn: this.feedBtn,
      backBtn: this.backBtn,
      zenFeedEl: this.zenFeedEl,
      cosmosViewEl: this.cosmosViewEl,
      clipManager: this.clipManager,
      language: this.language,
    }, this.language);

    await this.viewController.init('clipboard', theme);

    await this.clipManager.load(this.currentDomain);
  }

  private async refreshDomain(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentDomain = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
    } catch {
      this.currentDomain = '';
    }
  }
}

void new SontoSidebar().init();
