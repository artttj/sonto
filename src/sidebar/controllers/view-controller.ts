// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { saveDefaultView, getZenDisplay } from '../../shared/storage';
import { ZenFeed } from '../zen/zen-feed';
import { CosmosMode } from '../cosmos-mode';
import { ClipboardManager } from '../clipboard-manager';

type ViewMode = 'zen' | 'clipboard';
type ZenDisplay = 'feed' | 'cosmos';

interface ViewControllerDeps {
  viewZen: HTMLElement;
  viewClipboard: HTMLElement;
  feedBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  zenFeedEl: HTMLElement;
  cosmosViewEl: HTMLElement;
  clipManager: ClipboardManager;
  language: string;
  onViewChange?: (mode: ViewMode) => void;
  onZenDisplayChange?: (display: ZenDisplay) => void;
}

export class ViewController {
  private mode: ViewMode = 'clipboard';
  private zenDisplay: ZenDisplay = 'feed';
  private language: string;

  private deps: ViewControllerDeps;
  private zenFeed: ZenFeed | null = null;
  private cosmosMode: CosmosMode | null = null;

  constructor(deps: ViewControllerDeps, language: string) {
    this.deps = deps;
    this.language = language;
  }

  async init(defaultMode: ViewMode, theme: 'dark' | 'light'): Promise<void> {
    this.zenDisplay = await getZenDisplay();
    this.mode = defaultMode;

    this.deps.feedBtn.addEventListener('click', () => this.setMode('zen'));
    this.deps.backBtn.addEventListener('click', () => this.setMode('clipboard'));

    this.syncUI();

    if (this.mode === 'zen') {
      await this.initZenView(theme);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sonto_zen_display) {
        const newDisplay = changes.sonto_zen_display.newValue as ZenDisplay;
        void this.switchZenDisplay(newDisplay, theme);
      }
    });
  }

  getMode(): ViewMode {
    return this.mode;
  }

  getZenDisplay(): ZenDisplay {
    return this.zenDisplay;
  }

  setMode(mode: ViewMode, theme?: 'dark' | 'light'): void {
    if (this.mode === mode) return;

    this.mode = mode;
    this.syncUI();

    if (mode === 'zen') {
      if (this.zenDisplay === 'cosmos') {
        this.deps.zenFeedEl.classList.add('hidden');
        this.deps.cosmosViewEl.classList.remove('hidden');
        this.ensureCosmosMode(theme);
        void this.cosmosMode?.start();
      } else {
        this.deps.cosmosViewEl.classList.add('hidden');
        this.deps.zenFeedEl.classList.remove('hidden');
        if (!this.zenFeed) {
          this.zenFeed = new ZenFeed(this.deps.zenFeedEl, { language: this.language });
          void this.zenFeed.restorePastFacts().then(() => {
            void this.zenFeed?.start();
          });
        } else {
          void this.zenFeed.start();
        }
      }
    } else {
      this.zenFeed?.stop();
      this.cosmosMode?.stop();
      void this.deps.clipManager.load();
    }

    void saveDefaultView(mode);
    this.deps.onViewChange?.(mode);
  }

  stopZen(): void {
    this.zenFeed?.stop();
    this.cosmosMode?.stop();
  }

  updateDripInterval(ms: number): void {
    this.zenFeed?.setDripInterval(ms);
    this.cosmosMode?.setIntervalMs(ms);
  }

  setZenTheme(theme: 'dark' | 'light'): void {
    if (this.cosmosMode && this.zenDisplay === 'cosmos') {
      this.cosmosMode.setTheme(theme);
    }
  }

  private async initZenView(theme: 'dark' | 'light'): Promise<void> {
    if (this.zenDisplay === 'cosmos') {
      this.deps.zenFeedEl.classList.add('hidden');
      this.deps.cosmosViewEl.classList.remove('hidden');
      this.ensureCosmosMode(theme);
      void this.cosmosMode?.start();
    } else {
      this.zenFeed = new ZenFeed(this.deps.zenFeedEl, { language: this.language });
      await this.zenFeed.restorePastFacts();
      void this.zenFeed.start();
    }
  }

  private async switchZenDisplay(display: ZenDisplay, theme?: 'dark' | 'light'): Promise<void> {
    if (display === this.zenDisplay) return;

    this.zenFeed?.stop();
    this.cosmosMode?.stop();
    this.zenDisplay = display;

    if (display === 'cosmos') {
      this.deps.zenFeedEl.classList.add('hidden');
      this.deps.cosmosViewEl.classList.remove('hidden');
      this.zenFeed = null;
      this.cosmosMode = new CosmosMode(this.deps.cosmosViewEl, this.language);
      if (this.mode === 'zen') void this.cosmosMode.start();
    } else {
      this.deps.cosmosViewEl.classList.add('hidden');
      this.deps.zenFeedEl.classList.remove('hidden');
      this.cosmosMode = null;
      this.ensureCosmosMode(theme);
      this.zenFeed = new ZenFeed(this.deps.zenFeedEl, { language: this.language });
      await this.zenFeed.restorePastFacts();
      if (this.mode === 'zen') void this.zenFeed.start();
    }

    this.deps.onZenDisplayChange?.(display);
  }

  private ensureCosmosMode(theme?: 'dark' | 'light'): void {
    if (!this.cosmosMode) {
      this.cosmosMode = new CosmosMode(this.deps.cosmosViewEl, this.language);
      if (theme) this.cosmosMode.setTheme(theme);
    }
  }

  private syncUI(): void {
    this.deps.viewZen.classList.toggle('hidden', this.mode !== 'zen');
    this.deps.viewClipboard.classList.toggle('hidden', this.mode !== 'clipboard');
    this.deps.feedBtn.classList.toggle('hidden', this.mode === 'zen');
    this.deps.backBtn.classList.toggle('hidden', this.mode !== 'zen');
  }
}