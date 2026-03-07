import { MSG } from '../shared/messages';
import { getSettings, getOpenAIKey, getGeminiKey } from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import { renderMarkdown } from '../shared/markdown';
import type { ChatMessage, QueryResult, Snippet, SnippetSource } from '../shared/types';

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

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

async function getActiveKey(): Promise<string> {
  const settings = await getSettings();
  const provider = settings.llmProvider;
  if (provider === 'gemini') return getGeminiKey();
  return getOpenAIKey();
}

function buildPrompt(query: string, results: QueryResult[]): ChatMessage[] {
  const snippetContext = results
    .map((r, i) => {
      const title = r.snippet.title || '';
      const url = r.snippet.url || '';
      const source = r.snippet.source === 'history' ? 'browsing history' : 'saved snippet';
      const header = title ? `${title}\nURL: ${url}` : url;
      return `[${i + 1}] (${source}) ${header}\n${r.snippet.text}`;
    })
    .join('\n\n---\n\n');

  return [
    {
      role: 'system',
      content:
        `You are a knowledgeable assistant with access to the user's saved snippets and browsing history. ` +
        `Use the provided context to answer questions. The context includes both manually saved text snippets and page titles from browsing history. ` +
        `For history entries, the page title and URL are the main signals — use them to infer what the user was reading about. ` +
        `When the context is thin (just page titles), summarize what topics the user browsed and connect them to the question. ` +
        `If you genuinely cannot answer from the context, say so. Be concise but helpful.`,
    },
    {
      role: 'user',
      content: `Context from my saved data:\n\n${snippetContext}\n\n---\n\nQuestion: ${query}`,
    },
  ];
}

type FilterMode = 'all' | 'manual' | 'history';
type ViewMode = 'zen' | 'browse' | 'chat';

const ZEN_INITIAL_BATCH = 3;
const ZEN_DRIP_BATCH = 1;
const ZEN_DRIP_MS = 15000;
const ZEN_MAX_CATCHUP = 6;
const SVG_BULB = [
  '<svg class="zen-bulb" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">',
  '<circle cx="8" cy="6" r="4"/>',
  '<path d="M6.5 10v1.5a1.5 1.5 0 0 0 3 0V10" stroke-linecap="round"/>',
  '<path d="M8 14v.5" stroke-linecap="round"/>',
  '</svg>',
].join('');

const SVG_USER = [
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">',
  '<circle cx="8" cy="5.5" r="2.5"/>',
  '<path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/>',
  '</svg>',
].join('');

const SVG_ASSISTANT = [
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">',
  '<circle cx="8" cy="8" r="6"/>',
  '<path d="M5.5 6.5h1M9.5 6.5h1M6 10c.6.6 1.3 1 2 1s1.4-.4 2-1"/>',
  '</svg>',
].join('');

const SVG_ERROR = [
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">',
  '<circle cx="8" cy="8" r="6"/>',
  '<path d="M8 5v4M8 11v.5"/>',
  '</svg>',
].join('');

class SontoSidebar {
  private snippets: Snippet[] = [];
  private filter: FilterMode = 'all';
  private chatHistory: { role: 'user' | 'assistant' | 'error'; text: string }[] = [];
  private isLoading = false;
  private abortController: AbortController | null = null;
  private mode: ViewMode = 'zen';
  private pastInsights: string[] = [];

  private zenDripTimer: ReturnType<typeof setInterval> | null = null;
  private zenUsedIds: Set<string> = new Set();

  private zenBtn = qs<HTMLButtonElement>('#btn-zen');
  private browseBtn = qs<HTMLButtonElement>('#btn-browse');
  private chatBtn = qs<HTMLButtonElement>('#btn-chat');
  private viewZen = qs<HTMLElement>('#view-zen');
  private viewBrowse = qs<HTMLElement>('#view-browse');
  private viewChat = qs<HTMLElement>('#view-chat');
  private zenFeed = qs<HTMLElement>('#zen-feed');
  private snippetList = qs<HTMLElement>('#snippet-list');
  private chatMessages = qs<HTMLElement>('#chat-messages');
  private chatInput = qs<HTMLTextAreaElement>('#chat-input');
  private sendBtn = qs<HTMLButtonElement>('#btn-send');

  async init(): Promise<void> {
    qs<HTMLButtonElement>('#btn-settings').addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: MSG.OPEN_SETTINGS });
    });

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.SNIPPET_ADDED) {
        void this.loadSnippets();
      }
    });

    this.zenBtn.addEventListener('click', () => this.setMode('zen'));
    this.browseBtn.addEventListener('click', () => this.setMode('browse'));
    this.chatBtn.addEventListener('click', () => this.setMode('chat'));
    qs<HTMLButtonElement>('#btn-clear-all').addEventListener('click', () => void this.clearAll());

    document.querySelectorAll<HTMLButtonElement>('.filter-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = (btn.dataset.filter ?? 'all') as FilterMode;
        document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderSnippets();
      });
    });

    this.sendBtn.addEventListener('click', () => void this.sendMessage());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });

    try {
      const stored = await chrome.storage.session.get('sonto_past_insights');
      this.pastInsights = (stored?.sonto_past_insights as string[]) ?? [];
    } catch {}

    await this.loadSnippets();
    void this.startZen();
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
      void this.startZen();
    } else {
      this.stopZen();
    }
  }

  private async loadSnippets(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_SNIPPETS }) as { ok: boolean; snippets?: Snippet[] };
    if (response?.ok && response.snippets) {
      this.snippets = response.snippets;
    }
    this.renderSnippets();
  }

  private getFilteredSnippets(): Snippet[] {
    if (this.filter === 'all') return this.snippets;
    return this.snippets.filter((s) => (s.source ?? 'manual') === this.filter);
  }

  private updateCounts(): void {
    const manual = this.snippets.filter((s) => (s.source ?? 'manual') === 'manual').length;
    const history = this.snippets.filter((s) => s.source === 'history').length;
    const countAll = document.getElementById('count-all');
    const countManual = document.getElementById('count-manual');
    const countHistory = document.getElementById('count-history');
    if (countAll) countAll.textContent = String(this.snippets.length);
    if (countManual) countManual.textContent = String(manual);
    if (countHistory) countHistory.textContent = String(history);
  }

  private renderSnippets(): void {
    this.updateCounts();
    const filtered = this.getFilteredSnippets();

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
      this.snippetList.innerHTML = `
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

    this.snippetList.innerHTML = '';
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
      this.snippetList.appendChild(card);
    }
  }

  private async deleteSnippet(id: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id });
    this.snippets = this.snippets.filter((s) => s.id !== id);
    this.renderSnippets();
  }

  private async clearAll(): Promise<void> {
    const filtered = this.getFilteredSnippets();
    const label = this.filter === 'all' ? 'all' : this.filter === 'manual' ? 'all saved' : 'all history';
    if (!confirm(`Delete ${label} ${filtered.length} snippets?`)) return;
    await Promise.all(filtered.map((s) => chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id: s.id })));
    const ids = new Set(filtered.map((s) => s.id));
    this.snippets = this.snippets.filter((s) => !ids.has(s.id));
    this.renderSnippets();
  }

  // ── Zen mode ──────────────────────────────────────────────────────────

  private async startZen(): Promise<void> {
    this.stopZen();

    try {
      const cached = await chrome.storage.session.get(['sonto_zen_feed', 'sonto_zen_last_drip']);
      const items = (cached?.sonto_zen_feed as string[]) ?? [];
      const lastDrip = (cached?.sonto_zen_last_drip as number) ?? 0;
      const unique = [...new Set(items)];
      if (unique.length > 0) {
        this.zenFeed.innerHTML = '';
        for (const text of unique) {
          this.appendZenBubbleElement(text);
        }

        const missedCycles = lastDrip > 0
          ? Math.floor((Date.now() - lastDrip) / ZEN_DRIP_MS)
          : 0;
        const catchup = Math.min(missedCycles * ZEN_DRIP_BATCH, ZEN_MAX_CATCHUP);
        if (catchup > 0) {
          const newInsights = await this.fetchInsightsBatch(catchup);
          for (const text of newInsights) {
            this.appendZenBubbleElement(text);
          }
          void this.cacheZenFeed();
        }

        this.zenDripTimer = setInterval(() => void this.dripZen(), ZEN_DRIP_MS);
        return;
      }
    } catch {}

    this.zenFeed.innerHTML = '';
    this.zenUsedIds.clear();

    this.showZenLoader();
    await this.loadBubblesSequentially(ZEN_INITIAL_BATCH);
    this.hideZenLoader();

    if (this.mode === 'zen') {
      this.zenDripTimer = setInterval(() => void this.dripZen(), ZEN_DRIP_MS);
    }
  }

  private async dripZen(): Promise<void> {
    const bubbles = this.zenFeed.querySelectorAll<HTMLElement>('.zen-bubble');
    const last = bubbles[bubbles.length - 1] ?? null;
    if (last) {
      last.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      last.style.opacity = '0';
      last.style.transform = 'translateY(8px)';
      setTimeout(() => last.remove(), 800);
    }

    await this.loadBubblesSequentially(ZEN_DRIP_BATCH);
    this.zenFeed.scrollTo({ top: 0, behavior: 'smooth' });
    void this.cacheZenFeed();
  }

  private cacheZenFeed(): void {
    const texts = Array.from(this.zenFeed.querySelectorAll('.zen-bubble span'))
      .map((el) => el.textContent ?? '');
    void chrome.storage.session.set({
      sonto_zen_feed: texts,
      sonto_zen_last_drip: Date.now(),
    }).catch(() => {});
  }

  private stopZen(): void {
    if (this.zenDripTimer) {
      clearInterval(this.zenDripTimer);
      this.zenDripTimer = null;
    }
  }

  private appendZenBubbleElement(text: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    bubble.innerHTML = `${SVG_BULB}<span>${escapeHtml(text)}</span>`;
    const first = this.zenFeed.firstChild;
    if (first) {
      this.zenFeed.insertBefore(bubble, first);
    } else {
      this.zenFeed.appendChild(bubble);
    }
    return bubble;
  }

  private showZenLoader(): void {
    let loader = this.zenFeed.querySelector('.zen-loading');
    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'zen-loading';
      loader.innerHTML = '<div class="spinner"></div>';
      this.zenFeed.prepend(loader);
    }
  }

  private hideZenLoader(): void {
    this.zenFeed.querySelector('.zen-loading')?.remove();
  }

  private pickSample(): { text: string; title: string; source: string }[] {
    let pool = this.snippets.filter((s) => !this.zenUsedIds.has(s.id));
    if (pool.length < 5) {
      this.zenUsedIds.clear();
      pool = this.snippets;
    }
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    picked.forEach((s) => this.zenUsedIds.add(s.id));
    return picked.map((s) => ({
      text: s.text.slice(0, 120),
      title: s.title || '',
      source: s.source ?? 'manual',
    }));
  }

  private async loadBubblesSequentially(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      if (this.snippets.length < 3) break;
      await this.addZenBubbleWithSample(this.pickSample());
    }
  }

  private async fetchInsightsBatch(count: number): Promise<string[]> {
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      if (this.snippets.length < 3) break;
      try {
        const response = await chrome.runtime.sendMessage({
          type: MSG.GENERATE_INSIGHT,
          snippetSample: this.pickSample(),
          previousInsights: this.pastInsights.slice(-20),
        }) as { ok: boolean; insight?: string };

        if (response?.ok && response.insight) {
          const isDuplicate = this.pastInsights.some((p) =>
            p === response.insight || p.slice(0, 60) === response.insight!.slice(0, 60)
          );
          if (isDuplicate) continue;

          results.push(response.insight);
          this.pastInsights.push(response.insight);
          if (this.pastInsights.length > 30) this.pastInsights = this.pastInsights.slice(-30);
        }
      } catch {}
    }
    if (results.length > 0) {
      void chrome.storage.session.set({ sonto_past_insights: this.pastInsights }).catch(() => {});
    }
    return results;
  }

  private async addZenBubbleWithSample(sample: { text: string; title: string; source: string }[]): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GENERATE_INSIGHT,
        snippetSample: sample,
        previousInsights: this.pastInsights.slice(-20),
      }) as { ok: boolean; insight?: string };

      if (response?.ok && response.insight) {
        const isDuplicate = this.pastInsights.some((p) =>
          p === response.insight || p.slice(0, 60) === response.insight!.slice(0, 60)
        );
        if (isDuplicate) return;

        this.hideZenLoader();
        this.appendZenBubbleElement(response.insight);

        this.pastInsights.push(response.insight);
        if (this.pastInsights.length > 30) this.pastInsights = this.pastInsights.slice(-30);
        void chrome.storage.session.set({ sonto_past_insights: this.pastInsights }).catch(() => {});
        void this.cacheZenFeed();
      }
    } catch {
      // no key or API error
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────

  private appendChatMessage(role: 'user' | 'assistant' | 'error', text: string): void {
    const icons: Record<string, string> = {
      user: SVG_USER,
      assistant: SVG_ASSISTANT,
      error: SVG_ERROR,
    };
    const roleLabel = role === 'user' ? 'You' : role === 'assistant' ? 'Sonto' : 'Error';
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const body = role === 'assistant' ? renderMarkdown(text) : escapeHtml(text);
    div.innerHTML = `
      <div class="chat-msg-role">${icons[role] ?? ''}${roleLabel}</div>
      <div class="chat-msg-body">${body}</div>
    `;
    this.chatMessages.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  private async sendMessage(): Promise<void> {
    const query = this.chatInput.value.trim();
    if (!query || this.isLoading) return;

    this.isLoading = true;
    this.chatInput.value = '';
    this.chatInput.disabled = true;
    this.sendBtn.disabled = true;

    this.appendChatMessage('user', query);

    try {
      if (this.snippets.length === 0) {
        this.appendChatMessage('error', 'No snippets saved yet. Capture some text first.');
        return;
      }

      const queryResponse = await chrome.runtime.sendMessage({ type: MSG.QUERY_SNIPPETS, query }) as { ok: boolean; results?: QueryResult[] };
      if (!queryResponse?.ok || !queryResponse.results?.length) {
        this.appendChatMessage('error', 'Could not find relevant snippets for your question.');
        return;
      }

      const settings = await getSettings();
      const key = await getActiveKey();

      if (!key.trim()) {
        this.appendChatMessage('error', `No ${settings.llmProvider.toUpperCase()} API key configured. Open Settings to add one.`);
        return;
      }

      const messages = buildPrompt(query, queryResponse.results);

      const model = settings.llmProvider === 'gemini'
        ? settings.geminiModel
        : settings.openaiModel;

      this.abortController = new AbortController();
      const signal = AbortSignal.any([this.abortController.signal, AbortSignal.timeout(30000)]);

      const strategy = getProviderStrategy(settings.llmProvider);
      const reply = await strategy.chat({ apiKey: key, model, messages, signal });

      this.appendChatMessage('assistant', reply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      this.appendChatMessage('error', msg);
    } finally {
      this.isLoading = false;
      this.chatInput.disabled = false;
      this.sendBtn.disabled = false;
      this.chatInput.focus();
      this.abortController = null;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

void new SontoSidebar().init();
