// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from '../shared/icons';
import { MSG } from '../shared/messages';
import {
  getSettings,
  isOnboardingDone,
  setOnboardingDone,
  getDefaultClipboardTab,
  saveDefaultClipboardTab,
  getDefaultView,
} from '../shared/storage';
import { ClipboardManager, PROMPT_COLORS } from './clipboard-manager';
import type { PromptColor } from '../shared/storage';
import { PromptsManager } from './prompts-manager';
import {
  ThemeController,
  ViewController,
  PromptModalController,
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
  private readonly navBrowse = qs<HTMLButtonElement>('#nav-browse');
  private readonly navPrompts = qs<HTMLButtonElement>('#nav-prompts');
  private readonly clipPageBtn = qs<HTMLButtonElement>('#btn-clip-page');
  private readonly viewZen = qs<HTMLElement>('#view-zen');
  private readonly viewClipboard = qs<HTMLElement>('#view-clipboard');
  private readonly browseContent = qs<HTMLElement>('#browse-content');
  private readonly promptsContent = qs<HTMLElement>('#prompts-content');
  private readonly zenFeedEl = qs<HTMLElement>('#zen-feed');
  private readonly cosmosViewEl = qs<HTMLElement>('#cosmos-view');
  private readonly clipListEl = qs<HTMLElement>('#clip-list');
  private readonly promptsListEl = qs<HTMLElement>('#prompts-list');
  private readonly promptsFiltersEl = qs<HTMLElement>('#prompts-filters');
  private readonly searchInputEl = qs<HTMLInputElement>('#clipboard-search');
  private readonly promptsSearchEl = qs<HTMLInputElement>('#prompts-search');

  private readonly clipManager = new ClipboardManager(this.clipListEl);
  private readonly promptsManager = new PromptsManager(this.promptsListEl, this.promptsSearchEl, this.promptsFiltersEl);
  private readonly themeController = new ThemeController(this.themeBtn);
  private viewController!: ViewController;
  private promptModalController!: PromptModalController;

  private currentDomain = '';
  private currentTab: 'browse' | 'prompts' = 'browse';

  async init(): Promise<void> {
    this.settingsBtn.addEventListener('click', () => {
      void chrome.runtime.openOptionsPage();
    });

    this.navBrowse.addEventListener('click', () => this.switchTab('browse'));
    this.navPrompts.addEventListener('click', () => this.switchTab('prompts'));

    this.clipPageBtn.addEventListener('click', () => this.handleClipPage());

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.CLIP_ADDED) {
        void this.clipManager.load(this.currentDomain);
      }
      if (message.type === MSG.PROMPT_ADDED) {
        void this.promptsManager.load();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const mode = this.viewController?.getMode();
        if (mode === 'clipboard') {
          void (async () => {
            await this.refreshDomain();
            if (this.currentTab === 'browse') {
              await this.clipManager.load(this.currentDomain);
            } else {
              await this.promptsManager.load();
            }
          })();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      const mode = this.viewController?.getMode();
      if (mode === 'clipboard') {
        if (e.key === '/' && document.activeElement !== this.searchInputEl && document.activeElement !== this.promptsSearchEl) {
          e.preventDefault();
          if (this.currentTab === 'browse') {
            this.searchInputEl.focus();
          } else {
            this.promptsSearchEl.focus();
          }
          return;
        }
        if (this.currentTab === 'browse' && document.activeElement === this.searchInputEl) return;
        if (this.currentTab === 'prompts' && document.activeElement === this.promptsSearchEl) return;
        if (this.currentTab === 'browse' && this.clipManager.handleKey(e)) {
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

    let promptsSearchDebounce: ReturnType<typeof setTimeout> | null = null;
    const doPromptsSearch = () => void this.promptsManager.search(this.promptsSearchEl.value);
    this.promptsSearchEl.addEventListener('input', () => {
      if (promptsSearchDebounce) clearTimeout(promptsSearchDebounce);
      promptsSearchDebounce = setTimeout(doPromptsSearch, 400);
    });
    this.promptsSearchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (promptsSearchDebounce) clearTimeout(promptsSearchDebounce);
        doPromptsSearch();
      }
    });

    let defaultTab: 'browse' | 'prompts' = 'browse';
    try {
      const [settings, onboardingDone, savedTab] = await Promise.all([
        getSettings(),
        isOnboardingDone(),
        getDefaultClipboardTab(),
      ]);
      this.language = settings.language ?? 'en';
      defaultTab = savedTab;

      if (!onboardingDone) {
        await setOnboardingDone();
      }

      if (defaultTab === 'prompts') {
        this.switchTab('prompts');
      }

      createIcons({ icons, attrs: { strokeWidth: 1.5 } });
    } catch (err) {
      console.error('[Sonto] Failed to initialize settings:', err);
    }

    await this.initControllers(defaultTab);

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
      if (area === 'local' && changes.sonto_prompts) {
        if (this.currentTab === 'prompts') {
          void this.promptsManager.load();
        }
      }
    });
  }

  private async initControllers(defaultTab: 'browse' | 'prompts'): Promise<void> {
    await this.themeController.init();

    const theme = this.themeController.getTheme();

    await this.refreshDomain();

    this.promptModalController = new PromptModalController({
      modal: qs('#prompt-modal'),
      input: qs('#prompt-input'),
      labelInput: qs('#prompt-label-input'),
      cancelBtn: qs('#prompt-cancel'),
      saveBtn: qs('#prompt-save'),
      addBtn: qs('#btn-add-prompt'),
      onSaved: async () => {
        await this.promptsManager.load();
      },
    });
    this.promptModalController.init();

    // Add clip modal in browse tab
    const addClipModal = qs('#add-clip-modal');
    const addClipInput = qs('#add-clip-input') as HTMLTextAreaElement;
    const addClipCancel = qs('#add-clip-cancel');
    const addClipSave = qs('#add-clip-save');
    const addClipBtn = qs('#btn-add-clip');
    const addClipColors = qs('#add-clip-colors');
    let selectedClipColor: string | undefined;

    const showAddClipModal = () => {
      addClipModal.classList.remove('hidden');
      addClipInput.value = '';
      selectedClipColor = undefined;
      updateClipColorSelection();
      addClipInput.focus();
    };

    const hideAddClipModal = () => {
      addClipModal.classList.add('hidden');
      addClipInput.value = '';
      selectedClipColor = undefined;
      updateClipColorSelection();
    };

    const updateClipColorSelection = () => {
      addClipColors.querySelectorAll('.color-dot').forEach((dot) => {
        dot.classList.toggle('selected', (dot as HTMLElement).dataset.color === selectedClipColor);
      });
    };

    addClipColors.querySelectorAll('.color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const color = (dot as HTMLElement).dataset.color as PromptColor;
        if (!PROMPT_COLORS[color]) return;
        selectedClipColor = selectedClipColor === color ? undefined : color;
        updateClipColorSelection();
      });
    });

    addClipBtn.addEventListener('click', showAddClipModal);
    addClipCancel.addEventListener('click', hideAddClipModal);
    addClipModal.addEventListener('click', (e) => {
      if (e.target === addClipModal) hideAddClipModal();
    });
    addClipSave.addEventListener('click', () => {
      const text = addClipInput.value.trim();
      if (!text) {
        hideAddClipModal();
        return;
      }
      void chrome.runtime.sendMessage({
        type: MSG.SAVE_SONTO_ITEM,
        item: {
          content: text,
          type: 'clip',
          source: 'manual',
          contentType: 'text',
          tags: [],
          pinned: false,
          zenified: false,
          metadata: selectedClipColor ? { color: selectedClipColor } : undefined,
        },
      }).then((response) => {
        void this.clipManager.load(this.currentDomain);
      }).catch((err) => {
        console.error('[Sonto] Failed to add clip:', err);
      });
      hideAddClipModal();
    });

    const defaultView = await getDefaultView();

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

    await this.viewController.init(defaultView, theme);

    if (defaultTab === 'prompts') {
      await this.promptsManager.load();
    } else {
      await this.clipManager.load(this.currentDomain);
    }
  }

  private async refreshDomain(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentDomain = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
    } catch {
      this.currentDomain = '';
    }
  }

  private async handleClipPage(): Promise<void> {
    this.clipPageBtn.disabled = true;
    const originalTitle = this.clipPageBtn.getAttribute('title');
    this.clipPageBtn.setAttribute('title', 'Clipping...');

    try {
      const result = await chrome.runtime.sendMessage({ type: MSG.CLIP_PAGE });
      if (result?.ok) {
        await this.clipManager.load(this.currentDomain);
      } else {
        console.error('[Sonto] Clip page failed:', result?.message);
      }
    } catch (err) {
      console.error('[Sonto] Clip page error:', err);
    } finally {
      this.clipPageBtn.disabled = false;
      this.clipPageBtn.setAttribute('title', originalTitle ?? 'Clip current page');
    }
  }

  private switchTab(tab: 'browse' | 'prompts'): void {
    if (this.currentTab === tab) return;
    this.currentTab = tab;

    this.browseContent.classList.toggle('hidden', tab !== 'browse');
    this.promptsContent.classList.toggle('hidden', tab !== 'prompts');
    this.navBrowse.classList.toggle('active', tab === 'browse');
    this.navPrompts.classList.toggle('active', tab === 'prompts');

    this.navBrowse.setAttribute('aria-selected', tab === 'browse' ? 'true' : 'false');
    this.navPrompts.setAttribute('aria-selected', tab === 'prompts' ? 'true' : 'false');

    if (tab === 'browse') {
      void this.clipManager.load(this.currentDomain);
    } else {
      void this.promptsManager.load();
    }

    void saveDefaultClipboardTab(tab);
  }
}

void new SontoSidebar().init();
