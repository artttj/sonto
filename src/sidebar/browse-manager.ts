import { MSG } from '../shared/messages';
import type { Snippet } from '../shared/types';
import { escapeHtml } from './zen/zen-content';

type FilterMode = 'all' | 'manual' | 'history';

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

export class BrowseManager {
  private snippets: Snippet[] = [];
  private filter: FilterMode = 'all';

  constructor(
    private readonly listEl: HTMLElement,
    private readonly onCountsChange?: (all: number, manual: number, history: number) => void,
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

  render(): void {
    const manual = this.snippets.filter((s) => (s.source ?? 'manual') === 'manual').length;
    const history = this.snippets.filter((s) => s.source === 'history').length;
    this.onCountsChange?.(this.snippets.length, manual, history);

    const filtered = this.getFiltered();

    if (filtered.length === 0) {
      const emptyMsg = this.snippets.length === 0
        ? 'Highlight text on any page and press <strong>Alt+Shift+C</strong> or right-click to save it here.'
        : this.filter === 'manual'
          ? 'No manually saved snippets yet.'
          : 'No history items synced yet.';
      const emptyTitle = this.snippets.length === 0
        ? 'No saved snippets'
        : this.filter === 'manual'
          ? 'No saved snippets'
          : 'No history';
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
      const card = document.createElement('div');
      card.className = 'snippet-card';
      const source = snippet.source ?? 'manual';
      const badgeLabel = source === 'history' ? 'History' : 'Saved';
      card.innerHTML = `
        <div class="snippet-text">${escapeHtml(snippet.text)}</div>
        <div class="snippet-meta">
          <div class="snippet-source">
            <span class="source-badge ${source}">${badgeLabel}</span>
            <a href="${escapeHtml(snippet.url)}" target="_blank" rel="noopener" title="${escapeHtml(snippet.title || snippet.url)}">
              ${escapeHtml(truncateUrl(snippet.url))}
            </a>
            &middot; ${formatDate(snippet.timestamp)}
          </div>
          <div class="snippet-actions">
            <button class="btn-delete" type="button" title="Delete snippet" data-id="${snippet.id}">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M5 5l10 10M15 5L5 15"/>
              </svg>
            </button>
          </div>
        </div>
      `;
      card.querySelector<HTMLButtonElement>('.btn-delete')!.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLButtonElement).dataset.id!;
        void this.deleteSnippet(id);
      });
      this.listEl.appendChild(card);
    }
  }

  async deleteSnippet(id: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id });
    this.snippets = this.snippets.filter((s) => s.id !== id);
    this.render();
  }

  async clearAll(): Promise<void> {
    const filtered = this.getFiltered();
    const label = this.filter === 'all' ? 'all' : this.filter === 'manual' ? 'all saved' : 'all history';
    if (!confirm(`Delete ${label} ${filtered.length} snippets?`)) return;
    await Promise.all(filtered.map((s) => chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id: s.id })));
    const ids = new Set(filtered.map((s) => s.id));
    this.snippets = this.snippets.filter((s) => !ids.has(s.id));
    this.render();
  }

  private getFiltered(): Snippet[] {
    if (this.filter === 'all') return this.snippets;
    return this.snippets.filter((s) => (s.source ?? 'manual') === this.filter);
  }
}
