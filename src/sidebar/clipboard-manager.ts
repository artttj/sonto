// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import type { ClipItem, ClipContentType } from '../shared/types';
import { escapeHtml } from '../shared/utils';
import { highlightCode } from './syntax-highlight';
import { getApplicableTransforms } from './clip-transforms';

const TEXT_PREVIEW_CHARS = 280;
const CODE_PREVIEW_CHARS = 300;

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
    default: return 'Text';
  }
}

function contentTypeIcon(type: ClipContentType): string {
  switch (type) {
    case 'link': return '↗';
    case 'code': return '{}';
    case 'email': return '@';
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
  private openTransformMenu: HTMLElement | null = null;

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
          if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
        });
      }
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIndex >= 0) {
      const card = cards[this.selectedIndex];
      const id = card.dataset.id;
      if (id) void this.deleteClip(id, card);
      return true;
    }
    return false;
  }

  render(): void {
    this.listEl.innerHTML = '';
    this.selectedIndex = -1;
    this.closeTransformMenu();

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
    const unpinned = this.clips.filter((c) => !c.pinned);

    if (pinned.length > 0) {
      this.addSeparator('Pinned', 'pinned-separator');
      for (const clip of pinned) {
        this.listEl.appendChild(this.buildCard(clip));
      }
    }

    if (this.activeDomain) {
      const siteClips = unpinned.filter((c) => this.matchesDomain(c));
      const otherClips = unpinned.filter((c) => !this.matchesDomain(c));

      if (siteClips.length > 0) {
        this.addSeparator('From this site', 'site-separator');
        for (const clip of siteClips) {
          this.listEl.appendChild(this.buildCard(clip));
        }
      }
      this.renderByDay(otherClips);
    } else {
      this.renderByDay(unpinned);
    }
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
    card.className = `clip-card clip-type-${clip.contentType}`;
    card.dataset.id = clip.id;

    const preview = clip.contentType === 'code'
      ? `<pre class="clip-code-preview"><code>${highlightCode(clip.text.slice(0, CODE_PREVIEW_CHARS))}</code></pre>`
      : `<p class="clip-text-preview">${escapeHtml(clip.text.slice(0, TEXT_PREVIEW_CHARS))}${clip.text.length > TEXT_PREVIEW_CHARS ? '…' : ''}</p>`;

    const sourceInfo = clip.url
      ? `<a class="clip-source-url" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(clip.url))}</a>`
      : '';

    const transforms = getApplicableTransforms(clip.text);
    const transformBtn = transforms.length > 0
      ? '<button class="clip-btn clip-btn-transform" title="Transform" aria-label="Transform this clip">Transform</button>'
      : '';

    card.innerHTML = `
      <div class="clip-header">
        <span class="clip-type-badge clip-badge-${clip.contentType}">
          <span class="clip-type-icon">${contentTypeIcon(clip.contentType)}</span>
          ${contentTypeLabel(clip.contentType)}
        </span>
        <span class="clip-time">${formatDate(clip.timestamp)}</span>
      </div>
      <div class="clip-body">
        ${preview}
        ${sourceInfo ? `<div class="clip-meta">${sourceInfo}</div>` : ''}
      </div>
      <div class="clip-card-actions">
        <button class="clip-btn clip-btn-copy" title="Copy to clipboard" aria-label="Copy this clip to clipboard">Copy</button>
        ${transformBtn}
        <button class="clip-btn clip-btn-delete" title="Delete this clip" aria-label="Delete this clip">Delete</button>
      </div>
    `;

    const copyClip = () => {
      void navigator.clipboard.writeText(clip.text).then(() => {
        const btn = qs<HTMLButtonElement>('.clip-btn-copy', card);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    };

    qs<HTMLButtonElement>('.clip-btn-copy', card).addEventListener('click', copyClip);
    card.addEventListener('dblclick', copyClip);

    qs<HTMLButtonElement>('.clip-btn-delete', card).addEventListener('click', () => {
      void this.deleteClip(clip.id, card);
    });

    if (transforms.length > 0) {
      qs<HTMLButtonElement>('.clip-btn-transform', card).addEventListener('click', (e) => {
        e.stopPropagation();
        this.showTransformMenu(clip, card);
      });
    }

    return card;
  }

  private showTransformMenu(clip: ClipItem, card: HTMLElement): void {
    this.closeTransformMenu();

    const transforms = getApplicableTransforms(clip.text);
    const menu = document.createElement('div');
    menu.className = 'clip-transform-menu';

    for (const t of transforms) {
      const btn = document.createElement('button');
      btn.className = 'clip-transform-item';
      btn.textContent = t.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const result = t.transform(clip.text);
        void navigator.clipboard.writeText(result).then(() => {
          const copyBtn = card.querySelector<HTMLButtonElement>('.clip-btn-copy');
          if (copyBtn) { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); }
        });
        this.closeTransformMenu();
      });
      menu.appendChild(btn);
    }

    card.appendChild(menu);
    this.openTransformMenu = menu;

    const closeOnClick = (ev: MouseEvent) => {
      if (menu.contains(ev.target as Node)) return;
      this.closeTransformMenu();
    };
    requestAnimationFrame(() => {
      document.addEventListener('click', closeOnClick, { once: true });
    });
  }

  private closeTransformMenu(): void {
    this.openTransformMenu?.remove();
    this.openTransformMenu = null;
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
}
