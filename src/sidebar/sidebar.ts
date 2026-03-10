// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import {
  getSettings,
  getZenDisplay,
  saveZenDisplay,
  isOnboardingDone,
  setOnboardingDone,
  setHistoryEnabled,
  getTheme,
  saveTheme,
  getReadLater,
  getStoredDigest,
  saveStoredDigest,
} from '../shared/storage';
import type { ReadLaterItem, Snippet } from '../shared/types';
import { BrowseManager } from './browse-manager';
import { ChatManager } from './chat-manager';
import { CosmosMode } from './cosmos-mode';
import { ZenFeed } from './zen/zen-feed';
import { escapeHtml } from './zen/zen-content';

type FilterMode = 'all' | 'manual' | 'history' | 'pinned';
type ViewMode = 'zen' | 'browse' | 'chat';

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

class SontoSidebar {
  private mode: ViewMode = 'zen';
  private snippets: Snippet[] = [];
  private language = 'en';
  private zenDisplay: 'feed' | 'cosmos' = 'feed';
  private theme: 'dark' | 'light' = 'dark';

  private readonly browseBtn = qs<HTMLButtonElement>('#btn-browse');
  private readonly chatBtn = qs<HTMLButtonElement>('#btn-chat');
  private readonly themeBtn = qs<HTMLButtonElement>('#btn-theme');
  private readonly viewZen = qs<HTMLElement>('#view-zen');
  private readonly viewBrowse = qs<HTMLElement>('#view-browse');
  private readonly viewChat = qs<HTMLElement>('#view-chat');
  private readonly zenFeedEl = qs<HTMLElement>('#zen-feed');
  private readonly cosmosViewEl = qs<HTMLElement>('#cosmos-view');
  private readonly snippetListEl = qs<HTMLElement>('#snippet-list');
  private readonly chatMessagesEl = qs<HTMLElement>('#chat-messages');
  private readonly chatInputEl = qs<HTMLTextAreaElement>('#chat-input');
  private readonly sendBtnEl = qs<HTMLButtonElement>('#btn-send');
  private readonly historyBtnEl = qs<HTMLButtonElement>('#btn-chat-history');

  private readonly browseManager = new BrowseManager(
    this.snippetListEl,
    (all, manual, history, pinned) => this.updateCounts(all, manual, history, pinned),
  );

  private zenFeed: ZenFeed | null = null;
  private cosmosMode: CosmosMode | null = null;

  private readonly chatManager = new ChatManager(
    this.chatMessagesEl,
    this.chatInputEl,
    this.sendBtnEl,
    () => this.snippets,
    this.historyBtnEl,
  );

  async init(): Promise<void> {
    qs<HTMLButtonElement>('#btn-settings').addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: MSG.OPEN_SETTINGS });
    });

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.SNIPPET_ADDED) {
        void this.browseManager.load().then(() => {
          this.snippets = this.browseManager.getSnippets();
          if (this.mode === 'zen' && this.zenFeed) {
            this.zenFeed.invalidateCategories();
            void this.zenFeed.start();
          }
        });
      }
    });

    const toggleMode = (mode: ViewMode) => this.setMode(this.mode === mode ? 'zen' : mode);
    this.browseBtn.addEventListener('click', () => toggleMode('browse'));
    this.chatBtn.addEventListener('click', () => toggleMode('chat'));

    this.themeBtn.addEventListener('click', () => void this.toggleTheme());

    const zdtEl = document.getElementById('zen-display-toggle')!;
    zdtEl.querySelectorAll<HTMLButtonElement>('.zdt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const display = btn.dataset.display as 'feed' | 'cosmos';
        if (!display) return;
        if (this.mode !== 'zen') this.setMode('zen');
        if (display !== this.zenDisplay) void saveZenDisplay(display);
      });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sonto_zen_display) {
        const newMode = changes.sonto_zen_display.newValue as string;
        if (newMode === 'feed' || newMode === 'cosmos') {
          void this.switchZenDisplay(newMode);
        }
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
          this.cosmosMode.stop();
          this.cosmosMode = new CosmosMode(this.cosmosViewEl, this.language);
          this.cosmosMode.refresh(this.browseManager?.getSnippets() ?? [], this.language);
          void this.cosmosMode.start();
        }
      }
    });

    qs<HTMLButtonElement>('#btn-clear-all').addEventListener('click', () => void this.browseManager.clearAll());

    document.querySelectorAll<HTMLButtonElement>('.filter-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = (btn.dataset.filter ?? 'all') as FilterMode;
        document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.browseManager.setFilter(filter);
      });
    });

    this.initExportDropdown();
    this.initReadLaterBar();

    this.sendBtnEl.addEventListener('click', () => void this.chatManager.sendMessage());
    this.chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.chatManager.sendMessage();
      }
    });

    try {
      const [settings, zenDisplay, onboardingDone, theme] = await Promise.all([
        getSettings(),
        getZenDisplay(),
        isOnboardingDone(),
        getTheme(),
      ]);
      this.language = settings.language ?? 'en';
      this.zenDisplay = zenDisplay;
      this.syncDisplayToggle(zenDisplay);
      this.theme = theme;
      this.applyTheme(theme);
      if (!onboardingDone) this.showHistoryPrompt();
    } catch {}

    if (this.zenDisplay === 'cosmos') {
      this.zenFeedEl.classList.add('hidden');
      this.cosmosViewEl.classList.remove('hidden');
      this.cosmosMode = new CosmosMode(this.cosmosViewEl, this.language);
    } else {
      this.zenFeed = new ZenFeed(this.zenFeedEl, {
        language: this.language,
        snippets: () => this.snippets,
      });
      await this.zenFeed.restorePastFacts();
      this.zenFeed.refresh(this.snippets, this.language);
    }

    await this.browseManager.load();
    this.snippets = this.browseManager.getSnippets();

    if (this.zenDisplay === 'cosmos') {
      this.cosmosMode!.refresh(this.snippets, this.language);
      void this.cosmosMode!.start();
    } else {
      void this.zenFeed!.start();
    }

    void this.checkDigest();
    this.initReadingAssistant();
  }

  private initExportDropdown(): void {
    const exportBtn = document.getElementById('btn-export')!;
    const exportMenu = document.getElementById('export-menu')!;

    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    document.getElementById('btn-export-md')!.addEventListener('click', () => {
      this.browseManager.exportMarkdown();
      exportMenu.classList.add('hidden');
    });

    document.getElementById('btn-export-json')!.addEventListener('click', () => {
      this.browseManager.exportJson();
      exportMenu.classList.add('hidden');
    });
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
      const domain = (() => { try { return new URL(item.url).hostname; } catch { return item.url.slice(0, 40); } })();
      row.innerHTML = `
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="rl-link">${escapeHtml(item.title || domain)}</a>
        <button class="rl-remove" data-url="${escapeHtml(item.url)}" type="button">✕</button>
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

  private async checkDigest(): Promise<void> {
    const digest = await getStoredDigest();
    if (!digest) return;

    const toastEl = document.getElementById('digest-toast')!;
    const textEl = document.getElementById('digest-text')!;
    textEl.textContent = digest;
    toastEl.classList.remove('hidden');

    document.getElementById('btn-dismiss-digest')!.addEventListener('click', async () => {
      toastEl.classList.add('hidden');
      await saveStoredDigest(null);
    }, { once: true });
  }

  private initReadingAssistant(): void {
    const bar = document.getElementById('reading-assistant-bar')!;
    const textEl = document.getElementById('reading-assistant-text')!;

    document.getElementById('btn-view-related')!.addEventListener('click', () => {
      bar.classList.add('hidden');
      this.setMode('browse');
    });

    document.getElementById('btn-dismiss-ra')!.addEventListener('click', () => {
      bar.classList.add('hidden');
    });

    const refresh = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          bar.classList.add('hidden');
          return;
        }

        const response = await chrome.runtime.sendMessage({
          type: MSG.GET_SNIPPETS_FOR_TAB,
          url: tab.url,
          title: tab.title ?? '',
        }) as { ok: boolean; snippets?: Snippet[] };

        if (!response?.ok || !response.snippets?.length) {
          bar.classList.add('hidden');
          return;
        }

        const count = response.snippets.length;
        textEl.textContent = `${count} related save${count > 1 ? 's' : ''} for this page`;
        bar.classList.remove('hidden');
      } catch {
        bar.classList.add('hidden');
      }
    };

    void refresh();
    chrome.tabs.onActivated.addListener(() => void refresh());
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

  private showHistoryPrompt(): void {
    const prompt = qs<HTMLElement>('#history-prompt');
    prompt.classList.remove('hidden');

    qs<HTMLButtonElement>('#history-prompt-yes').addEventListener('click', () => {
      void (async () => {
        await Promise.all([setHistoryEnabled(true), setOnboardingDone()]);
        prompt.classList.add('hidden');
        await chrome.runtime.sendMessage({ type: MSG.SYNC_HISTORY });
      })();
    });

    qs<HTMLButtonElement>('#history-prompt-no').addEventListener('click', () => {
      void (async () => {
        await Promise.all([setHistoryEnabled(false), setOnboardingDone()]);
        prompt.classList.add('hidden');
      })();
    });
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
      this.cosmosMode.refresh(this.snippets, this.language);
      if (this.mode === 'zen') void this.cosmosMode.start();
    } else {
      this.cosmosViewEl.classList.add('hidden');
      this.zenFeedEl.classList.remove('hidden');
      this.cosmosMode = null;
      this.zenFeed = new ZenFeed(this.zenFeedEl, {
        language: this.language,
        snippets: () => this.snippets,
      });
      await this.zenFeed.restorePastFacts();
      this.zenFeed.refresh(this.snippets, this.language);
      if (this.mode === 'zen') void this.zenFeed.start();
    }
  }

  private syncDisplayToggle(display: 'feed' | 'cosmos'): void {
    document.querySelectorAll<HTMLButtonElement>('.zdt-btn').forEach(btn => {
      const active = btn.dataset.display === display;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  private setMode(mode: ViewMode): void {
    this.mode = mode;
    this.browseBtn.classList.toggle('active', mode === 'browse');
    this.chatBtn.classList.toggle('active', mode === 'chat');
    this.browseBtn.setAttribute('aria-selected', String(mode === 'browse'));
    this.chatBtn.setAttribute('aria-selected', String(mode === 'chat'));
    this.viewZen.classList.toggle('hidden', mode !== 'zen');
    this.viewBrowse.classList.toggle('hidden', mode !== 'browse');
    this.viewChat.classList.toggle('hidden', mode !== 'chat');

    if (mode === 'zen') {
      if (this.zenDisplay === 'cosmos') {
        void this.cosmosMode?.start();
      } else {
        void this.zenFeed?.start();
      }
    } else {
      this.zenFeed?.stop();
      this.cosmosMode?.stop();
    }
  }

  private updateCounts(all: number, manual: number, history: number, pinned: number): void {
    const setCount = (id: string, val: number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setCount('count-all', all);
    setCount('count-manual', manual);
    setCount('count-history', history);
    setCount('count-pinned', pinned);
  }
}

void new SontoSidebar().init();