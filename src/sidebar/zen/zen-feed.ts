// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

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
  escapeHtml,
} from './zen-content';
import { type ZenFetchResult, ZEN_FETCHERS, isArtResult, isTextResult, pickFetcher } from './zen-fetchers';
import { translateText } from './translator';
import { JUNK_PATTERNS } from './zen-shared';

const SVG_PIN = [
  '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">',
  '<path d="M5.5 1L7 4.5H10L7.5 6.5l1 3.5L5.5 8 2 10l1-3.5L.5 4.5H4z"/>',
  '</svg>',
].join('');

const SVG_PIN_FILLED = [
  '<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" stroke="none">',
  '<path d="M5.5 1L7 4.5H10L7.5 6.5l1 3.5L5.5 8 2 10l1-3.5L.5 4.5H4z"/>',
  '</svg>',
].join('');

const SVG_RESURFACE = [
  '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">',
  '<circle cx="6.5" cy="6.5" r="5"/>',
  '<path d="M6.5 3.5v3l2 1.5"/>',
  '</svg>',
].join('');

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
  private dripCount = 0;

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
      if ((e.target as HTMLElement).closest('.zen-copy, .zen-pin')) return;
      const isSpotlit = bubble.classList.contains('spotlight');
      this.feedEl.querySelectorAll('.zen-bubble').forEach((b) => b.classList.remove('spotlight'));
      if (!isSpotlit) bubble.classList.add('spotlight');
    });
  }

  async start(): Promise<void> {
    if (this._starting) return;

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

      if (raw.length > 0) {
        this.feedEl.innerHTML = '';
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

  setDripInterval(ms: number): void {
    this.dripIntervalMs = ms;
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

  private isDuplicate(text: string): boolean {
    return this.pastFacts.some((p) => p.slice(0, 60) === text.slice(0, 60));
  }

  private trackFact(text: string): void {
    this.pastFacts.push(text);
    if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
    void chrome.storage.session.set({ sonto_past_facts: this.pastFacts }).catch(() => {});
  }

  private isValidFact(text: string): boolean {
    return text.length >= 50 && !text.includes('[NULL]') && !AI_PATTERNS.some((p) => p.test(text));
  }

  private pickResurfaceSnippet(): Snippet | null {
    const snippets = this.snippetsFn().filter((s) =>
      s.source !== 'history' &&
      s.text.length >= 60 &&
      !this.pastFacts.some((p) => p.slice(0, 60) === s.text.slice(0, 60)),
    );
    if (snippets.length === 0) return null;
    return snippets[Math.floor(Math.random() * Math.min(snippets.length, 20))];
  }

  private async addResurfaceBubble(): Promise<number> {
    const snippet = this.pickResurfaceSnippet();
    if (!snippet) return 1;

    const daysAgo = Math.round((Date.now() - snippet.timestamp) / 86400000);
    const timeLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

    this.hideLoader();
    const bubble = this.appendBubbleElement(
      snippet.text.slice(0, 300),
      snippet.url,
      SVG_RESURFACE,
      undefined,
      `From your saves · ${timeLabel}`,
    );
    bubble.classList.add('zen-resurface');

    this.trackFact(snippet.text);
    return 1.4;
  }

  private async addBubble(): Promise<number> {
    this.dripCount++;

    if (this.dripCount % 5 === 0) {
      const resurfaced = await this.addResurfaceBubble();
      if (resurfaced > 1) return resurfaced;
    }

    const fetcher = pickFetcher(ZEN_FETCHERS, this.disabledSources);
    const ctx = {
      language: this.language,
      isValidFact: (t: string) => this.isValidFact(t),
      pickCategory: () => this.pickCategory(),
    };

    const result = await fetcher.fetch(ctx);

    if (result && isArtResult(result)) {
      if (!this.isDuplicate(result.caption)) {
        const caption = await translateText(result.caption, this.language);
        this.hideLoader();
        this.appendArtBubble(result.imageUrl, caption, result.link, fetcher.label);
        this.trackFact(result.caption);
        return this.durationMultiplier(result);
      }
    }

    if (result && isTextResult(result)) {
      const { text, link, icon, html } = result;
      if (!this.isDuplicate(text)) {
        const translated = await translateText(text, this.language);
        const useHtml = translated === text ? html : undefined;
        this.hideLoader();
        this.appendBubbleElement(translated, link, icon, useHtml, result.hideLabel ? undefined : fetcher.label);
        this.trackFact(text);
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
        if (this.isDuplicate(response.fact)) return 1;

        this.hideLoader();
        this.appendBubbleElement(response.fact);
        this.trackFact(response.fact);
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
    try {
      if (document.hidden || Date.now() - this.lastActivity > ZEN_IDLE_MS) {
        this.scheduleDrip();
        return;
      }
      const multiplier = await this.addBubble();
      this.trimOldBubbles();
      this.feedEl.scrollTo({ top: 0, behavior: 'smooth' });
      void this.cacheZenFeed();
      this.scheduleDrip(multiplier);
    } catch {
      this.scheduleDrip();
    }
  }

  private trimOldBubbles(): void {
    const bubbles = this.feedEl.querySelectorAll<HTMLElement>('.zen-bubble:not(.zen-pinned)');
    const all = this.feedEl.querySelectorAll<HTMLElement>('.zen-bubble');
    const excess = all.length - ZEN_MAX_BUBBLES;
    let removed = 0;
    for (let i = bubbles.length - 1; i >= 0 && removed < excess; i--) {
      const old = bubbles[i];
      old.style.transition = 'opacity 0.6s ease';
      old.style.opacity = '0';
      setTimeout(() => old.remove(), 600);
      removed++;
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

  private attachCopyButton(bubble: HTMLElement, text: string): void {
    const btn = document.createElement('button');
    btn.className = 'zen-copy';
    btn.title = 'Copy';
    btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1.2"/><path d="M1.5 7.5V1.5h6"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '✓';
        setTimeout(() => {
          btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1.2"/><path d="M1.5 7.5V1.5h6"/></svg>';
        }, 1500);
      });
    });
    bubble.appendChild(btn);
  }

  private attachPinButton(bubble: HTMLElement, text: string, url?: string): void {
    const btn = document.createElement('button');
    btn.className = 'zen-pin';
    btn.title = 'Pin to favorites';
    btn.innerHTML = SVG_PIN;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (bubble.classList.contains('zen-pinned')) return;
      bubble.classList.add('zen-pinned');
      btn.innerHTML = SVG_PIN_FILLED;
      btn.title = 'Pinned';

      await chrome.runtime.sendMessage({
        type: MSG.CAPTURE_SNIPPET,
        text: text.slice(0, 500),
        url: url ?? location.href,
        title: 'Pinned from Zen feed',
        pinned: true,
      }).catch(() => {});
    });

    bubble.appendChild(btn);
  }

  private appendBubbleElement(text: string, link?: string, icon?: string, html?: string, source?: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    if (html?.includes('zen-oblique')) bubble.classList.add('zen-bubble--oblique');
    if (!html && !link && !source && / [\u2014-] /.test(text)) bubble.classList.add('zen-bubble--quote');
    const linkHtml = link
      ? ` <a class="zen-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">↗</a>`
      : '';
    const innerContent = html ?? escapeHtml(text);
    const sourceHtml = source ? `<span class="zen-source">${escapeHtml(source)}</span>` : '';
    bubble.innerHTML = `${icon ?? SVG_BULB}<div class="zen-bubble-body"><span>${innerContent}${linkHtml}</span>${sourceHtml}</div>`;
    this.attachCopyButton(bubble, text);
    this.attachPinButton(bubble, text, link);
    const first = this.feedEl.firstChild;
    if (first) {
      this.feedEl.insertBefore(bubble, first);
    } else {
      this.feedEl.appendChild(bubble);
    }
    return bubble;
  }

  private appendArtBubble(imageUrl: string, caption: string, link?: string, source?: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    const sep = caption.includes(' · ') ? ' · ' : ' — ';
    const sepIdx = caption.indexOf(sep);
    const title = sepIdx !== -1 ? caption.slice(0, sepIdx) : caption;
    const sub = sepIdx !== -1 ? caption.slice(sepIdx + sep.length) : '';
    const subHtml = sub ? `<span class="zen-art-caption">${escapeHtml(sub)}</span>` : '';
    const linkHtml = link ? ` <a class="zen-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">↗</a>` : '';
    const imgHtml = link
      ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="zen-art-img-link"><img class="zen-art-img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" /></a>`
      : `<img class="zen-art-img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`;
    const sourceHtml = source ? `<span class="zen-source">${escapeHtml(source)}</span>` : '';
    bubble.innerHTML = `<div class="zen-art">${imgHtml}<span class="zen-art-title">${escapeHtml(title)}${linkHtml}</span>${subHtml}${sourceHtml}</div>`;
    const img = bubble.querySelector<HTMLImageElement>('.zen-art-img');
    if (img) {
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => (img.closest('.zen-art-img-link') ?? img).remove(), { once: true });
    }
    this.attachCopyButton(bubble, caption);
    this.attachPinButton(bubble, caption, link);
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
