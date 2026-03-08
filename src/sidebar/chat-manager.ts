import { MSG } from '../shared/messages';
import { getSettings, getOpenAIKey, getGeminiKey } from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import { renderMarkdown } from '../shared/markdown';
import type { ChatMessage, QueryResult, Snippet } from '../shared/types';
import { escapeHtml } from './zen/zen-content';

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

async function getActiveKey(): Promise<string> {
  const settings = await getSettings();
  if (settings.llmProvider === 'gemini') return getGeminiKey();
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

export class ChatManager {
  private isLoading = false;
  private abortController: AbortController | null = null;
  private snippetsFn: () => Snippet[];

  constructor(
    private readonly messagesEl: HTMLElement,
    private readonly inputEl: HTMLTextAreaElement,
    private readonly sendBtn: HTMLButtonElement,
    snippets: () => Snippet[],
  ) {
    this.snippetsFn = snippets;
  }

  async sendMessage(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query || this.isLoading) return;

    this.isLoading = true;
    this.inputEl.value = '';
    this.inputEl.disabled = true;
    this.sendBtn.disabled = true;

    this.appendMessage('user', query);

    try {
      if (this.snippetsFn().length === 0) {
        this.appendMessage('error', 'No snippets saved yet. Capture some text first.');
        return;
      }

      const queryResponse = await chrome.runtime.sendMessage({
        type: MSG.QUERY_SNIPPETS,
        query,
      }) as { ok: boolean; results?: QueryResult[] };

      if (!queryResponse?.ok || !queryResponse.results?.length) {
        this.appendMessage('error', 'Could not find relevant snippets for your question.');
        return;
      }

      const settings = await getSettings();
      const key = await getActiveKey();

      if (!key.trim()) {
        this.appendMessage(
          'error',
          `No ${settings.llmProvider.toUpperCase()} API key configured. Open Settings to add one.`,
        );
        return;
      }

      const messages = buildPrompt(query, queryResponse.results);
      const model = settings.llmProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;

      this.abortController = new AbortController();
      const signal = AbortSignal.any([this.abortController.signal, AbortSignal.timeout(30000)]);

      const strategy = getProviderStrategy(settings.llmProvider);
      const reply = await strategy.chat({ apiKey: key, model, messages, signal });

      this.appendMessage('assistant', reply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      this.appendMessage('error', msg);
    } finally {
      this.isLoading = false;
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.inputEl.focus();
      this.abortController = null;
    }
  }

  appendMessage(role: 'user' | 'assistant' | 'error', text: string): HTMLElement {
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
    this.messagesEl.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return div;
  }

  clear(): void {
    this.messagesEl.innerHTML = '';
  }
}
