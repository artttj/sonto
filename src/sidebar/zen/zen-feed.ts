import { MSG } from '../../shared/messages';
import { getDripInterval, getDisabledSources } from '../../shared/storage';
import type { Snippet } from '../../shared/types';
import {
  AI_PATTERNS,
  BLOCKED_CATEGORY_PATTERNS,
  SVG_BULB,
  ZEN_DRIP_MS,
  ZEN_IDLE_MS,
  ZEN_INITIAL_BATCH,
  ZEN_MAX_BUBBLES,
  ZEN_MAX_CATCHUP,
  escapeHtml,
} from './zen-content';
import { type ZenArtResult, type ZenFetchResult, type ZenTextResult, ZEN_FETCHERS, pickFetcher } from './zen-fetchers';

const JUNK_PATTERNS = [
  /\bcookies?\b.*\b(consent|policy|notice|settings|preferences)\b/i,
  /\bprivacy policy\b/i,
  /\bterms (of service|of use|and conditions)\b/i,
  /\baccept all\b.*\bcookies?\b/i,
  /\bwe use cookies?\b/i,
  /^(home|about|contact|menu|navigation|search|log ?in|sign in|sign up|register|subscribe)\s*$/i,
];

function isArtResult(r: ZenFetchResult): r is ZenArtResult {
  return r !== null && 'imageUrl' in r;
}

function isTextResult(r: ZenFetchResult): r is ZenTextResult {
  return r !== null && 'text' in r;
}

export class ZenFeed {
  private pastFacts: string[] = [];
  private zenCategories: string[] = [];
  private zenCategoryQueue: string[] = [];
  private zenDripTimer: ReturnType<typeof setTimeout> | null = null;
  private dripIntervalMs = ZEN_DRIP_MS;
  private lastActivity = Date.now();
  private language: string;
  private snippetsFn: () => Snippet[];
  private _starting = false;
  private disabledSources = new Set<string>();

  constructor(
    private readonly feedEl: HTMLElement,
    { language, snippets }: { language: string; snippets: () => Snippet[] },
  ) {
    this.language = language;
    this.snippetsFn = snippets;

    document.addEventListener('pointermove', () => { this.lastActivity = Date.now(); });
    document.addEventListener('keydown', () => { this.lastActivity = Date.now(); });

    this.feedEl.addEventListener('click', (e) => {
      const bubble = (e.target as HTMLElement).closest<HTMLElement>('.zen-bubble');
      if (!bubble) return;
      const isSpotlit = bubble.classList.contains('spotlight');
      this.feedEl.querySelectorAll('.zen-bubble').forEach((b) => b.classList.remove('spotlight'));
      if (!isSpotlit) bubble.classList.add('spotlight');
    });
  }

  async start(): Promise<void> {
    if (this._starting) return;

    // Already running with content — just make sure timer is alive
    if (this.zenDripTimer && this.feedEl.querySelectorAll('.zen-bubble').length > 0) return;

    this._starting = true;
    this.stop();

    try {
      const [disabled, intervalMs] = await Promise.all([getDisabledSources(), getDripInterval()]);
      this.disabledSources = new Set(disabled);
      this.dripIntervalMs = intervalMs;
    } catch { /* use previous value */ }

    try {
      const hasBubbles = this.feedEl.querySelectorAll('.zen-bubble').length > 0;
      if (hasBubbles) {
        this.scheduleDrip();
        return;
      }

      const cached = await chrome.storage.session.get(['sonto_zen_feed', 'sonto_zen_last_drip']);
      const raw = (cached?.sonto_zen_feed as string[]) ?? [];
      const lastDrip = (cached?.sonto_zen_last_drip as number) ?? 0;

      if (raw.length > 0) {
        this.feedEl.innerHTML = '';
        // Show only the most recent cached item to avoid a burst of posts on open
        const last = raw[raw.length - 1];
        if (last) {
          this.pastFacts.push(last);
          this.appendBubbleElement(last);
        }

        void this.extractCategories(this.snippetsFn());
        this.scheduleDrip();
        return;
      }

      this.feedEl.innerHTML = '';
      this.showLoader();
      await this.extractCategories(this.snippetsFn());
      await this.loadInitialBubbles(ZEN_INITIAL_BATCH);
      this.hideLoader();
      this.scheduleDrip();
    } finally {
      this._starting = false;
    }
  }

  stop(): void {
    if (this.zenDripTimer) {
      clearTimeout(this.zenDripTimer);
      this.zenDripTimer = null;
    }
  }

  private scheduleDrip(multiplier = 1): void {
    this.zenDripTimer = setTimeout(() => void this.dripZen(), Math.round(this.dripIntervalMs * multiplier));
  }

  private durationMultiplier(result: ZenFetchResult): number {
    if (!result) return 1;
    if (isArtResult(result)) return 1.2;
    if (isTextResult(result)) {
      if (result.link && result.text.length < 120) return 0.85;
      if (result.html?.includes('zen-trivia')) return 1.4;
      if (/[\u201C\u201D]/.test(result.text) || / \u2014 /.test(result.text)) return 1.5;
      if (result.text.length > 250) return 1.3;
    }
    return 1;
  }

  refresh(snippets: Snippet[], language: string): void {
    this.language = language;
    this.snippetsFn = () => snippets;
  }

  async restorePastFacts(): Promise<void> {
    try {
      const stored = await chrome.storage.session.get('sonto_past_facts');
      this.pastFacts = (stored?.sonto_past_facts as string[]) ?? [];
    } catch {}
  }

  private async extractCategories(snippets: Snippet[]): Promise<void> {
    if (this.zenCategories.length > 0) return;

    try {
      const cached = await chrome.storage.session.get('sonto_zen_categories');
      if (
        Array.isArray(cached?.sonto_zen_categories) &&
        (cached.sonto_zen_categories as unknown[]).length > 0
      ) {
        this.zenCategories = cached.sonto_zen_categories as string[];
        return;
      }
    } catch {}

    if (snippets.length === 0) return;

    const valid = snippets.filter((s) => !JUNK_PATTERNS.some((p) => p.test(`${s.title} ${s.text}`)));
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

  private isValidFact(text: string): boolean {
    return text.length >= 50 && !text.includes('[NULL]') && !AI_PATTERNS.some((p) => p.test(text));
  }

  private async addBubble(): Promise<number> {
    const fetcher = pickFetcher(ZEN_FETCHERS, this.disabledSources);
    const ctx = {
      language: this.language,
      isValidFact: (t: string) => this.isValidFact(t),
      pickCategory: () => this.pickCategory(),
    };

    const result = await fetcher.fetch(ctx);

    if (result && isArtResult(result)) {
      if (!this.pastFacts.some((p) => p.slice(0, 60) === result.caption.slice(0, 60))) {
        this.hideLoader();
        this.appendArtBubble(result.imageUrl, result.caption);
        this.pastFacts.push(result.caption);
        if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
        void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
        return this.durationMultiplier(result);
      }
    }

    if (result && isTextResult(result)) {
      const { text, link, icon, html } = result;
      if (!this.pastFacts.some((p) => p.slice(0, 60) === text.slice(0, 60))) {
        this.hideLoader();
        this.appendBubbleElement(text, link, icon, html);
        this.pastFacts.push(text);
        if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
        void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
        return this.durationMultiplier(result);
      }
    }

    const category = this.pickCategory();
    if (!category) return 1;
    const useStat = Math.random() < 0.1;

    try {
      const response = await chrome.runtime.sendMessage({
        type: useStat ? MSG.GENERATE_ZEN_STAT : MSG.GENERATE_ZEN_FACT,
        category,
        previousFacts: this.pastFacts.slice(-20),
        language: this.language,
      }) as { ok: boolean; fact?: string };

      if (
        response?.ok &&
        response.fact &&
        !response.fact.includes('[NULL]') &&
        response.fact.trim().length >= 50 &&
        !AI_PATTERNS.some((p) => p.test(response.fact!))
      ) {
        const isDuplicate = this.pastFacts.some(
          (p) => p === response.fact || p.slice(0, 60) === response.fact!.slice(0, 60),
        );
        if (isDuplicate) return 1;

        this.hideLoader();
        this.appendBubbleElement(response.fact);

        this.pastFacts.push(response.fact);
        if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
        void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
        return 1.3;
      }
    } catch {}

    return 1;
  }

  private async loadInitialBubbles(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.addBubble();
    }
  }

  private async dripZen(): Promise<void> {
    if (document.hidden || Date.now() - this.lastActivity > ZEN_IDLE_MS) {
      this.scheduleDrip();
      return;
    }
    const multiplier = await this.addBubble();
    this.trimOldBubbles();
    this.feedEl.scrollTo({ top: 0, behavior: 'smooth' });
    void this.cacheZenFeed();
    this.scheduleDrip(multiplier);
  }

  private trimOldBubbles(): void {
    const bubbles = this.feedEl.querySelectorAll<HTMLElement>('.zen-bubble');
    const excess = bubbles.length - ZEN_MAX_BUBBLES;
    for (let i = 0; i < excess; i++) {
      const old = bubbles[bubbles.length - 1 - i];
      old.style.transition = 'opacity 0.6s ease';
      old.style.opacity = '0';
      setTimeout(() => old.remove(), 600);
    }
  }

  private cacheZenFeed(): void {
    const items = Array.from(this.feedEl.querySelectorAll<HTMLElement>('.zen-bubble'))
      .map((el) => el.querySelector('span')?.textContent ?? '')
      .filter(Boolean);
    void chrome.storage.session.set({
      sonto_zen_feed: items,
      sonto_zen_last_drip: Date.now(),
    }).catch(() => {});
  }

  private appendBubbleElement(text: string, link?: string, icon?: string, html?: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    const linkHtml = link
      ? ` <a class="zen-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">↗</a>`
      : '';
    const innerContent = html ?? escapeHtml(text);
    bubble.innerHTML = `${icon ?? SVG_BULB}<span>${innerContent}${linkHtml}</span>`;
    const first = this.feedEl.firstChild;
    if (first) {
      this.feedEl.insertBefore(bubble, first);
    } else {
      this.feedEl.appendChild(bubble);
    }
    return bubble;
  }

  private appendArtBubble(imageUrl: string, caption: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    const sep = caption.includes(' · ') ? ' · ' : ' — ';
    const sepIdx = caption.indexOf(sep);
    const title = sepIdx !== -1 ? caption.slice(0, sepIdx) : caption;
    const sub = sepIdx !== -1 ? caption.slice(sepIdx + sep.length) : '';
    const subHtml = sub ? `<span class="zen-art-caption">${escapeHtml(sub)}</span>` : '';
    bubble.innerHTML = `<div class="zen-art"><img class="zen-art-img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" /><span class="zen-art-title">${escapeHtml(title)}</span>${subHtml}</div>`;
    const img = bubble.querySelector<HTMLImageElement>('.zen-art-img');
    if (img) {
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
    }
    const first = this.feedEl.firstChild;
    if (first) {
      this.feedEl.insertBefore(bubble, first);
    } else {
      this.feedEl.appendChild(bubble);
    }
    return bubble;
  }

  private showLoader(): void {
    let loader = this.feedEl.querySelector('.zen-loading');
    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'zen-loading';
      loader.innerHTML = '<div class="spinner"></div>';
      this.feedEl.prepend(loader);
    }
  }

  private hideLoader(): void {
    this.feedEl.querySelector('.zen-loading')?.remove();
  }

  invalidateCategories(): void {
    this.zenCategories = [];
    this.zenCategoryQueue = [];
    void chrome.storage.session.remove('sonto_zen_categories').catch(() => {});
  }
}
