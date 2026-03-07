import { MSG } from '../shared/messages';
import { getSettings, getOpenAIKey, getGeminiKey, getGrokKey } from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import type { ChatMessage, QueryResult, Snippet } from '../shared/types';

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
  if (provider === 'grok') return getGrokKey();
  return getOpenAIKey();
}

function buildPrompt(query: string, results: QueryResult[]): ChatMessage[] {
  const snippetContext = results
    .map((r, i) => {
      const source = r.snippet.title ? `${r.snippet.title} (${truncateUrl(r.snippet.url)})` : truncateUrl(r.snippet.url);
      return `[${i + 1}] Source: ${source}\n${r.snippet.text}`;
    })
    .join('\n\n---\n\n');

  return [
    {
      role: 'system',
      content:
        'You are a helpful assistant. Answer the user question using only the provided snippet context. If the context does not contain enough information, say so clearly. Be concise and direct.',
    },
    {
      role: 'user',
      content: `Context from saved snippets:\n\n${snippetContext}\n\n---\n\nQuestion: ${query}`,
    },
  ];
}

class SontoSidebar {
  private snippets: Snippet[] = [];
  private chatHistory: { role: 'user' | 'assistant' | 'error'; text: string }[] = [];
  private isLoading = false;
  private abortController: AbortController | null = null;
  private mode: 'browse' | 'chat' = 'browse';

  private browseBtn = qs<HTMLButtonElement>('#btn-browse');
  private chatBtn = qs<HTMLButtonElement>('#btn-chat');
  private viewBrowse = qs<HTMLElement>('#view-browse');
  private viewChat = qs<HTMLElement>('#view-chat');
  private snippetList = qs<HTMLElement>('#snippet-list');
  private snippetCount = qs<HTMLElement>('#snippet-count');
  private chatMessages = qs<HTMLElement>('#chat-messages');
  private chatInput = qs<HTMLTextAreaElement>('#chat-input');
  private sendBtn = qs<HTMLButtonElement>('#btn-send');
  private chatInitializing = qs<HTMLElement>('#chat-initializing');

  async init(): Promise<void> {
    qs<HTMLButtonElement>('#btn-settings').addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: MSG.OPEN_SETTINGS });
    });

    this.browseBtn.addEventListener('click', () => this.setMode('browse'));
    this.chatBtn.addEventListener('click', () => this.setMode('chat'));
    qs<HTMLButtonElement>('#btn-clear-all').addEventListener('click', () => void this.clearAll());

    this.sendBtn.addEventListener('click', () => void this.sendMessage());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });

    await this.loadSnippets();
    this.readyChat();
  }

  private setMode(mode: 'browse' | 'chat'): void {
    this.mode = mode;
    this.browseBtn.classList.toggle('active', mode === 'browse');
    this.chatBtn.classList.toggle('active', mode === 'chat');
    this.viewBrowse.classList.toggle('hidden', mode !== 'browse');
    this.viewChat.classList.toggle('hidden', mode !== 'chat');
  }

  private readyChat(): void {
    this.chatInitializing.classList.add('hidden');
    this.chatInput.disabled = false;
    this.sendBtn.disabled = false;
    this.chatInput.placeholder = 'Ask anything about your saved snippets...';
  }

  private async loadSnippets(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_SNIPPETS }) as { ok: boolean; snippets?: Snippet[] };
    if (response?.ok && response.snippets) {
      this.snippets = response.snippets;
    }
    this.renderSnippets();
  }

  private renderSnippets(): void {
    const count = this.snippets.length;
    this.snippetCount.textContent = `${count} snippet${count !== 1 ? 's' : ''}`;

    if (count === 0) {
      this.snippetList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="8" y="10" width="32" height="28" rx="3"/>
              <path d="M16 18h16M16 24h12M16 30h8"/>
            </svg>
          </div>
          <div class="empty-title">No saved snippets</div>
          <div class="empty-desc">Highlight text on any page and press <strong>Alt+Shift+C</strong> or right-click to save it here.</div>
        </div>
      `;
      return;
    }

    this.snippetList.innerHTML = '';
    for (const snippet of this.snippets) {
      const card = document.createElement('div');
      card.className = 'snippet-card';
      card.innerHTML = `
        <div class="snippet-text">${escapeHtml(snippet.text)}</div>
        <div class="snippet-meta">
          <div class="snippet-source">
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
    if (!confirm(`Delete all ${this.snippets.length} snippets?`)) return;
    await Promise.all(this.snippets.map((s) => chrome.runtime.sendMessage({ type: MSG.DELETE_SNIPPET, id: s.id })));
    this.snippets = [];
    this.renderSnippets();
  }

  private appendChatMessage(role: 'user' | 'assistant' | 'error', text: string): void {
    const roleLabel = role === 'user' ? 'You' : role === 'assistant' ? 'Sonto' : 'Error';
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.innerHTML = `
      <div class="chat-msg-role">${roleLabel}</div>
      <div class="chat-msg-body">${escapeHtml(text)}</div>
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

      const model =
        settings.llmProvider === 'gemini'
          ? settings.geminiModel
          : settings.llmProvider === 'grok'
            ? settings.grokModel
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
