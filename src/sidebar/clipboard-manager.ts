// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from 'lucide';
import { MSG } from '../shared/messages';
import type { ClipItem, ClipContentType } from '../shared/types';
import { escapeHtml } from '../shared/utils';
import { highlightCode } from './syntax-highlight';

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
      <button class="fulltext-copy">Copy</button>
    </div>
  `;

  fullTextModal.querySelector('.fulltext-close')?.addEventListener('click', hideFullText);
  document.body.appendChild(fullTextOverlay);
  document.body.appendChild(fullTextModal);
}

function showFullText(text: string, contentType: ClipContentType): void {
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

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function contentTypeLabel(type: ClipContentType): string {
  switch (type) {
    case 'link': return 'Link';
    case 'code': return 'Code';
    case 'email': return 'Email';
    case 'image': return 'Image';
    case 'prompt': return 'Prompt';
    default: return 'Text';
  }
}

function contentTypeIcon(type: ClipContentType): string {
  switch (type) {
    case 'link': return '↗';
    case 'code': return '{}';
    case 'email': return '@';
    case 'image': return '▨';
    case 'prompt': return '✦';
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

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export class ClipboardManager {
  private clips: ClipItem[] = [];
  private listEl: HTMLElement;
  private isLoading = false;
  private selectedIndex = -1;
  private activeDomain = '';

  constructor(listEl: HTMLElement) {
    this.listEl = listEl;
  }

  async load(domain?: string): Promise<void> {
    this.activeDomain = domain ?? '';
    this.setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_CLIPS });
      this.clips = response?.ok ? (response.clips as ClipItem[]) : [];
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
    this.setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.SEARCH_CLIPS, query });
      this.clips = response?.ok ? response.clips : [];
    } catch (err) {
      console.error('[Sonto] Search failed:', err);
    } finally {
      this.setLoading(false);
      this.render();
    }
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
        void navigator.clipboard.writeText(clip.text).then(() => {
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

  private matchesDomain(clip: ClipItem): boolean {
    if (!clip.url || !this.activeDomain) return false;
    const clipDomain = extractDomain(clip.url);
    return clipDomain === this.activeDomain || clipDomain.endsWith('.' + this.activeDomain);
  }

  private renderByDay(clips: ClipItem[]): void {
    let currentDay = '';
    for (const clip of clips) {
      const day = new Date(clip.timestamp).toLocaleDateString(undefined, {
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

  private buildCard(clip: ClipItem): HTMLElement {
    const card = document.createElement('div');
    card.className = `clip-card clip-type-${clip.contentType}${clip.pinned ? ' clip-pinned' : ''}`;
    card.dataset.id = clip.id;

    const preview = clip.contentType === 'code'
      ? `<pre class="clip-code-preview"><code>${highlightCode(clip.text.slice(0, CODE_PREVIEW_CHARS))}</code></pre>`
      : `<p class="clip-text-preview">${escapeHtml(clip.text.slice(0, TEXT_PREVIEW_CHARS))}${clip.text.length > TEXT_PREVIEW_CHARS ? '…' : ''}</p>`;

    const sourceInfo = clip.url
      ? `<a class="clip-source-url" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(clip.url))}</a>`
      : '';

    const pinLabel = clip.pinned ? 'Unpin' : 'Pin';
    const pinIcon = clip.pinned ? 'star' : 'star';

    const needsExpand = clip.text.length > TEXT_PREVIEW_CHARS;

    card.innerHTML = `
      <div class="clip-header">
        <span class="clip-type-badge clip-badge-${clip.contentType}">
          <span class="clip-type-icon">${contentTypeIcon(clip.contentType)}</span>
          ${contentTypeLabel(clip.contentType)}
        </span>
        <span class="clip-time">${formatDate(clip.timestamp)}</span>
      </div>
      <div class="clip-body${needsExpand ? ' clip-body-expandable' : ''}" ${needsExpand ? 'title="Click to view full text"' : ''}>
        ${preview}
        ${sourceInfo ? `<div class="clip-meta">${sourceInfo}</div>` : ''}
      </div>
      <div class="clip-card-actions">
        <button class="clip-btn clip-btn-pin${clip.pinned ? ' pinned' : ''}" title="${pinLabel}" aria-label="${pinLabel} this clip"><i data-lucide="${pinIcon}"></i></button>
        <button class="clip-btn clip-btn-copy" title="Copy" aria-label="Copy this clip to clipboard"><i data-lucide="clipboard"></i><span class="clip-btn-label">Copy</span></button>
        ${needsExpand ? `<button class="clip-btn clip-btn-expand" title="View full" aria-label="View full text"><i data-lucide="maximize-2"></i></button>` : ''}
        <button class="clip-btn clip-btn-delete" title="Delete" aria-label="Delete this clip"><i data-lucide="trash-2"></i></button>
      </div>
    `;

    if (needsExpand) {
      const bodyEl = card.querySelector('.clip-body');
      const expandBtn = card.querySelector('.clip-btn-expand');
      const clickHandler = () => showFullText(clip.text, clip.contentType);
      bodyEl?.addEventListener('click', clickHandler);
      expandBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        clickHandler();
      });
    }

    const copyClip = () => {
      void navigator.clipboard.writeText(clip.text).then(() => {
        const btn = qs<HTMLButtonElement>('.clip-btn-copy', card);
        const label = btn.querySelector('.clip-btn-label');
        if (label) {
          label.textContent = 'Copied!';
          setTimeout(() => { label.textContent = 'Copy'; }, COPY_FEEDBACK_MS);
        }
      }).catch(() => {});
    };

    qs<HTMLButtonElement>('.clip-btn-copy', card).addEventListener('click', copyClip);
    card.addEventListener('dblclick', copyClip);

    qs<HTMLButtonElement>('.clip-btn-pin', card).addEventListener('click', (e) => {
      e.stopPropagation();
      void this.togglePin(clip.id, card);
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
    await chrome.runtime.sendMessage({ type: MSG.DELETE_CLIP, id });
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
      type: MSG.UPDATE_CLIP,
      clip: { ...clip, pinned: newPinned },
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

    this.render();
  }
}
