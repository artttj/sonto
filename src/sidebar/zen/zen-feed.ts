// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../../shared/messages';
import { bumpZenSourceSignal, getDripInterval, getDisabledSources, getZenSourceSignals } from '../../shared/storage';
import type { SontoItem } from '../../shared/types';
import {
  AI_PATTERNS,
  SVG_BULB,
  ZEN_DRIP_MS,
  ZEN_IDLE_MS,
  ZEN_INITIAL_BATCH,
  ZEN_MAX_BUBBLES,
  escapeHtml,
} from './zen-content';
import { type ZenFetchResult, ZEN_FETCHERS, isArtResult, isTextResult, pickFetcherWithSignals } from './zen-fetchers';
import { translateText } from './translator';

const SVG_COPY = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1.2"/><path d="M1.5 7.5V1.5h6"/></svg>';
const SVG_SAVE = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 1.5h7v8L5.5 7 2 9.5z"/></svg>';
const SVG_ZENIFIED = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5c1 1.5 3 2.5 3 4.5a3 3 0 1 1-6 0c0-2 2-3 3-4.5z"/></svg>';

// 30% of zen feed bubbles come from user's zenified collection (spaced repetition)
const ZENIFIED_ITEM_PROBABILITY = 0.3;

export class ZenFeed {
  private pastFacts: string[] = [];
  private zenDripTimer: ReturnType<typeof setTimeout> | null = null;
  private dripIntervalMs = ZEN_DRIP_MS;
  private lastActivity = Date.now();
  private language: string;
  private _starting = false;
  private disabledSources = new Set<string>();
  private dripCount = 0;
  private sourceSignals: Record<string, number> = {};

  constructor(
    private readonly feedEl: HTMLElement,
    { language }: { language: string },
  ) {
    this.language = language;

    document.addEventListener('pointermove', () => { this.lastActivity = Date.now(); });
    document.addEventListener('keydown', () => { this.lastActivity = Date.now(); });

    this.feedEl.addEventListener('click', (e) => {
      const bubble = (e.target as HTMLElement).closest<HTMLElement>('.zen-bubble');
      if (!bubble) return;
      if ((e.target as HTMLElement).closest('.zen-copy')) return;
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
      const [disabled, intervalMs, sourceSignals] = await Promise.all([
        getDisabledSources(), getDripInterval(), getZenSourceSignals(),
      ]);
      this.disabledSources = new Set(disabled);
      this.dripIntervalMs = intervalMs;
      this.sourceSignals = sourceSignals;
    } catch {}

    try {
      const hasBubbles = this.feedEl.querySelectorAll('.zen-bubble').length > 0;
      if (hasBubbles) {
        this.scheduleDrip();
        return;
      }

      // Load fresh bubbles on each session for consistent content
      this.feedEl.innerHTML = '';
      this.showLoader();
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
    this.zenDripTimer = setTimeout(
      () => void this.dripZen(),
      Math.round(this.dripIntervalMs * multiplier),
    );
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

  setDripInterval(ms: number): void {
    this.dripIntervalMs = ms;
  }

  async restorePastFacts(): Promise<void> {
    try {
      const stored = await chrome.storage.session.get('sonto_past_facts');
      this.pastFacts = (stored?.sonto_past_facts as string[]) ?? [];
    } catch {}
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

  private async addBubble(): Promise<number> {
    this.dripCount++;

    if (Math.random() < ZENIFIED_ITEM_PROBABILITY) {
      const zenifiedItem = await this.getZenifiedItem();
      if (zenifiedItem) {
        this.hideLoader();
        this.appendZenifiedBubble(zenifiedItem);
        return 1.2;
      }
    }

    const fetcher = pickFetcherWithSignals(ZEN_FETCHERS, this.sourceSignals, this.disabledSources);

    const ctx = {
      language: this.language,
      isValidFact: (t: string) => this.isValidFact(t),
      pickCategory: () => null,
    };

    const result = await fetcher.fetch(ctx);

    if (result && isArtResult(result)) {
      if (!this.isDuplicate(result.caption)) {
        const caption = await translateText(result.caption, this.language);
        this.hideLoader();
        this.appendArtBubble(result.imageUrl, caption, result.link, fetcher.id, fetcher.label);
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
        this.appendBubbleElement(translated, link, icon, useHtml, fetcher.id, result.hideLabel ? undefined : fetcher.label);
        this.trackFact(text);
        return this.durationMultiplier(result);
      }
    }

    return 1;
  }

  private async getZenifiedItem(): Promise<SontoItem | null> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GET_ZENIFIED_ITEMS,
        limit: 10,
        excludeRecentMs: 24 * 60 * 60 * 1000,
      });
      if (!response?.ok || response.items.length === 0) return null;

      // Pick random from top candidates (spaced repetition)
      const candidates = response.items as SontoItem[];
      const pickIndex = Math.floor(Math.random() * Math.min(candidates.length, 3));
      const item = candidates[pickIndex];

      // Mark as seen
      void chrome.runtime.sendMessage({ type: MSG.MARK_ITEM_SEEN_IN_ZEN, id: item.id });

      return item;
    } catch {
      return null;
    }
  }

  private appendZenifiedBubble(item: SontoItem): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble zen-bubble--user';

    const content = item.content;
    const needsExpand = content.length > 280;
    const preview = needsExpand ? escapeHtml(content.slice(0, 280)) + '…' : escapeHtml(content);

    const tagsHtml = item.tags.length > 0
      ? `<span class="zen-user-tags">${item.tags.slice(0, 3).map((t) => escapeHtml(t)).join(' · ')}</span>`
      : '';

    const typeLabel = item.type === 'prompt' ? 'Prompt' : 'Saved';

    bubble.innerHTML = `
      ${SVG_ZENIFIED}
      <div class="zen-bubble-body">
        <div class="zen-bubble-text">${preview}</div>
        <span class="zen-source">${typeLabel} · from your collection</span>
        ${tagsHtml}
      </div>
    `;

    this.attachCopyButton(bubble, content);
    this.attachSaveButton(bubble, content, item.url);

    const first = this.feedEl.firstChild;
    if (first) {
      this.feedEl.insertBefore(bubble, first);
    } else {
      this.feedEl.appendChild(bubble);
    }

    return bubble;
  }

  private async loadInitialBubbles(count: number): Promise<void> {
    let loaded = 0;
    let attempts = 0;
    const maxAttempts = count * 3;

    while (loaded < count && attempts < maxAttempts) {
      await this.addBubble();
      loaded++;
      attempts++;
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
    const all = this.feedEl.querySelectorAll<HTMLElement>('.zen-bubble');
    const excess = all.length - ZEN_MAX_BUBBLES;
    let removed = 0;
    for (let i = all.length - 1; i >= 0 && removed < excess; i--) {
      const old = all[i];
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

  private attachCopyButton(bubble: HTMLElement, text: string, sourceId?: string): void {
    const btn = document.createElement('button');
    btn.className = 'zen-copy';
    btn.title = 'Copy';
    btn.setAttribute('aria-label', 'Copy text');
    btn.innerHTML = SVG_COPY;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(text).then(() => {
        if (sourceId) this.trackSourceSignal(sourceId, 2);
        btn.innerHTML = '✓';
        setTimeout(() => { btn.innerHTML = SVG_COPY; }, 1500);
      });
    });
    bubble.appendChild(btn);
  }

  private attachSaveButton(bubble: HTMLElement, text: string, link?: string): void {
    const btn = document.createElement('button');
    btn.className = 'zen-save';
    btn.title = 'Save to clipboard';
    btn.setAttribute('aria-label', 'Save to clipboard history');
    btn.innerHTML = SVG_SAVE;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void chrome.runtime.sendMessage({
        type: MSG.CAPTURE_CLIP,
        text,
        url: link,
        source: 'manual',
      }).then((res) => {
        btn.innerHTML = res?.ok ? '✓' : '!';
        setTimeout(() => { btn.innerHTML = SVG_SAVE; }, 1500);
      });
    });
    bubble.appendChild(btn);
  }

  private appendBubbleElement(text: string, link?: string, icon?: string, html?: string, sourceId?: string, source?: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'zen-bubble';
    if (html?.includes('zen-oblique')) bubble.classList.add('zen-bubble--oblique');
    if (!html && !link && !source && / [\u2014-] /.test(text)) bubble.classList.add('zen-bubble--quote');
    const linkHtml = link
      ? ` <a class="zen-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">↗</a>`
      : '';
    const innerContent = html ?? escapeHtml(text);
    const sourceHtml = source ? `<span class="zen-source">${escapeHtml(source)}</span>` : '';
    bubble.innerHTML = `${icon ?? SVG_BULB}<div class="zen-bubble-body"><div class="zen-bubble-text">${innerContent}${linkHtml}</div>${sourceHtml}</div>`;
    this.attachCopyButton(bubble, text, sourceId);
    this.attachSaveButton(bubble, text, link);
    this.attachSourceInteractions(bubble, sourceId);
    const first = this.feedEl.firstChild;
    if (first) {
      this.feedEl.insertBefore(bubble, first);
    } else {
      this.feedEl.appendChild(bubble);
    }
    return bubble;
  }

  private appendArtBubble(imageUrl: string, caption: string, link?: string, sourceId?: string, source?: string): HTMLElement {
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
    this.attachCopyButton(bubble, caption, sourceId);
    this.attachSaveButton(bubble, caption, link);
    this.attachSourceInteractions(bubble, sourceId);
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

  private attachSourceInteractions(bubble: HTMLElement, sourceId?: string): void {
    if (!sourceId) return;
    bubble.addEventListener('click', () => this.trackSourceSignal(sourceId, 1));
    bubble.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
      a.addEventListener('click', () => this.trackSourceSignal(sourceId, 2));
    });
  }

  private trackSourceSignal(sourceId: string, amount: number): void {
    this.sourceSignals[sourceId] = (this.sourceSignals[sourceId] ?? 0) + amount;
    void bumpZenSourceSignal(sourceId, amount).catch(() => {});
  }
}
