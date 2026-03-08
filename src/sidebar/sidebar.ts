import { MSG } from '../shared/messages';
import { getSettings, getZenDisplay, isOnboardingDone, setOnboardingDone, setHistoryEnabled } from '../shared/storage';
import type { Snippet } from '../shared/types';
import { BrowseManager } from './browse-manager';
import { ChatManager } from './chat-manager';
import { CosmosMode } from './cosmos-mode';
import { ZenFeed } from './zen/zen-feed';

type FilterMode = 'all' | 'manual' | 'history';
type ViewMode = 'zen' | 'browse' | 'chat';

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

class SontoSidebar {
  private mode: ViewMode = 'zen';
  private snippets: Snippet[] = [];
  private language = 'en';
  private zenDisplay: 'feed' | 'cosmos' = 'feed';

  private readonly zenBtn = qs<HTMLButtonElement>('#btn-zen');
  private readonly browseBtn = qs<HTMLButtonElement>('#btn-browse');
  private readonly chatBtn = qs<HTMLButtonElement>('#btn-chat');
  private readonly viewZen = qs<HTMLElement>('#view-zen');
  private readonly viewBrowse = qs<HTMLElement>('#view-browse');
  private readonly viewChat = qs<HTMLElement>('#view-chat');
  private readonly zenFeedEl = qs<HTMLElement>('#zen-feed');
  private readonly cosmosViewEl = qs<HTMLElement>('#cosmos-view');
  private readonly snippetListEl = qs<HTMLElement>('#snippet-list');
  private readonly chatMessagesEl = qs<HTMLElement>('#chat-messages');
  private readonly chatInputEl = qs<HTMLTextAreaElement>('#chat-input');
  private readonly sendBtnEl = qs<HTMLButtonElement>('#btn-send');

  private readonly browseManager = new BrowseManager(
    this.snippetListEl,
    (all, manual, history) => this.updateCounts(all, manual, history),
  );

  private zenFeed: ZenFeed | null = null;
  private cosmosMode: CosmosMode | null = null;

  private readonly chatManager = new ChatManager(
    this.chatMessagesEl,
    this.chatInputEl,
    this.sendBtnEl,
    () => this.snippets,
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

    this.zenBtn.addEventListener('click', () => this.setMode('zen'));
    this.browseBtn.addEventListener('click', () => this.setMode('browse'));
    this.chatBtn.addEventListener('click', () => this.setMode('chat'));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sonto_zen_display) {
        const newMode = changes.sonto_zen_display.newValue as string;
        if (newMode === 'feed' || newMode === 'cosmos') {
          void this.switchZenDisplay(newMode);
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

    this.sendBtnEl.addEventListener('click', () => void this.chatManager.sendMessage());
    this.chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.chatManager.sendMessage();
      }
    });

    try {
      const [settings, zenDisplay, onboardingDone] = await Promise.all([getSettings(), getZenDisplay(), isOnboardingDone()]);
      this.language = settings.language ?? 'en';
      this.zenDisplay = zenDisplay;
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

  private setMode(mode: ViewMode): void {
    this.mode = mode;
    this.zenBtn.classList.toggle('active', mode === 'zen');
    this.browseBtn.classList.toggle('active', mode === 'browse');
    this.chatBtn.classList.toggle('active', mode === 'chat');
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

  private updateCounts(all: number, manual: number, history: number): void {
    const countAll = document.getElementById('count-all');
    const countManual = document.getElementById('count-manual');
    const countHistory = document.getElementById('count-history');
    if (countAll) countAll.textContent = String(all);
    if (countManual) countManual.textContent = String(manual);
    if (countHistory) countHistory.textContent = String(history);
  }
}

void new SontoSidebar().init();
