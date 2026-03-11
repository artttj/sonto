// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { getSettings, getOpenAIKey, getGeminiKey, getChatSessions, saveChatSessions } from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import { renderMarkdown } from '../shared/markdown';
import type { ChatMessage, ChatSession, QueryResult, Snippet } from '../shared/types';
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
        `Separate what is directly supported by the context from what is your best inference. ` +
        `If you genuinely cannot answer from the context, say so. Be concise but helpful.`,
    },
    {
      role: 'user',
      content: `Context from my saved data:\n\n${snippetContext}\n\n---\n\nQuestion: ${query}`,
    },
  ];
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export class ChatManager {
  private isLoading = false;
  private abortController: AbortController | null = null;
  private snippetsFn: () => Snippet[];
  private sessionMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  private currentSessionId = generateSessionId();
  private showingHistory = false;

  constructor(
    private readonly messagesEl: HTMLElement,
    private readonly inputEl: HTMLTextAreaElement,
    private readonly sendBtn: HTMLButtonElement,
    snippets: () => Snippet[],
    private readonly historyBtn?: HTMLButtonElement,
  ) {
    this.snippetsFn = snippets;
    if (this.historyBtn) {
      this.historyBtn.addEventListener('click', () => void this.toggleHistory());
    }
  }

  async sendMessage(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query || this.isLoading) return;

    if (this.showingHistory) {
      this.showingHistory = false;
      this.messagesEl.innerHTML = '';
    }

    this.isLoading = true;
    this.inputEl.value = '';
    this.inputEl.disabled = true;
    this.sendBtn.disabled = true;

    this.appendMessage('user', query);
    this.sessionMessages.push({ role: 'user', content: query });

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

      this.appendAssistantMessage(reply, queryResponse.results, query);
      this.sessionMessages.push({ role: 'assistant', content: reply });
      await this.saveCurrentSession(query);
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

  private async saveCurrentSession(query: string): Promise<void> {
    if (this.sessionMessages.length === 0) return;
    const sessions = await getChatSessions();
    const existing = sessions.findIndex((s) => s.id === this.currentSessionId);
    const title = existing !== -1 ? sessions[existing].title : query.slice(0, 60);
    const session: ChatSession = {
      id: this.currentSessionId,
      title,
      timestamp: Date.now(),
      messages: this.sessionMessages,
    };
    if (existing !== -1) {
      sessions[existing] = session;
    } else {
      sessions.push(session);
    }
    await saveChatSessions(sessions);
  }

  private async toggleHistory(): Promise<void> {
    if (this.showingHistory) {
      this.showingHistory = false;
      this.messagesEl.innerHTML = '';
      for (const m of this.sessionMessages) {
        this.appendMessage(m.role, m.content);
      }
      return;
    }

    this.showingHistory = true;
    this.messagesEl.innerHTML = '';

    const sessions = await getChatSessions();
    if (sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-history-empty';
      empty.textContent = 'No past conversations yet.';
      this.messagesEl.appendChild(empty);
      return;
    }

    const header = document.createElement('div');
    header.className = 'chat-history-header';
    header.textContent = 'Past Conversations';
    this.messagesEl.appendChild(header);

    for (const session of [...sessions].reverse()) {
      const row = document.createElement('div');
      row.className = 'chat-history-row';
      row.innerHTML = `
        <div class="chat-history-title">${escapeHtml(session.title)}</div>
        <div class="chat-history-date">${new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      `;
      row.addEventListener('click', () => this.loadSession(session));
      this.messagesEl.appendChild(row);
    }
  }

  private loadSession(session: ChatSession): void {
    this.showingHistory = false;
    this.currentSessionId = session.id;
    this.sessionMessages = [...session.messages];
    this.messagesEl.innerHTML = '';
    for (const m of session.messages) {
      this.appendMessage(m.role, m.content);
    }
  }

  draftQuestion(text: string, sendNow = false): void {
    this.showingHistory = false;
    this.inputEl.value = text;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    if (sendNow) {
      void this.sendMessage();
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

  private appendAssistantMessage(text: string, results: QueryResult[], query: string): HTMLElement {
    const div = this.appendMessage('assistant', text);
    const body = div.querySelector<HTMLElement>('.chat-msg-body');
    if (!body) return div;

    const note = document.createElement('div');
    note.className = 'chat-grounding-note';
    note.textContent = `Grounded in ${results.length} saved item${results.length === 1 ? '' : 's'}. Chips are direct sources. Inference may go beyond exact saved text.`;
    body.appendChild(note);

    const sources = document.createElement('div');
    sources.className = 'chat-citations';
    results.forEach((result, index) => {
      const chip = document.createElement('a');
      chip.className = 'chat-citation-chip';
      chip.href = result.snippet.url;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.textContent = `${index + 1}. ${result.snippet.title || truncateText(result.snippet.text, 36)}`;
      chip.title = result.snippet.url;
      sources.appendChild(chip);
    });
    body.appendChild(sources);

    const actions = document.createElement('div');
    actions.className = 'chat-followups';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'chat-followup-btn chat-followup-btn--primary';
    saveBtn.textContent = 'Save answer';
    saveBtn.addEventListener('click', () => {
      void this.saveAnswer(query, text, results, saveBtn);
    });
    actions.appendChild(saveBtn);

    for (const suggestion of buildFollowUps(query, results)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-followup-btn';
      btn.textContent = suggestion;
      btn.addEventListener('click', () => this.draftQuestion(suggestion, true));
      actions.appendChild(btn);
    }

    body.appendChild(actions);
    return div;
  }

  private async saveAnswer(
    query: string,
    answer: string,
    results: QueryResult[],
    button: HTMLButtonElement,
  ): Promise<void> {
    button.disabled = true;
    const context = results
      .map((result, index) => `[${index + 1}] ${result.snippet.title || result.snippet.url}`)
      .join(' | ');

    try {
      await chrome.runtime.sendMessage({
        type: MSG.CAPTURE_SNIPPET,
        text: answer,
        url: results[0]?.snippet.url ?? location.href,
        title: `Chat answer: ${query.slice(0, 60)}`,
        context,
        tags: ['chat-answer', 'grounded'],
      });
      button.textContent = 'Saved';
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Save answer';
      }, 1800);
    }
  }

  clear(): void {
    this.messagesEl.innerHTML = '';
    this.sessionMessages = [];
    this.currentSessionId = generateSessionId();
    this.showingHistory = false;
  }
}

function buildFollowUps(query: string, results: QueryResult[]): string[] {
  const top = results[0]?.snippet;
  const title = top?.title || 'this';
  return [
    `What in my saves best supports this answer?`,
    `What should I revisit next about ${title}?`,
    `Give me a short summary I can save.`,
  ];
}

function truncateText(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}
