// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from '../shared/icons';
import { type PromptColor } from '../shared/storage';
import { MSG } from '../shared/messages';
import type { SontoItem, SontoContentType, SontoItemFilter } from '../shared/types';
import { escapeHtml, formatDate, extractDomain } from '../shared/utils';
import { insertTextToActiveTab } from '../shared/tab-operations';
import { highlightCode } from './syntax-highlight';
import { showToast, renderTags, showTagEditor, loadAllTags, toggleZenify, moveCardToTop } from './utils';

export const PROMPT_COLORS: Record<PromptColor, { bg: string; border: string; hex: string }> = {
  red:    { bg: 'rgba(255,90,90,0.18)', border: 'rgba(255,90,90,0.9)', hex: '#ff5a5a' },
  orange: { bg: 'rgba(255,160,60,0.18)', border: 'rgba(255,160,60,0.9)', hex: '#ffa03c' },
  yellow: { bg: 'rgba(200,160,20,0.25)', border: 'rgba(200,160,20,0.9)', hex: '#c8a014' },
  green:  { bg: 'rgba(60,200,100,0.18)', border: 'rgba(60,200,100,0.9)', hex: '#3cc864' },
  blue:   { bg: 'rgba(60,140,255,0.18)', border: 'rgba(60,140,255,0.9)', hex: '#3c8cff' },
  purple: { bg: 'rgba(140,90,220,0.18)', border: 'rgba(140,90,220,0.9)', hex: '#8c5adc' },
  gray:   { bg: 'rgba(140,140,140,0.18)', border: 'rgba(140,140,140,0.9)', hex: '#8c8c8c' },
};

const TEXT_PREVIEW_CHARS = 280;
const CODE_PREVIEW_CHARS = 300;
const COPY_FEEDBACK_MS = 1500;

let fullTextModal: HTMLElement | null = null;
let fullTextOverlay: HTMLElement | null = null;

function initFullTextModal(): void {
  if (fullTextModal) return;

  fullTextOverlay = document.createElement('div');
  fullTextOverlay.className = 'fulltext-overlay hidden';
  fullTextOverlay.addEventListener('click', hideFullText);

  fullTextModal = document.createElement('div');
  fullTextModal.className = 'fulltext-modal';
  fullTextModal.innerHTML = `
    <div class="fulltext-header">
      <span class="fulltext-title">Full Text</span>
      <button class="fulltext-close" aria-label="Close">✕</button>
    </div>
    <div class="fulltext-content"></div>
    <div class="fulltext-actions">
      <button class="fulltext-insert">Insert</button>
      <button class="fulltext-copy">Copy</button>
    </div>
  `;

  fullTextModal.querySelector('.fulltext-close')?.addEventListener('click', hideFullText);
  document.body.appendChild(fullTextOverlay);
  document.body.appendChild(fullTextModal);
}

function showFullText(text: string, contentType: SontoContentType): void {
  initFullTextModal();
  if (!fullTextModal || !fullTextOverlay) return;

  const contentEl = fullTextModal.querySelector('.fulltext-content')!;
  const copyBtn = fullTextModal.querySelector('.fulltext-copy')! as HTMLButtonElement;

  if (contentType === 'code') {
    contentEl.innerHTML = `<pre><code>${highlightCode(text)}</code></pre>`;
  } else {
    contentEl.textContent = text;
  }

  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    void navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, COPY_FEEDBACK_MS);
    });
  };

  const insertBtn = fullTextModal.querySelector('.fulltext-insert')! as HTMLButtonElement;
  insertBtn.textContent = 'Insert';
  insertBtn.onclick = () => {
    void insertTextToActiveTab(text).then((result) => {
      if (result.error) {
        showToast(result.error, true);
      } else {
        insertBtn.textContent = 'Inserted!';
        setTimeout(() => { insertBtn.textContent = 'Insert'; }, COPY_FEEDBACK_MS);
      }
    });
  };

  fullTextOverlay.classList.remove('hidden');
  fullTextModal.classList.add('open');
}

function hideFullText(): void {
  fullTextOverlay?.classList.add('hidden');
  fullTextModal?.classList.remove('open');
}

function qs<T extends Element>(selector: string, parent: ParentNode = document): T {
  const el = parent.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

function contentTypeLabel(type: SontoContentType): string {
  switch (type) {
    case 'link': return 'Link';
    case 'code': return 'Code';
    case 'email': return 'Email';
    case 'image': return 'Image';
    case 'quote': return 'Quote';
    case 'art': return 'Art';
    case 'idea': return 'Idea';
    case 'haiku': return 'Haiku';
    case 'proverb': return 'Proverb';
    case 'strategy': return 'Strategy';
    default: return 'Text';
  }
}

function contentTypeIcon(type: SontoContentType): string {
  switch (type) {
    case 'link': return '↗';
    case 'code': return '{}';
    case 'email': return '@';
    case 'image': return '▨';
    case 'quote': return '"';
    case 'art': return '◈';
    case 'idea': return '◐';
    case 'haiku': return '❋';
    case 'proverb': return '◉';
    case 'strategy': return '⚇';
    default: return '¶';
  }
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname.slice(0, 30) : '');
  } catch {
    return url.slice(0, 40);
  }
}

export class ClipboardManager {
  private clips: SontoItem[] = [];
  private listEl: HTMLElement;
  private isLoading = false;
  private selectedIndex = -1;
  private activeDomain = '';
  private activeTagFilter: string | null = null;
  private allTags: string[] = [];
  private inputAvailable = false;
  private tagFilterEl: HTMLElement;
  private tagFilterLabelEl: HTMLElement;
  private tagFilterClearEl: HTMLButtonElement;

  constructor(listEl: HTMLElement) {
    this.listEl = listEl;
    this.tagFilterEl = document.querySelector('#tag-filter')!;
    this.tagFilterLabelEl = document.querySelector('#tag-filter-label')!;
    this.tagFilterClearEl = document.querySelector('#tag-filter-clear')!;
    void this.checkInputAvailability();
    this.setupTabChangeListener();
    this.setupTagFilterClear();
  }

  private setupTagFilterClear(): void {
    this.tagFilterClearEl.addEventListener('click', () => {
      this.clearTagFilter();
    });
  }

  private clearTagFilter(): void {
    this.activeTagFilter = null;
    this.tagFilterEl.classList.add('hidden');
    void this.load(this.activeDomain);
  }

  private setupTabChangeListener(): void {
    chrome.tabs?.onActivated.addListener(() => {
      void this.checkInputAvailability();
    });
  }

  private async checkInputAvailability(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        this.inputAvailable = false;
        this.updateInsertButtons();
        return;
      }

      const response = await chrome.tabs.sendMessage(activeTab.id, { type: MSG.CHECK_INPUT_AVAILABLE });
      this.inputAvailable = !!response?.available;
    } catch {
      this.inputAvailable = false;
    }
    this.updateInsertButtons();
  }

  private updateInsertButtons(): void {
    const insertButtons = this.listEl.querySelectorAll<HTMLButtonElement>('.clip-btn-insert');
    insertButtons.forEach((btn) => {
      btn.classList.toggle('active', this.inputAvailable);
    });
  }

  async load(domain?: string, tagFilter?: string): Promise<void> {
    this.allTags = await loadAllTags();
    this.activeDomain = domain ?? '';
    this.setLoading(true);
    try {
      const filter: SontoItemFilter = {
        types: ['clip'],
      };
      if (tagFilter) {
        filter.tags = [tagFilter];
      }
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SONTO_ITEMS, filter });
      this.clips = response?.ok ? (response.items as SontoItem[]) : [];
    } catch (err) {
      console.error('[Sonto] Failed to load clipboard:', err);
    } finally {
      this.setLoading(false);
      this.render();
    }
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      await this.load(this.activeDomain);
      return;
    }
    this.activeTagFilter = null;
    this.tagFilterEl.classList.add('hidden');
    this.setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.SEARCH_SONTO_ITEMS,
        query,
        filter: { types: ['clip'] },
      });
      this.clips = response?.ok ? response.items : [];
    } catch (err) {
      console.error('[Sonto] Search failed:', err);
    } finally {
      this.setLoading(false);
      this.render();
    }
  }

  async filterByTag(tag: string): Promise<void> {
    this.activeTagFilter = tag;
    this.tagFilterLabelEl.textContent = tag;
    this.tagFilterEl.classList.remove('hidden');
    createIcons({ icons, attrs: { strokeWidth: 2.5 } });
    await this.load(this.activeDomain, tag);
  }

  handleKey(e: KeyboardEvent): boolean {
    const cards = this.getCards();
    if (cards.length === 0) return false;

    if (e.key === 'ArrowDown') {
      this.selectedIndex = Math.min(this.selectedIndex + 1, cards.length - 1);
      this.selectCard(cards);
      return true;
    }
    if (e.key === 'ArrowUp') {
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.selectCard(cards);
      return true;
    }
    if (e.key === 'Enter' && this.selectedIndex >= 0) {
      const card = cards[this.selectedIndex];
      const clip = this.clips.find((c) => c.id === card.dataset.id);
      if (clip) {
        void navigator.clipboard.writeText(clip.content).then(() => {
          const btn = card.querySelector<HTMLButtonElement>('.clip-btn-copy');
          if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, COPY_FEEDBACK_MS); }
        }).catch(() => {});
      }
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIndex >= 0) {
      const card = cards[this.selectedIndex];
      const id = card.dataset.id;
      if (id) {
        void this.deleteClip(id, card);
        if (this.selectedIndex >= this.clips.length - 1) {
          this.selectedIndex = Math.max(this.clips.length - 2, -1);
        }
      }
      return true;
    }
    return false;
  }

  render(): void {
    this.listEl.innerHTML = '';
    this.selectedIndex = -1;

    if (this.isLoading) {
      this.renderLoading();
      return;
    }

    if (this.clips.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'clips-empty';
      empty.innerHTML = `
        <div class="empty-icon">⌘C</div>
        <p>Your clipboard history is empty.</p>
        <p class="empty-hint">Copy any text on a web page and it will appear here.</p>
      `;
      this.listEl.appendChild(empty);
      return;
    }

    const pinned = this.clips.filter((c) => c.pinned);
    const regular = this.clips.filter((c) => !c.pinned);

    if (pinned.length > 0) {
      this.addSeparator('Pinned', 'pinned-separator');
      for (const clip of pinned) {
        this.listEl.appendChild(this.buildCard(clip));
      }
    }

    if (this.activeDomain) {
      const siteClips = regular.filter((c) => this.matchesDomain(c));
      const otherClips = regular.filter((c) => !this.matchesDomain(c));

      if (siteClips.length > 0) {
        this.addSeparator('From this site', 'site-separator');
        for (const clip of siteClips) {
          this.listEl.appendChild(this.buildCard(clip));
        }
      }
      this.renderByDay(otherClips);
    } else {
      this.renderByDay(regular);
    }

    createIcons({ icons, attrs: { strokeWidth: 1.5 } });
  }

  private matchesDomain(clip: SontoItem): boolean {
    if (!clip.url || !this.activeDomain) return false;
    const clipDomain = extractDomain(clip.url);
    return clipDomain === this.activeDomain || clipDomain.endsWith('.' + this.activeDomain);
  }

  private renderByDay(clips: SontoItem[]): void {
    let currentDay = '';
    for (const clip of clips) {
      const day = new Date(clip.createdAt).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      if (day !== currentDay) {
        currentDay = day;
        this.addSeparator(day);
      }
      this.listEl.appendChild(this.buildCard(clip));
    }
  }

  private addSeparator(label: string, extraClass?: string): void {
    const separator = document.createElement('div');
    separator.className = 'day-separator' + (extraClass ? ' ' + extraClass : '');
    separator.textContent = label;
    this.listEl.appendChild(separator);
  }

  private buildCard(clip: SontoItem): HTMLElement {
    const card = document.createElement('div');
    card.className = `clip-card clip-type-${clip.contentType}${clip.pinned ? ' clip-pinned' : ''}${clip.zenified ? ' clip-zenified' : ''}`;
    card.dataset.id = clip.id;

    const preview = clip.contentType === 'code'
      ? `<pre class="clip-code-preview"><code>${highlightCode(clip.content.slice(0, CODE_PREVIEW_CHARS))}</code></pre>`
      : `<p class="clip-text-preview">${escapeHtml(clip.content.slice(0, TEXT_PREVIEW_CHARS))}${clip.content.length > TEXT_PREVIEW_CHARS ? '…' : ''}</p>`;

    const sourceInfo = clip.url
      ? `<a class="clip-source-url" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(clip.url))}</a>`
      : '';

    const pinLabel = clip.pinned ? 'Unpin' : 'Pin';
    const zenifyLabel = clip.zenified ? 'Un-zenify' : 'Zenify';
    const needsExpand = clip.content.length > TEXT_PREVIEW_CHARS;
    const tagsHtml = renderTags(clip.tags);
    const colorStyles = clip.metadata?.color ? PROMPT_COLORS[clip.metadata.color as PromptColor] : null;
    const colorDot = colorStyles
      ? `<span class="prompt-color-tag" style="background: ${colorStyles.hex};"></span>`
      : '';

    card.innerHTML = `
      <div class="clip-header">
        <div class="clip-header-left">
          ${colorDot}
          <span class="clip-type-badge clip-badge-${clip.contentType}">
            <span class="clip-type-icon">${contentTypeIcon(clip.contentType)}</span>
            ${contentTypeLabel(clip.contentType)}
          </span>
        </div>
        <span class="clip-time">${formatDate(clip.createdAt)}</span>
      </div>
      <div class="clip-body${needsExpand ? ' clip-body-expandable' : ''}" ${needsExpand ? 'title="Click to view full text"' : ''}>
        ${preview}
        ${sourceInfo ? `<div class="clip-meta">${sourceInfo}</div>` : ''}
        ${tagsHtml}
      </div>
      <div class="clip-card-actions">
        <button class="clip-btn clip-btn-copy" title="Copy" aria-label="Copy this clip to clipboard"><i data-lucide="clipboard"></i></button>
        <button class="clip-btn clip-btn-insert${this.inputAvailable ? ' active' : ''}" title="Insert to input" aria-label="Insert text into active input field"><i data-lucide="text-cursor-input"></i></button>
        <button class="clip-btn clip-btn-pin${clip.pinned ? ' pinned' : ''}" title="${pinLabel}" aria-label="${pinLabel} this clip"><i data-lucide="star"></i></button>
        <button class="clip-btn clip-btn-zenify${clip.zenified ? ' zenified' : ''}" title="${zenifyLabel}" aria-label="${zenifyLabel} this clip"><i data-lucide="flower-2"></i></button>
        <button class="clip-btn clip-btn-tags" title="Edit tags" aria-label="Edit tags"><i data-lucide="tag"></i></button>
        ${needsExpand ? `<button class="clip-btn clip-btn-expand" title="View full" aria-label="View full text"><i data-lucide="maximize-2"></i></button>` : ''}
        <button class="clip-btn clip-btn-delete" title="Delete" aria-label="Delete this clip"><i data-lucide="trash-2"></i></button>
      </div>
    `;

    if (needsExpand) {
      const bodyEl = card.querySelector('.clip-body');
      const expandBtn = card.querySelector('.clip-btn-expand');
      const clickHandler = () => showFullText(clip.content, clip.contentType);
      bodyEl?.addEventListener('click', clickHandler);
      expandBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        clickHandler();
      });
    }

    const copyClip = () => {
      void navigator.clipboard.writeText(clip.content).then(() => {
        const btn = qs<HTMLButtonElement>('.clip-btn-copy', card);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), COPY_FEEDBACK_MS);
      }).catch(() => {});
    };

    qs<HTMLButtonElement>('.clip-btn-copy', card).addEventListener('click', copyClip);
    card.addEventListener('dblclick', copyClip);

    qs<HTMLButtonElement>('.clip-btn-insert', card).addEventListener('click', () => {
      void this.insertText(clip.content);
    });

    qs<HTMLButtonElement>('.clip-btn-pin', card).addEventListener('click', (e) => {
      e.stopPropagation();
      void this.togglePin(clip.id, card);
    });

    qs<HTMLButtonElement>('.clip-btn-zenify', card).addEventListener('click', (e) => {
      e.stopPropagation();
      void this.toggleZenify(clip.id, card);
    });

    qs<HTMLButtonElement>('.clip-btn-tags', card).addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTagEditor(clip);
    });

    const tagElements = card.querySelectorAll('.clip-tag');
    tagElements.forEach((tagEl) => {
      tagEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = (e.currentTarget as HTMLElement).dataset.tag;
        if (tag) {
          void this.filterByTag(tag);
        }
      });
    });

    qs<HTMLButtonElement>('.clip-btn-delete', card).addEventListener('click', () => {
      void this.deleteClip(clip.id, card);
    });

    return card;
  }

  private getCards(): NodeListOf<HTMLElement> {
    return this.listEl.querySelectorAll<HTMLElement>('.clip-card');
  }

  private selectCard(cards: NodeListOf<HTMLElement>): void {
    cards.forEach((c) => c.classList.remove('clip-selected'));
    if (this.selectedIndex >= 0 && this.selectedIndex < cards.length) {
      const card = cards[this.selectedIndex];
      card.classList.add('clip-selected');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
  }

  private renderLoading(): void {
    const loading = document.createElement('div');
    loading.className = 'clips-loading';
    loading.innerHTML = '<div class="spinner"></div>';
    this.listEl.appendChild(loading);
  }

  private async deleteClip(id: string, card: HTMLElement): Promise<void> {
    card.classList.add('clip-removing');
    await chrome.runtime.sendMessage({ type: MSG.DELETE_SONTO_ITEM, id });
    this.clips = this.clips.filter((c) => c.id !== id);

    setTimeout(() => {
      card.remove();

      const daySeps = this.listEl.querySelectorAll('.day-separator');
      daySeps.forEach((sep) => {
        const next = sep.nextElementSibling;
        if (!next || next.classList.contains('day-separator')) {
          sep.remove();
        }
      });

      if (this.clips.length === 0) this.render();
    }, 200);
  }

  private async togglePin(id: string, card: HTMLElement): Promise<void> {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) return;

    const newPinned = !clip.pinned;
    await chrome.runtime.sendMessage({
      type: MSG.UPDATE_SONTO_ITEM,
      id,
      updates: { pinned: newPinned },
    });

    clip.pinned = newPinned;
    card.classList.toggle('clip-pinned', newPinned);

    const pinBtn = card.querySelector<HTMLButtonElement>('.clip-btn-pin');
    if (pinBtn) {
      pinBtn.classList.toggle('pinned', newPinned);
      pinBtn.title = newPinned ? 'Unpin' : 'Pin';
      pinBtn.setAttribute('aria-label', `${newPinned ? 'Unpin' : 'Pin'} this clip`);
      const icon = pinBtn.querySelector('svg');
      if (icon) {
        icon.remove();
        const newIcon = document.createElement('i');
        newIcon.setAttribute('data-lucide', 'star');
        pinBtn.prepend(newIcon);
        createIcons({ icons, attrs: { strokeWidth: 1.5 } });
      }
    }

    if (newPinned) {
      moveCardToTop(card, this.listEl);
    } else {
      // Re-render to move unpinned card to correct chronological position
      this.render();
    }
  }

  private async insertText(text: string): Promise<void> {
    const result = await insertTextToActiveTab(text);
    if (result.error) {
      showToast(result.error, true);
    }
  }

  private async toggleZenify(id: string, card: HTMLElement): Promise<void> {
    await toggleZenify(id, card, this.clips);
  }

  private showTagEditor(clip: SontoItem): void {
    showTagEditor({
      currentTags: clip.tags,
      allTags: this.allTags,
      onSave: async (tags) => {
        await chrome.runtime.sendMessage({
          type: MSG.UPDATE_SONTO_ITEM,
          id: clip.id,
          updates: { tags },
        });
        clip.tags = tags;
        this.render();
      },
    });
  }
}
