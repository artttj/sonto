import { MSG } from '../shared/messages';
import { getSettings, getOpenAIKey, getGeminiKey } from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import { renderMarkdown } from '../shared/markdown';
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
const ZEN_DRIP_MS = 30000;
const ZEN_IDLE_MS = 5 * 60 * 1000;
const ZEN_MAX_CATCHUP = 6;
const ZEN_MAX_BUBBLES = 20;
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

const JUNK_PATTERNS = [
  /\bcookies?\b.*\b(consent|policy|notice|settings|preferences)\b/i,
  /\bprivacy policy\b/i,
  /\bterms (of service|of use|and conditions)\b/i,
  /\baccept all\b.*\bcookies?\b/i,
  /\bwe use cookies?\b/i,
  /^(home|about|contact|menu|navigation|search|log ?in|sign in|sign up|register|subscribe)\s*$/i,
];

const AI_PATTERNS = [
  /\b(artificial intelligence|machine learning|deep learning|neural network|large language model|llm|gpt-?\d|chatgpt|copilot|chatbot|generative ai|diffusion model|prompt engineering|fine.?tun(ing)?)\b/i,
];

const BLOCKED_CATEGORY_PATTERNS = [
  /\b(ai|artificial intelligence|machine learning|deep learning|llm|large language model|chatbot|generative|prompt engineering|ai.driven|ai.powered|ai.based|neural network)\b/i,
  /\b(adult|porn|pornograph|explicit|erotic|escort|sex|xxx|onlyfans)\b/i,
  /\b(cannabis|hashish|weed|drug|marijuana|cocaine|narcotic|psychedelic|substance abuse)\b/i,
  /\b(food delivery|ride.?hail|grocery|uber|doordash|restaurant|takeaway|takeout|local service|banking app|subscription service)\b/i,
  /\b(social media|instagram|tiktok|facebook|twitter|youtube|streaming|content creation|video platform|twitch)\b/i,
];

class SontoSidebar {
  private snippets: Snippet[] = [];
  private filter: FilterMode = 'all';
  private chatHistory: { role: 'user' | 'assistant' | 'error'; text: string }[] = [];
  private isLoading = false;
  private abortController: AbortController | null = null;
  private mode: ViewMode = 'zen';
  private pastFacts: string[] = [];
  private zenCategories: string[] = [];
  private zenCategoryQueue: string[] = [];
  private language = 'en';

  private zenDripTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();

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

    document.addEventListener('pointermove', () => { this.lastActivity = Date.now(); });
    document.addEventListener('keydown', () => { this.lastActivity = Date.now(); });

    chrome.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === MSG.SNIPPET_ADDED) {
        void this.loadSnippets().then(() => {
          if (this.mode === 'zen') {
            this.zenCategories = [];
            void chrome.storage.session.remove('sonto_zen_categories').catch(() => {});
            void this.dripZen();
          }
        });
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
      const stored = await chrome.storage.session.get('sonto_past_facts');
      this.pastFacts = (stored?.sonto_past_facts as string[]) ?? [];
    } catch {}

    try {
      const settings = await getSettings();
      this.language = settings.language ?? 'en';
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

    const hasBubbles = this.zenFeed.querySelectorAll('.zen-bubble').length > 0;
    if (hasBubbles) {
      this.zenDripTimer = setInterval(() => void this.dripZen(), ZEN_DRIP_MS);
      return;
    }

    try {
      const cached = await chrome.storage.session.get(['sonto_zen_feed', 'sonto_zen_last_drip']);
      const raw = (cached?.sonto_zen_feed as string[]) ?? [];
      const lastDrip = (cached?.sonto_zen_last_drip as number) ?? 0;

      if (raw.length > 0) {
        this.zenFeed.innerHTML = '';
        const seen = new Set<string>();
        for (const text of raw) {
          if (!text || seen.has(text)) continue;
          seen.add(text);
          this.appendZenBubbleElement(text);
        }

        await this.extractCategories();

        const missedCycles = lastDrip > 0 ? Math.floor((Date.now() - lastDrip) / ZEN_DRIP_MS) : 0;
        const catchup = Math.min(missedCycles * ZEN_DRIP_BATCH, ZEN_MAX_CATCHUP);
        if (catchup > 0) {
          const newFacts = await this.fetchFactsBatch(catchup);
          for (const text of newFacts) {
            this.appendZenBubbleElement(text);
          }
          void this.cacheZenFeed();
        }

        this.zenDripTimer = setInterval(() => void this.dripZen(), ZEN_DRIP_MS);
        return;
      }
    } catch {}

    this.zenFeed.innerHTML = '';
    this.showZenLoader();

    await this.extractCategories();
    await this.loadInitialBubbles(ZEN_INITIAL_BATCH);

    this.hideZenLoader();

    if (this.mode === 'zen') {
      this.zenDripTimer = setInterval(() => void this.dripZen(), ZEN_DRIP_MS);
    }
  }

  private async dripZen(): Promise<void> {
    if (document.hidden || Date.now() - this.lastActivity > ZEN_IDLE_MS) return;
    await this.addZenBubble();
    this.trimOldBubbles();
    this.zenFeed.scrollTo({ top: 0, behavior: 'smooth' });
    void this.cacheZenFeed();
  }

  private trimOldBubbles(): void {
    const bubbles = this.zenFeed.querySelectorAll<HTMLElement>('.zen-bubble');
    const excess = bubbles.length - ZEN_MAX_BUBBLES;
    for (let i = 0; i < excess; i++) {
      const old = bubbles[bubbles.length - 1 - i];
      old.style.transition = 'opacity 0.6s ease';
      old.style.opacity = '0';
      setTimeout(() => old.remove(), 600);
    }
  }

  private cacheZenFeed(): void {
    const items = Array.from(this.zenFeed.querySelectorAll<HTMLElement>('.zen-bubble'))
      .map((el) => el.querySelector('span')?.textContent ?? '')
      .filter(Boolean);
    void chrome.storage.session.set({
      sonto_zen_feed: items,
      sonto_zen_last_drip: Date.now(),
    }).catch(() => {});
  }

  private stopZen(): void {
    if (this.zenDripTimer) {
      clearInterval(this.zenDripTimer);
      this.zenDripTimer = null;
    }
  }

  private appendZenBubbleElement(text: string, link?: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    const linkHtml = link
      ? ` <a class="zen-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">↗</a>`
      : '';
    bubble.innerHTML = `${SVG_BULB}<span>${escapeHtml(text)}${linkHtml}</span>`;
    const first = this.zenFeed.firstChild;
    if (first) {
      this.zenFeed.insertBefore(bubble, first);
    } else {
      this.zenFeed.appendChild(bubble);
    }
    return bubble;
  }

  private appendZenArtBubble(imageUrl: string, caption: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    bubble.innerHTML = `${SVG_BULB}<div class="zen-art"><img class="zen-art-img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" /><span class="zen-art-caption">${escapeHtml(caption)}</span></div>`;
    const img = bubble.querySelector<HTMLImageElement>('.zen-art-img');
    if (img) {
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    }
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

  private async extractCategories(): Promise<void> {
    if (this.zenCategories.length > 0) return;

    try {
      const cached = await chrome.storage.session.get('sonto_zen_categories');
      if (Array.isArray(cached?.sonto_zen_categories) && (cached.sonto_zen_categories as unknown[]).length > 0) {
        this.zenCategories = cached.sonto_zen_categories as string[];
        return;
      }
    } catch {}

    if (this.snippets.length === 0) return;

    const valid = this.snippets.filter((s) => !JUNK_PATTERNS.some((p) => p.test(`${s.title} ${s.text}`)));
    const manual = valid.filter((s) => s.source !== 'history');
    const history = valid
      .filter((s) => s.source === 'history')
      .sort(() => Math.random() - 0.5)
      .slice(0, 200);

    const sample = [...manual, ...history]
      .slice(0, 250)
      .map((s) => ({
        text: s.text.slice(0, 300),
        title: s.title || '',
        source: s.source ?? 'manual',
      }));

    if (sample.length === 0) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.EXTRACT_CATEGORIES,
        snippets: sample,
      }) as { ok: boolean; categories?: string[] };

      if (response?.ok && response.categories?.length) {
        this.zenCategories = response.categories;
        void chrome.storage.session.set({ sonto_zen_categories: this.zenCategories }).catch(() => {});
      }
    } catch {}
  }

  private isValidFact(text: string): boolean {
    return text.length >= 50 && !text.includes('[NULL]') && !AI_PATTERNS.some((p) => p.test(text));
  }

  private async fetchUselessFact(): Promise<string | null> {
    try {
      const res = await fetch(`https://uselessfacts.jsph.pl/api/v2/facts/random?language=${this.language}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { text?: string };
      const text = data.text?.trim() ?? '';
      return this.isValidFact(text) ? text : null;
    } catch {
      return null;
    }
  }

  private async fetchStoicQuote(): Promise<string | null> {
    if (this.language !== 'en') return null;
    try {
      const res = await fetch('https://stoic.tekloon.net/stoic-quote', {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { data?: { quote?: string; author?: string } };
      const quote = data.data?.quote?.trim() ?? '';
      const author = data.data?.author?.trim();
      if (!this.isValidFact(quote)) return null;
      return author ? `${quote} — ${author}` : quote;
    } catch {
      return null;
    }
  }

  private async fetchDesignQuote(): Promise<string | null> {
    if (this.language !== 'en') return null;
    try {
      const res = await fetch(`https://quotesondesign.com/wp-json/custom/v1/random-post?nocache=${Date.now()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { title?: string; content?: string };
      const decoded = new DOMParser().parseFromString(data.content ?? '', 'text/html').body.textContent ?? '';
      const raw = decoded.trim();
      const author = data.title?.trim();
      if (!this.isValidFact(raw)) return null;
      return author ? `${raw} — ${author}` : raw;
    } catch {
      return null;
    }
  }

  private async fetchHNStory(): Promise<{ text: string; link: string } | null> {
    try {
      const listRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
        signal: AbortSignal.timeout(8000),
      });
      if (!listRes.ok) return null;
      const ids = await listRes.json() as number[];
      const pool = ids.slice(0, 30);
      const id = pool[Math.floor(Math.random() * pool.length)];
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!itemRes.ok) return null;
      const item = await itemRes.json() as { title?: string; url?: string; type?: string; dead?: boolean; deleted?: boolean };
      if (item.dead || item.deleted || item.type !== 'story') return null;
      const title = item.title?.replace(/<[^>]+>/g, '').trim() ?? '';
      if (title.length < 10 || AI_PATTERNS.some((p) => p.test(title))) return null;
      const link = item.url ?? `https://news.ycombinator.com/item?id=${id}`;
      return { text: `HN: ${title}`, link };
    } catch {
      return null;
    }
  }

  private async fetchMetArtwork(category: string): Promise<{ imageUrl: string; caption: string } | null> {
    const MET_HIGHLIGHTED_IDS = [
      436535, 437329, 436121, 11417, 45734, 437984, 436527, 436532, 437980, 436528,
      10481, 459055, 436524, 437331, 436533, 452658, 436529, 436534, 436530, 436526,
    ];

    const fetchObject = async (objectId: number) => {
      const objRes = await fetch(
        `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!objRes.ok) return null;
      const obj = await objRes.json() as {
        primaryImageSmall?: string;
        title?: string;
        artistDisplayName?: string;
        objectDate?: string;
        isPublicDomain?: boolean;
      };
      if (!obj.primaryImageSmall || !obj.isPublicDomain) return null;
      const title = obj.title?.trim() || 'Untitled';
      const parts = [title];
      if (obj.artistDisplayName?.trim()) parts.push(obj.artistDisplayName.trim());
      if (obj.objectDate?.trim()) parts.push(obj.objectDate.trim());
      return { imageUrl: obj.primaryImageSmall, caption: parts.join(' — ') };
    };

    try {
      const keyword = encodeURIComponent(category.split(/\s+/)[0]);
      const searchRes = await fetch(
        `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${keyword}&hasImages=true&isPublicDomain=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json() as { total: number; objectIDs?: number[] };
        const ids = searchData.objectIDs ?? [];
        if (ids.length > 0) {
          const pool = ids.slice(0, 50);
          const objectId = pool[Math.floor(Math.random() * pool.length)];
          const result = await fetchObject(objectId);
          if (result) return result;
        }
      }

      // Fallback: pick from a curated list of well-known highlighted artworks
      const fallbackId = MET_HIGHLIGHTED_IDS[Math.floor(Math.random() * MET_HIGHLIGHTED_IDS.length)];
      return await fetchObject(fallbackId);
    } catch {
      return null;
    }
  }

  private readonly REDDIT_SUBREDDITS = [
    'todayilearned', 'science', 'Futurology', 'space', 'history',
    'technology', 'programming', 'entrepreneur', 'interestingasfuck', 'philosophy',
    'business', 'AskScience', 'dataisbeautiful',
  ];

  private async fetchRedditPost(): Promise<{ text: string; link: string } | null> {
    try {
      const sub = this.REDDIT_SUBREDDITS[Math.floor(Math.random() * this.REDDIT_SUBREDDITS.length)];
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as {
        data?: { children?: Array<{ data: { title: string; permalink: string; score: number; stickied: boolean; over_18: boolean } }> };
      };
      const posts = (data.data?.children ?? [])
        .map((p) => p.data)
        .filter((p) => !p.stickied && !p.over_18 && p.score > 50 && p.title.length >= 20)
        .filter((p) => !AI_PATTERNS.some((pat) => pat.test(p.title)));
      if (posts.length === 0) return null;
      const pick = posts[Math.floor(Math.random() * Math.min(posts.length, 10))];
      return {
        text: `r/${sub}: ${pick.title}`,
        link: `https://www.reddit.com${pick.permalink}`,
      };
    } catch {
      return null;
    }
  }

  private async fetchZenQuote(): Promise<string | null> {
    if (this.language !== 'en') return null;
    try {
      const res = await fetch('https://zenquotes.io/api/random', {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as Array<{ q?: string; a?: string }>;
      const item = data[0];
      const quote = item?.q?.trim() ?? '';
      const author = item?.a?.trim();
      if (!this.isValidFact(quote)) return null;
      return author ? `${quote} — ${author}` : quote;
    } catch {
      return null;
    }
  }

  private getGeolocation(): Promise<GeolocationCoordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
      const timer = setTimeout(() => reject(new Error('timeout')), 6000);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve(pos.coords); },
        (err) => { clearTimeout(timer); reject(err); },
        { timeout: 6000, maximumAge: 300000 },
      );
    });
  }

  private async fetchWeatherForecast(): Promise<string | null> {
    const WMO_EN: Record<number, string> = {
      0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
      45: 'foggy', 48: 'icy fog',
      51: 'light drizzle', 53: 'moderate drizzle', 55: 'heavy drizzle',
      61: 'light rain', 63: 'moderate rain', 65: 'heavy rain',
      71: 'light snow', 73: 'moderate snow', 75: 'heavy snow',
      80: 'rain showers', 81: 'moderate showers', 82: 'heavy showers',
      95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm',
    };
    const WMO_DE: Record<number, string> = {
      0: 'klarer Himmel', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt',
      45: 'Nebel', 48: 'Eisnebel',
      51: 'leichter Nieselregen', 53: 'mäßiger Nieselregen', 55: 'starker Nieselregen',
      61: 'leichter Regen', 63: 'mäßiger Regen', 65: 'starker Regen',
      71: 'leichter Schnee', 73: 'mäßiger Schnee', 75: 'starker Schnee',
      80: 'Regenschauer', 81: 'mäßige Schauer', 82: 'starke Schauer',
      95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter',
    };
    try {
      const coords = await this.getGeolocation();
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weathercode,wind_speed_10m&timezone=auto`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json() as {
        current?: { temperature_2m?: number; weathercode?: number; wind_speed_10m?: number };
      };
      const c = data.current;
      if (!c) return null;
      const temp = Math.round(c.temperature_2m ?? 0);
      const wind = Math.round(c.wind_speed_10m ?? 0);
      const code = c.weathercode ?? 0;
      const wmo = this.language === 'de' ? WMO_DE : WMO_EN;
      const condition = wmo[code] ?? (this.language === 'de' ? 'wechselhaft' : 'mixed conditions');
      return this.language === 'de'
        ? `Aktuell ${temp}°C, ${condition}, Wind ${wind} km/h.`
        : `Currently ${temp}°C with ${condition} and ${wind} km/h winds.`;
    } catch {
      return null;
    }
  }

  private async fetchAdviceSlip(): Promise<string | null> {
    if (this.language !== 'en') return null;
    try {
      const res = await fetch('https://api.adviceslip.com/advice', {
        signal: AbortSignal.timeout(8000),
        cache: 'no-cache',
      });
      if (!res.ok) return null;
      const data = await res.json() as { slip?: { advice: string } };
      const text = data.slip?.advice.trim() ?? '';
      return this.isValidFact(text) ? text : null;
    } catch {
      return null;
    }
  }

  private pickCategory(): string | null {
    if (this.zenCategories.length === 0) return null;
    if (this.zenCategoryQueue.length === 0) {
      this.zenCategoryQueue = [...this.zenCategories]
        .filter((c) => !BLOCKED_CATEGORY_PATTERNS.some((p) => p.test(c)))
        .sort(() => Math.random() - 0.5);
    }
    if (this.zenCategoryQueue.length === 0) return null;
    return this.zenCategoryQueue.pop()!;
  }

  private async addZenBubble(): Promise<void> {
    if (this.zenCategories.length === 0) return;

    const roll = Math.random();

    if (roll < 0.15) {
      const artCategory = this.pickCategory();
      if (artCategory) {
        const art = await this.fetchMetArtwork(artCategory);
        if (art && !this.pastFacts.some((p) => p.slice(0, 60) === art.caption.slice(0, 60))) {
          this.hideZenLoader();
          this.appendZenArtBubble(art.imageUrl, art.caption);
          this.pastFacts.push(art.caption);
          if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
          void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
          void this.cacheZenFeed();
          return;
        }
      }
    }

    type TextResult = string | { text: string; link?: string } | null;
    const externalFetcher: (() => Promise<TextResult>) | null =
      roll < 0.10 ? () => this.fetchUselessFact() :
      roll < 0.17 ? () => this.fetchAdviceSlip() :
      roll < 0.24 ? () => this.fetchStoicQuote() :
      roll < 0.30 ? () => this.fetchDesignQuote() :
      roll < 0.36 ? () => this.fetchZenQuote() :
      roll < 0.44 ? () => this.fetchHNStory() :
      roll < 0.52 ? () => this.fetchRedditPost() :
      roll < 0.58 ? () => this.fetchWeatherForecast() :
      null;

    if (externalFetcher) {
      const result = await externalFetcher();
      if (result) {
        const text = typeof result === 'string' ? result : result.text;
        const link = typeof result === 'object' && result !== null ? result.link : undefined;
        if (!this.pastFacts.some((p) => p.slice(0, 60) === text.slice(0, 60))) {
          this.hideZenLoader();
          this.appendZenBubbleElement(text, link);
          this.pastFacts.push(text);
          if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
          void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
          void this.cacheZenFeed();
          return;
        }
      }
    }

    const category = this.pickCategory();
    if (!category) return;
    const useStat = Math.random() < 0.1;

    try {
      const response = await chrome.runtime.sendMessage({
        type: useStat ? MSG.GENERATE_ZEN_STAT : MSG.GENERATE_ZEN_FACT,
        category,
        previousFacts: this.pastFacts.slice(-20),
        language: this.language,
      }) as { ok: boolean; fact?: string };

      if (response?.ok && response.fact && !response.fact.includes('[NULL]') && response.fact.trim().length >= 50 && !AI_PATTERNS.some((p) => p.test(response.fact!))) {
        const isDuplicate = this.pastFacts.some((p) =>
          p === response.fact || p.slice(0, 60) === response.fact!.slice(0, 60)
        );
        if (isDuplicate) return;

        this.hideZenLoader();
        this.appendZenBubbleElement(response.fact);

        this.pastFacts.push(response.fact);
        if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
        void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
        void this.cacheZenFeed();
      }
    } catch {}
  }

  private async loadInitialBubbles(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.addZenBubble();
    }
  }

  private async fetchFactsBatch(count: number): Promise<string[]> {
    if (this.zenCategories.length === 0) return [];

    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const category = this.pickCategory();
      if (!category) break;
      try {
        const response = await chrome.runtime.sendMessage({
          type: MSG.GENERATE_ZEN_FACT,
          category,
          previousFacts: this.pastFacts.slice(-20),
          language: this.language,
        }) as { ok: boolean; fact?: string };

        if (response?.ok && response.fact && !response.fact.includes('[NULL]') && response.fact.trim().length >= 50 && !AI_PATTERNS.some((p) => p.test(response.fact!))) {
          const isDuplicate = this.pastFacts.some((p) =>
            p === response.fact || p.slice(0, 60) === response.fact!.slice(0, 60)
          );
          if (isDuplicate) continue;

          results.push(response.fact);
          this.pastFacts.push(response.fact);
          if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
        }
      } catch {}
    }

    if (results.length > 0) {
      void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
    }

    return results;
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
