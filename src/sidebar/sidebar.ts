// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from 'lucide';
import { MSG } from '../shared/messages';
import {
  getSettings,
  getZenDisplay,
  saveZenDisplay,
  isOnboardingDone,
  setOnboardingDone,
  getTheme,
  saveTheme,
  getReadLater,
  getShowFeedToggle,
  getDefaultView,
} from '../shared/storage';
import type { ReadLaterItem } from '../shared/types';
import { ClipboardManager } from './clipboard-manager';
import { CosmosMode } from './cosmos-mode';
import { ZenFeed } from './zen/zen-feed';
import { escapeHtml } from '../shared/utils';

type ViewMode = 'zen' | 'clipboard';

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

class SontoSidebar {
  private mode: ViewMode = 'clipboard';
  private language = 'en';
  private zenDisplay: 'feed' | 'cosmos' = 'cosmos';
  private theme: 'dark' | 'light' = 'dark';

  private readonly clipboardBtn = qs<HTMLButtonElement>('#btn-clipboard');
  private readonly themeBtn = qs<HTMLButtonElement>('#btn-theme');
  private readonly viewZen = qs<HTMLElement>('#view-zen');
  private readonly viewClipboard = qs<HTMLElement>('#view-clipboard');
  private readonly zenFeedEl = qs<HTMLElement>('#zen-feed');
  private readonly cosmosViewEl = qs<HTMLElement>('#cosmos-view');
  private readonly clipListEl = qs<HTMLElement>('#clip-list');
  private readonly searchInputEl = qs<HTMLInputElement>('#clipboard-search');
  private readonly promptModal = qs<HTMLElement>('#prompt-modal');
  private readonly promptInput = qs<HTMLTextAreaElement>('#prompt-input');
  private readonly promptCancelBtn = qs<HTMLButtonElement>('#prompt-cancel');
  private readonly promptSaveBtn = qs<HTMLButtonElement>('#prompt-save');
  private readonly addPromptBtn = qs<HTMLButtonElement>('#btn-add-prompt');

  private readonly clipManager = new ClipboardManager(this.clipListEl);

  private zenFeed: ZenFeed | null = null;
  private cosmosMode: CosmosMode | null = null;

  private currentDomain = '';

  async init(): Promise<void> {
    qs<HTMLButtonElement>('#btn-settings').addEventListener('click', () => {
      void chrome.runtime.openOptionsPage();
    });

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.CLIP_ADDED) {
        void this.clipManager.load(this.currentDomain);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.mode === 'clipboard') {
        void this.refreshDomainAndLoad();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.mode === 'clipboard') {
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

    const toggleClipboard = () => this.setMode(this.mode === 'clipboard' ? 'zen' : 'clipboard');
    this.clipboardBtn.addEventListener('click', toggleClipboard);
    this.themeBtn.addEventListener('click', () => void this.toggleTheme());

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

    this.addPromptBtn.addEventListener('click', () => this.showPromptModal());
    this.promptCancelBtn.addEventListener('click', () => this.hidePromptModal());
    this.promptSaveBtn.addEventListener('click', () => void this.savePrompt());
    this.promptModal.addEventListener('click', (e) => {
      if (e.target === this.promptModal) this.hidePromptModal();
    });

    const zdtEl = document.getElementById('zen-display-toggle')!;
    zdtEl.querySelectorAll<HTMLButtonElement>('.zdt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const display = btn.dataset.display as 'feed' | 'cosmos';
        if (!display) return;
        if (this.mode !== 'zen') this.setMode('zen');
        if (display !== this.zenDisplay) void saveZenDisplay(display);
      });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sonto_zen_display) {
        const newDisplay = changes.sonto_zen_display.newValue as 'feed' | 'cosmos';
        void this.switchZenDisplay(newDisplay);
      }
      if (area === 'local' && changes.sonto_drip_interval_ms) {
        const ms = changes.sonto_drip_interval_ms.newValue as number;
        this.zenFeed?.setDripInterval(ms);
        this.cosmosMode?.setIntervalMs(ms);
      }
      if (area === 'local' && changes.sonto_theme) {
        const newTheme = changes.sonto_theme.newValue as 'dark' | 'light';
        this.theme = newTheme;
        this.applyTheme(newTheme);
        if (this.cosmosMode && this.zenDisplay === 'cosmos') {
          this.cosmosMode.setTheme(newTheme);
        }
      }
      if (area === 'local' && changes.sonto_show_feed_toggle) {
        const show = changes.sonto_show_feed_toggle.newValue as boolean;
        const zdtEl = document.getElementById('zen-display-toggle');
        if (zdtEl) zdtEl.classList.toggle('hidden', !show);
      }
    });

    this.initReadLaterBar();

    try {
      const [settings, onboardingDone, theme, zenDisplay, showFeedToggle, defaultView] = await Promise.all([
        getSettings(),
        isOnboardingDone(),
        getTheme(),
        getZenDisplay(),
        getShowFeedToggle(),
        getDefaultView(),
      ]);
      this.language = settings.language ?? 'en';
      this.theme = theme;
      this.zenDisplay = zenDisplay;
      this.mode = defaultView;
      this.applyTheme(theme);
      this.syncDisplayToggle(zenDisplay);
      this.syncModeButtons();
      
      const zdtEl = document.getElementById('zen-display-toggle');
      if (zdtEl) {
        zdtEl.classList.toggle('hidden', !showFeedToggle);
      }
      
      if (!onboardingDone) {
        await setOnboardingDone();
      }
    } catch (err) {
      console.error('[Sonto] Failed to initialize settings:', err);
    }

    if (this.zenDisplay === 'cosmos') {
      this.zenFeedEl.classList.add('hidden');
      this.cosmosViewEl.classList.remove('hidden');
      this.ensureCosmosMode();
    } else {
      this.zenFeed = new ZenFeed(this.zenFeedEl, { language: this.language });
      await this.zenFeed.restorePastFacts();
    }

    if (this.mode === 'clipboard') {
      this.viewZen.classList.add('hidden');
      this.viewClipboard.classList.remove('hidden');
    }

    await this.refreshDomainAndLoad();

    if (this.mode === 'zen') {
      if (this.zenDisplay === 'cosmos') {
        void this.cosmosMode!.start();
      } else {
        void this.zenFeed!.start();
      }
    }

    createIcons({ icons, attrs: { strokeWidth: 1.5 } });
  }

  private async switchZenDisplay(display: 'feed' | 'cosmos'): Promise<void> {
    if (display === this.zenDisplay) return;

    this.zenFeed?.stop();
    this.cosmosMode?.stop();
    this.zenDisplay = display;
    this.syncDisplayToggle(display);

    if (display === 'cosmos') {
      this.zenFeedEl.classList.add('hidden');
      this.cosmosViewEl.classList.remove('hidden');
      this.zenFeed = null;
      this.cosmosMode = new CosmosMode(this.cosmosViewEl, this.language);
      if (this.mode === 'zen') void this.cosmosMode.start();
    } else {
      this.cosmosViewEl.classList.add('hidden');
      this.zenFeedEl.classList.remove('hidden');
      this.cosmosMode = null;
      this.ensureCosmosMode();
      this.zenFeed = new ZenFeed(this.zenFeedEl, { language: this.language });
      await this.zenFeed.restorePastFacts();
      if (this.mode === 'zen') void this.zenFeed.start();
    }
  }

  private syncDisplayToggle(display: 'feed' | 'cosmos'): void {
    document.querySelectorAll<HTMLButtonElement>('.zdt-btn').forEach((btn) => {
      const active = btn.dataset.display === display;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  private syncModeButtons(): void {
    this.clipboardBtn.classList.toggle('active', this.mode === 'clipboard');
    this.viewZen.classList.toggle('hidden', this.mode !== 'zen');
    this.viewClipboard.classList.toggle('hidden', this.mode !== 'clipboard');
  }

  private ensureCosmosMode(): void {
    if (!this.cosmosMode) {
      this.cosmosMode = new CosmosMode(this.cosmosViewEl, this.language);
    }
  }

  private async initReadLaterBar(): Promise<void> {
    const bar = document.getElementById('read-later-bar')!;
    const countEl = document.getElementById('read-later-count')!;
    const listEl = document.getElementById('read-later-list')!;
    const viewBtn = document.getElementById('btn-view-later')!;

    const refresh = async () => {
      const items = await getReadLater();
      if (items.length > 0) {
        countEl.textContent = `${items.length} item${items.length > 1 ? 's' : ''} in read later`;
        bar.classList.remove('hidden');
      } else {
        bar.classList.add('hidden');
        listEl.classList.add('hidden');
      }
    };

    viewBtn.addEventListener('click', async () => {
      const items = await getReadLater();
      if (listEl.classList.contains('hidden')) {
        this.renderReadLaterList(items, listEl);
        listEl.classList.remove('hidden');
        viewBtn.textContent = 'Hide';
      } else {
        listEl.classList.add('hidden');
        viewBtn.textContent = 'View queue';
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sonto_read_later) {
        void refresh();
      }
    });

    await refresh();
  }

  private renderReadLaterList(items: ReadLaterItem[], container: HTMLElement): void {
    container.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'read-later-item';
      const domain = (() => {
        try { return new URL(item.url).hostname; } catch { return item.url.slice(0, 40); }
      })();
      row.innerHTML = `
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="rl-link">${escapeHtml(item.title || domain)}</a>
        <button class="rl-remove" data-url="${escapeHtml(item.url)}" type="button" aria-label="Remove from read later">✕</button>
      `;
      row.querySelector('.rl-remove')!.addEventListener('click', async (e) => {
        const url = (e.currentTarget as HTMLButtonElement).dataset.url!;
        await chrome.runtime.sendMessage({ type: MSG.REMOVE_READ_LATER, url });
        const updated = await getReadLater();
        this.renderReadLaterList(updated, container);
        if (updated.length === 0) {
          container.classList.add('hidden');
          document.getElementById('read-later-bar')?.classList.add('hidden');
        }
      });
      container.appendChild(row);
    }
  }

  private async toggleTheme(): Promise<void> {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.theme);
    await saveTheme(this.theme);
  }

  private applyTheme(theme: 'dark' | 'light'): void {
    document.documentElement.dataset.theme = theme;
    const moonIcon = document.getElementById('icon-moon')!;
    const sunIcon = document.getElementById('icon-sun')!;
    if (theme === 'light') {
      moonIcon.classList.add('hidden');
      sunIcon.classList.remove('hidden');
    } else {
      moonIcon.classList.remove('hidden');
      sunIcon.classList.add('hidden');
    }
  }

  private setMode(mode: ViewMode): void {
    this.mode = mode;
    this.syncModeButtons();

    if (mode === 'zen') {
      if (this.zenDisplay === 'cosmos') {
        void this.cosmosMode?.start();
      } else {
        void this.zenFeed?.start();
      }
    } else {
      this.zenFeed?.stop();
      this.cosmosMode?.stop();
      void this.refreshDomainAndLoad();
    }
  }

  private async refreshDomainAndLoad(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentDomain = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
    } catch {
      this.currentDomain = '';
    }
    await this.clipManager.load(this.currentDomain);
  }

  private showPromptModal(): void {
    this.promptModal.classList.remove('hidden');
    this.promptInput.value = '';
    this.promptInput.focus();
  }

  private hidePromptModal(): void {
    this.promptModal.classList.add('hidden');
    this.promptInput.value = '';
  }

  private async savePrompt(): Promise<void> {
    const text = this.promptInput.value.trim();
    if (!text) {
      this.hidePromptModal();
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.CAPTURE_CLIP,
        text,
        source: 'manual',
        contentType: 'prompt',
      });

      if (response?.ok) {
        await this.clipManager.load(this.currentDomain);
        this.hidePromptModal();
      }
    } catch (err) {
      console.error('[Sonto] Failed to save prompt:', err);
    }
  }
}

void new SontoSidebar().init();
