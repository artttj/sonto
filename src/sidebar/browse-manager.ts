// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import type { QueryResult, Snippet } from '../shared/types';
import { escapeHtml } from './zen/zen-content';

type FilterMode = 'all' | 'manual' | 'history' | 'pinned';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname.slice(0, 30) : '');
  } catch {
    return url.slice(0, 40);
  }
}

function exportAsMarkdown(snippets: Snippet[]): void {
  const lines: string[] = ['# Sonto Exports\n'];
  for (const s of snippets) {
    lines.push(`## ${s.title || truncateUrl(s.url)}`);
    lines.push(`**Source:** [${truncateUrl(s.url)}](${s.url})`);
    lines.push(`**Saved:** ${formatDate(s.timestamp)}`);
    if (s.tags?.length) lines.push(`**Tags:** ${s.tags.join(', ')}`);
    lines.push('');
    lines.push(s.text);
    if (s.context) {
      lines.push('');
      lines.push(`> Context: ${s.context}`);
    }
    lines.push('\n---\n');
  }
  downloadFile('sonto-exports.md', lines.join('\n'), 'text/markdown');
}

function exportAsJson(snippets: Snippet[]): void {
  const data = snippets.map(({ id, text, url, title, timestamp, source, context, tags, pinned }) => ({
    id, text, url, title, timestamp, source, context, tags, pinned,
  }));
  downloadFile('sonto-exports.json', JSON.stringify(data, null, 2), 'application/json');
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export class BrowseManager {
  private snippets: Snippet[] = [];
  private filter: FilterMode = 'all';
  private expandedRelated: string | null = null;

  constructor(
    private readonly listEl: HTMLElement,
    private readonly onCountsChange?: (all: number, manual: number, history: number, pinned: number) => void,
    private readonly onKeepThreadGoing?: (snippet: Snippet) => void,
  ) {}

  async load(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_SNIPPETS }) as {
      ok: boolean;
      snippets?: Snippet[];
    };
    if (response?.ok && response.snippets) {
      this.snippets = response.snippets;
    }
    this.render();
  }

  setFilter(filter: FilterMode): void {
    this.filter = filter;
    this.render();
  }

  getSnippets(): Snippet[] {
    return this.snippets;
  }

  exportMarkdown(): void {
    exportAsMarkdown(this.getFiltered());
  }

  exportJson(): void {
    exportAsJson(this.getFiltered());
  }

  render(): void {
    let manual = 0, history = 0, pinned = 0;
    for (const s of this.snippets) {
      if ((s.source ?? 'manual') === 'manual') manual++;
      if (s.source === 'history') history++;
      if (s.pinned) pinned++;
    }
    this.onCountsChange?.(this.snippets.length, manual, history, pinned);

    const filtered = this.getFiltered();

    if (filtered.length === 0) {
      const emptyMsg = this.snippets.length === 0
        ? 'Highlight text on any page and press <strong>Alt+Shift+C</strong> or right-click to save it here.'
        : this.filter === 'manual'
          ? 'No manually saved snippets yet.'
          : this.filter === 'history'
            ? 'No history items synced yet.'
            : 'No pinned items yet. Pin zen feed bubbles to collect them here.';
      const emptyTitle = this.filter === 'pinned' ? 'No pinned items' : 'No saved snippets';
      this.listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="8" y="10" width="32" height="28" rx="3"/>
              <path d="M16 18h16M16 24h12M16 30h8"/>
            </svg>
          </div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-desc">${emptyMsg}</div>
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = '';
    for (const snippet of filtered) {
      const card = this.buildCard(snippet);
      this.listEl.appendChild(card);
    }
  }

  private buildCard(snippet: Snippet): HTMLElement {
    const card = document.createElement('div');
    card.className = 'snippet-card';
    card.dataset.id = snippet.id;

    const source = snippet.source ?? 'manual';
    const badgeLabel = source === 'history' ? 'History' : source === 'pinned' ? 'Pinned' : 'Saved';
    const isPinned = !!snippet.pinned;

    const tagsHtml = snippet.tags?.length
      ? `<div class="snippet-tags">${snippet.tags.filter((t) => t !== 'pinned').map((t) => `<span class="snippet-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    const contextHtml = snippet.context
      ? `<div class="snippet-context">${escapeHtml(snippet.context.slice(0, 200))}</div>`
      : '';

    const textHtml = source === 'history'
      ? `<a class="snippet-text snippet-text--link" href="${escapeHtml(snippet.url)}" target="_blank" rel="noopener">${escapeHtml(snippet.text)}</a>`
      : `<div class="snippet-text">${escapeHtml(snippet.text)}</div>`;

    card.innerHTML = `
      ${textHtml}
      ${contextHtml}
      ${tagsHtml}
      <div class="snippet-meta">
        <div class="snippet-source">
          <span class="source-badge ${source}">${badgeLabel}</span>
          <a href="${escapeHtml(snippet.url)}" target="_blank" rel="noopener" title="${escapeHtml(snippet.title || snippet.url)}">
            ${escapeHtml(truncateUrl(snippet.url))}
          </a>
          &middot; ${formatDate(snippet.timestamp)}
        </div>
        <div class="snippet-actions">
          <button class="btn-pin ${isPinned ? 'pinned' : ''}" type="button" title="${isPinned ? 'Unpin' : 'Pin'}" data-id="${snippet.id}">
            <svg viewBox="0 0 16 16" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6">
              <path d="M8 1l2 5h5L11 9l1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>
            </svg>
          </button>
          <button class="btn-related" type="button" title="Related snippets" data-id="${snippet.id}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="8" cy="8" r="2"/>
              <circle cx="2.5" cy="4" r="1.5"/>
              <circle cx="13.5" cy="4" r="1.5"/>
              <circle cx="8" cy="14" r="1.5"/>
              <path d="M4 4.5L6.5 7M11.5 4.5L9.5 7M8 10v2.5"/>
            </svg>
          </button>
          <button class="btn-thread" type="button" title="Keep this thread going" data-id="${snippet.id}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 8h7"/>
              <path d="M7 4l4 4-4 4"/>
            </svg>
          </button>
          <button class="btn-delete" type="button" title="Delete snippet" data-id="${snippet.id}">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M5 5l10 10M15 5L5 15"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector<HTMLButtonElement>('.btn-pin')!.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.togglePin(snippet);
    });

    card.querySelector<HTMLButtonElement>('.btn-related')!.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.toggleRelated(snippet.id, card);
    });

    card.querySelector<HTMLButtonElement>('.btn-thread')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onKeepThreadGoing?.(snippet);
    });

    card.querySelector<HTMLButtonElement>('.btn-delete')!.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id!;
      void this.deleteSnippet(id);
    });

    if (this.expandedRelated === snippet.id) {
      void this.renderRelated(snippet.id, card);
    }

    return card;
  }

  private async togglePin(snippet: Snippet): Promise<void> {
    const updated: Snippet = {
      ...snippet,
      pinned: !snippet.pinned,
    };
    await chrome.runtime.sendMessage({ type: MSG.UPDATE_SNIPPET, snippet: updated });
    const idx = this.snippets.findIndex((s) => s.id === snippet.id);
    if (idx !== -1) this.snippets[idx] = updated;
    this.render();
  }

  private async toggleRelated(snippetId: string, card: HTMLElement): Promise<void> {
    if (this.expandedRelated === snippetId) {
      this.expandedRelated = null;
      card.querySelector('.snippet-related')?.remove();
      return;
    }
    this.expandedRelated = snippetId;
    card.querySelector('.snippet-related')?.remove();
    await this.renderRelated(snippetId, card);
  }

  private async renderRelated(snippetId: string, card: HTMLElement): Promise<void> {
    const placeholder = document.createElement('div');
    placeholder.className = 'snippet-related';
    placeholder.innerHTML = '<div class="related-loading">Finding related...</div>';
    card.appendChild(placeholder);

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GET_RELATED_SNIPPETS,
        snippetId,
        topK: 3,
      }) as { ok: boolean; results?: QueryResult[] };

      placeholder.innerHTML = '';

      if (!response?.ok || !response.results?.length) {
        placeholder.innerHTML = '<div class="related-empty">No related snippets found.</div>';
        return;
      }

      const header = document.createElement('div');
      header.className = 'related-header';
      header.textContent = 'Related';
      placeholder.appendChild(header);

      for (const r of response.results) {
        const item = document.createElement('a');
        item.className = 'related-item';
        item.href = r.snippet.url;
        item.addEventListener('click', (e) => {
          e.preventDefault();
          void chrome.tabs.create({ url: r.snippet.url });
        });
        item.innerHTML = `
          <span class="related-text">${escapeHtml(r.snippet.text.slice(0, 120))}</span>
          <span class="related-source">${escapeHtml(truncateUrl(r.snippet.url))}</span>
        `;
        placeholder.appendChild(item);
      }
    } catch {
      placeholder.innerHTML = '<div class="related-empty">Could not load related.</div>';
    }
  }

  async deleteSnippet(id: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id });
    this.snippets = this.snippets.filter((s) => s.id !== id);
    this.render();
  }

  async clearAll(): Promise<void> {
    const filtered = this.getFiltered();
    const label = this.filter === 'all' ? 'all' : this.filter === 'manual' ? 'all saved' : this.filter === 'history' ? 'all history' : 'all pinned';
    if (!confirm(`Delete ${label} ${filtered.length} snippets?`)) return;
    await Promise.all(filtered.map((s) => chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id: s.id })));
    const ids = new Set(filtered.map((s) => s.id));
    this.snippets = this.snippets.filter((s) => !ids.has(s.id));
    this.render();
  }

  private getFiltered(): Snippet[] {
    if (this.filter === 'all') return this.snippets;
    if (this.filter === 'pinned') return this.snippets.filter((s) => s.pinned);
    return this.snippets.filter((s) => (s.source ?? 'manual') === this.filter);
  }
}
