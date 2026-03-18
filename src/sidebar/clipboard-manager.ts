// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import type { ClipItem, ClipContentType } from '../shared/types';
import { escapeHtml } from '../shared/utils';

export type ClipFilter = 'all' | 'text' | 'link' | 'code' | 'email' | 'pinned';

function qs<T extends Element>(selector: string, parent: ParentNode = document): T {
  return parent.querySelector<T>(selector)!;
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

function exportAsMarkdown(clips: ClipItem[]): string {
  return clips
    .map((c) => {
      const lines = [`## ${formatDate(c.timestamp)}`];
      if (c.title) lines.push(`**${c.title}**`);
      lines.push('');
      if (c.contentType === 'code') {
        lines.push('```');
        lines.push(c.text);
        lines.push('```');
      } else {
        lines.push(c.text);
      }
      if (c.url) lines.push('', `Source: ${c.url}`);
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}

function exportAsJson(clips: ClipItem[]): string {
  return JSON.stringify(clips, null, 2);
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export class ClipboardManager {
  private clips: ClipItem[] = [];
  private filtered: ClipItem[] = [];
  private filter: ClipFilter = 'all';
  private listEl: HTMLElement;
  private countEl: HTMLElement;

  constructor(
    listEl: HTMLElement,
    countEl: HTMLElement,
  ) {
    this.listEl = listEl;
    this.countEl = countEl;
  }

  async load(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_CLIPS });
    this.clips = response?.ok ? (response.clips as ClipItem[]) : [];
    this.applyFilter();
    this.render();
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      this.applyFilter();
      this.render();
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: MSG.SEARCH_CLIPS, query });
    const results: ClipItem[] = response?.ok ? response.clips : [];
    this.filtered = this.applyFilterToList(results);
    this.updateCount();
    this.render();
  }

  setFilter(filter: ClipFilter): void {
    this.filter = filter;
    this.applyFilter();
    this.render();
  }

  private applyFilter(): void {
    this.filtered = this.applyFilterToList(this.clips);
    this.updateCount();
  }

  private applyFilterToList(list: ClipItem[]): ClipItem[] {
    if (this.filter === 'all') return list;
    if (this.filter === 'pinned') return list.filter((c) => c.pinned);
    return list.filter((c) => c.contentType === this.filter);
  }

  private updateCount(): void {
    const pinned = this.clips.filter((c) => c.pinned).length;
    this.countEl.textContent = String(this.clips.length);

    const allTab = document.querySelector<HTMLElement>('[data-filter="all"] .filter-count');
    const pinnedTab = document.querySelector<HTMLElement>('[data-filter="pinned"] .filter-count');
    if (allTab) allTab.textContent = String(this.clips.length);
    if (pinnedTab) pinnedTab.textContent = String(pinned);

    const typeFilters: ClipFilter[] = ['text', 'link', 'code', 'email'];
    for (const f of typeFilters) {
      const tab = document.querySelector<HTMLElement>(`[data-filter="${f}"] .filter-count`);
      if (tab) tab.textContent = String(this.clips.filter((c) => c.contentType === f).length);
    }
  }

  render(): void {
    this.listEl.innerHTML = '';

    if (this.filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'clips-empty';
      if (this.clips.length === 0) {
        empty.innerHTML = `
          <div class="empty-icon">⌘C</div>
          <p>Your clipboard history is empty.</p>
          <p class="empty-hint">Copy any text on a web page and it will appear here.</p>
        `;
      } else {
        empty.innerHTML = `<p>No clips match this filter.</p>`;
      }
      this.listEl.appendChild(empty);
      return;
    }

    let currentDay = '';

    for (const clip of this.filtered) {
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
    card.className = `clip-card clip-type-${clip.contentType}${clip.pinned ? ' clip-pinned' : ''}`;
    card.dataset.id = clip.id;

    const preview = clip.contentType === 'code'
      ? `<pre class="clip-code-preview"><code>${escapeHtml(clip.text.slice(0, 300))}</code></pre>`
      : `<p class="clip-text-preview">${escapeHtml(clip.text.slice(0, 280))}${clip.text.length > 280 ? '…' : ''}</p>`;

    const sourceInfo = clip.url
      ? `<a class="clip-source-url" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(clip.url))}</a>`
      : '';

    const tags = clip.tags?.length
      ? `<div class="clip-tags">${clip.tags.map((t) => `<span class="clip-tag">${escapeHtml(t)}</span>`).join('')}</div>`
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
        ${tags}
      </div>
      <div class="clip-actions">
        <button class="clip-btn clip-btn-copy" title="Copy to clipboard">Copy</button>
        <button class="clip-btn clip-btn-pin${clip.pinned ? ' active' : ''}" title="${clip.pinned ? 'Unpin' : 'Pin'}">
          ${clip.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button class="clip-btn clip-btn-delete" title="Delete">Delete</button>
      </div>
    `;

    qs<HTMLButtonElement>('.clip-btn-copy', card).addEventListener('click', () => {
      void navigator.clipboard.writeText(clip.text).then(() => {
        const btn = qs<HTMLButtonElement>('.clip-btn-copy', card);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });

    qs<HTMLButtonElement>('.clip-btn-pin', card).addEventListener('click', () => {
      void this.togglePin(clip, card);
    });

    qs<HTMLButtonElement>('.clip-btn-delete', card).addEventListener('click', () => {
      void this.deleteClip(clip.id, card);
    });

    return card;
  }

  private async togglePin(clip: ClipItem, card: HTMLElement): Promise<void> {
    const updated = { ...clip, pinned: !clip.pinned };
    await chrome.runtime.sendMessage({ type: MSG.UPDATE_CLIP, clip: updated });

    const idx = this.clips.findIndex((c) => c.id === clip.id);
    if (idx !== -1) this.clips[idx] = updated;

    card.classList.toggle('clip-pinned', !!updated.pinned);
    const btn = qs<HTMLButtonElement>('.clip-btn-pin', card);
    btn.textContent = updated.pinned ? 'Unpin' : 'Pin';
    btn.classList.toggle('active', !!updated.pinned);

    this.updateCount();
  }

  private async deleteClip(id: string, card: HTMLElement): Promise<void> {
    card.classList.add('clip-removing');
    await chrome.runtime.sendMessage({ type: MSG.DELETE_CLIP, id });
    this.clips = this.clips.filter((c) => c.id !== id);
    this.applyFilter();

    setTimeout(() => {
      card.remove();

      const daySeps = this.listEl.querySelectorAll('.day-separator');
      daySeps.forEach((sep) => {
        const next = sep.nextElementSibling;
        if (!next || next.classList.contains('day-separator')) {
          sep.remove();
        }
      });

      if (this.filtered.length === 0) this.render();
    }, 200);
  }

  async clearAll(): Promise<void> {
    const label = this.filter === 'all'
      ? `all ${this.clips.length} clips`
      : `${this.filtered.length} ${this.filter} clips`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    if (this.filter === 'all') {
      await chrome.runtime.sendMessage({ type: MSG.CLEAR_CLIPS });
      this.clips = [];
    } else {
      for (const clip of [...this.filtered]) {
        await chrome.runtime.sendMessage({ type: MSG.DELETE_CLIP, id: clip.id });
        this.clips = this.clips.filter((c) => c.id !== clip.id);
      }
    }

    this.applyFilter();
    this.render();
  }

  exportMarkdown(): void {
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(exportAsMarkdown(this.filtered), `clipboard-${date}.md`, 'text/markdown');
  }

  exportJson(): void {
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(exportAsJson(this.filtered), `clipboard-${date}.json`, 'application/json');
  }
}
