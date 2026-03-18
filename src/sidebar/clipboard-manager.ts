// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import type { ClipItem, ClipContentType, Flashcard } from '../shared/types';
import { escapeHtml } from '../shared/utils';

const TOAST_DURATION_MS = 2000;
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

export class ClipboardManager {
  private clips: ClipItem[] = [];
  private flashcardClipIds: Set<string> = new Set();
  private listEl: HTMLElement;
  private isLoading = false;

  constructor(listEl: HTMLElement) {
    this.listEl = listEl;
  }

  async load(): Promise<void> {
    this.setLoading(true);
    try {
      const [clipsResponse, flashcardsResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: MSG.GET_ALL_CLIPS }),
        chrome.runtime.sendMessage({ type: MSG.GET_FLASHCARDS }),
      ]);
      this.clips = clipsResponse?.ok ? (clipsResponse.clips as ClipItem[]) : [];
      const flashcards = flashcardsResponse?.ok ? (flashcardsResponse.flashcards as Flashcard[]) : [];
      this.flashcardClipIds = new Set(flashcards.map(f => f.sourceClipId).filter((id): id is string => !!id));
    } catch (err) {
      console.error('[Sonto] Failed to load clipboard:', err);
    } finally {
      this.setLoading(false);
      this.render();
    }
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      await this.load();
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

  render(): void {
    this.listEl.innerHTML = '';

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

    let currentDay = '';

    for (const clip of this.clips) {
      const day = new Date(clip.timestamp).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

      if (day !== currentDay) {
        currentDay = day;
        const separator = document.createElement('div');
        separator.className = 'day-separator';
        separator.textContent = day;
        this.listEl.appendChild(separator);
      }

      this.listEl.appendChild(this.buildCard(clip));
    }
  }

  private buildCard(clip: ClipItem): HTMLElement {
    const card = document.createElement('div');
    card.className = `clip-card clip-type-${clip.contentType}`;
    card.dataset.id = clip.id;

    const preview = clip.contentType === 'code'
      ? `<pre class="clip-code-preview"><code>${escapeHtml(clip.text.slice(0, CODE_PREVIEW_CHARS))}</code></pre>`
      : `<p class="clip-text-preview">${escapeHtml(clip.text.slice(0, TEXT_PREVIEW_CHARS))}${clip.text.length > TEXT_PREVIEW_CHARS ? '…' : ''}</p>`;

    const sourceInfo = clip.url
      ? `<a class="clip-source-url" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(clip.url))}</a>`
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
        <button class="clip-btn clip-btn-flashcard ${this.flashcardClipIds.has(clip.id) ? 'active' : ''}" title="Create flashcard" aria-label="Create flashcard from this clip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        </button>
        <button class="clip-btn clip-btn-delete" title="Delete this clip" aria-label="Delete this clip">Delete</button>
      </div>
    `;

    qs<HTMLButtonElement>('.clip-btn-copy', card).addEventListener('click', () => {
      void navigator.clipboard.writeText(clip.text).then(() => {
        const btn = qs<HTMLButtonElement>('.clip-btn-copy', card);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });

    qs<HTMLButtonElement>('.clip-btn-delete', card).addEventListener('click', () => {
      void this.deleteClip(clip.id, card);
    });

    qs<HTMLButtonElement>('.clip-btn-flashcard', card).addEventListener('click', () => {
      void this.createFlashcard(clip);
    });

    return card;
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

  private async createFlashcard(clip: ClipItem): Promise<void> {
    const flashcard = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      front: clip.text.slice(0, 200),
      back: '',
      sourceClipId: clip.id,
      createdAt: Date.now(),
      nextReviewAt: Date.now(),
      interval: 1,
      easeFactor: 2.5,
      reviewCount: 0,
    };

    try {
      await chrome.runtime.sendMessage({
        type: MSG.SAVE_FLASHCARD,
        flashcard,
      });
      this.flashcardClipIds.add(clip.id);
      this.showFlashcardCreated();
    } catch {
      // ignore
    }
  }

  private showFlashcardCreated(): void {
    const toast = document.createElement('div');
    toast.className = 'flashcard-toast';
    toast.textContent = 'Flashcard created!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_DURATION_MS);
  }
}
