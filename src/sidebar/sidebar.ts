// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import {
  getSettings,
  isOnboardingDone,
  setOnboardingDone,
  getTheme,
  saveTheme,
  getReadLater,
} from '../shared/storage';
import type { ReadLaterItem } from '../shared/types';
import { ClipboardManager } from './clipboard-manager';
import type { ClipFilter } from './clipboard-manager';
import { ZenFeed } from './zen/zen-feed';
import { escapeHtml } from '../shared/utils';

type ViewMode = 'zen' | 'clipboard';

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

class SontoSidebar {
  private mode: ViewMode = 'zen';
  private language = 'en';
  private theme: 'dark' | 'light' = 'dark';

  private readonly clipboardBtn = qs<HTMLButtonElement>('#btn-clipboard');
  private readonly themeBtn = qs<HTMLButtonElement>('#btn-theme');
  private readonly viewZen = qs<HTMLElement>('#view-zen');
  private readonly viewClipboard = qs<HTMLElement>('#view-clipboard');
  private readonly zenFeedEl = qs<HTMLElement>('#zen-feed');
  private readonly clipListEl = qs<HTMLElement>('#clip-list');
  private readonly clipCountEl = qs<HTMLElement>('#clip-count');
  private readonly searchInputEl = qs<HTMLInputElement>('#clipboard-search');

  private readonly clipManager = new ClipboardManager(this.clipListEl, this.clipCountEl);

  private zenFeed: ZenFeed | null = null;

  async init(): Promise<void> {
    qs<HTMLButtonElement>('#btn-settings').addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: MSG.OPEN_SETTINGS });
    });

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.CLIP_ADDED) {
        void this.clipManager.load();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.mode === 'clipboard') {
        void this.clipManager.load();
      }
    });

    const toggleClipboard = () => this.setMode(this.mode === 'clipboard' ? 'zen' : 'clipboard');
    this.clipboardBtn.addEventListener('click', toggleClipboard);
    this.themeBtn.addEventListener('click', () => void this.toggleTheme());

    qs<HTMLButtonElement>('#btn-clear-all').addEventListener('click', () =>
      void this.clipManager.clearAll(),
    );

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

    document.querySelectorAll<HTMLButtonElement>('.filter-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = (btn.dataset.filter ?? 'all') as ClipFilter;
        document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.searchInputEl.value = '';
        this.clipManager.setFilter(filter);
      });
    });

    this.initExportDropdown();
    this.initReadLaterBar();

    try {
      const [settings, onboardingDone, theme] = await Promise.all([
        getSettings(),
        isOnboardingDone(),
        getTheme(),
      ]);
      this.language = settings.language ?? 'en';
      this.theme = theme;
      this.applyTheme(theme);
      if (!onboardingDone) {
        await setOnboardingDone();
      }
    } catch {}

    this.zenFeed = new ZenFeed(this.zenFeedEl, {
      language: this.language,
      snippets: () => [],
    });
    await this.zenFeed.restorePastFacts();

    await this.clipManager.load();

    void this.zenFeed.start();
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
      this.clipManager.exportMarkdown();
      exportMenu.classList.add('hidden');
    });

    document.getElementById('btn-export-json')!.addEventListener('click', () => {
      this.clipManager.exportJson();
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
      const domain = (() => {
        try {
          return new URL(item.url).hostname;
        } catch {
          return item.url.slice(0, 40);
        }
      })();
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
    this.clipboardBtn.classList.toggle('active', mode === 'clipboard');
    this.clipboardBtn.setAttribute('aria-selected', String(mode === 'clipboard'));
    this.viewZen.classList.toggle('hidden', mode !== 'zen');
    this.viewClipboard.classList.toggle('hidden', mode !== 'clipboard');

    if (mode === 'zen') {
      void this.zenFeed?.start();
    } else {
      this.zenFeed?.stop();
      void this.clipManager.load();
    }
  }
}

void new SontoSidebar().init();
