import { MSG } from '../shared/messages';
import { getDripInterval, getDisabledSources } from '../shared/storage';
import type { Snippet } from '../shared/types';
import { AI_PATTERNS, BLOCKED_CATEGORY_PATTERNS } from './zen/zen-content';
import { type ZenArtResult, type ZenFetchResult, type ZenTextResult, ZEN_FETCHERS, pickFetcher } from './zen/zen-fetchers';

const JUNK_PATTERNS = [
  /\bcookies?\b.*\b(consent|policy|notice|settings|preferences)\b/i,
  /\bprivacy policy\b/i,
  /\bterms (of service|of use|and conditions)\b/i,
  /\baccept all\b.*\bcookies?\b/i,
  /\bwe use cookies?\b/i,
  /^(home|about|contact|menu|navigation|search|log ?in|sign in|sign up|register|subscribe)\s*$/i,
];

const AM = Math.PI / 180;

function isArtResult(r: ZenFetchResult): r is ZenArtResult {
  return r !== null && 'imageUrl' in r;
}

function isTextResult(r: ZenFetchResult): r is ZenTextResult {
  return r !== null && 'text' in r;
}

interface SpiroParams {
  Crota: number; HBx: number; HBy: number; Hdist: number;
  Lrota: number; Larm1: number; Larm2: number;
  Rrota: number; Rarm1: number; Rarm2: number; Ext: number;
  Loffset?: number; // initial angle offset for left arm in degrees
}

// Dense center — from htmlspirograph.com/#0,50,4,0,1,0.8,-90,-535,631,-0.005,145,476,-3.2,142,501,3
const BASE_DENSE: SpiroParams = {
  Crota: 0.8, HBx: -90, HBy: -535, Hdist: 631,
  Lrota: -0.005, Larm1: 145, Larm2: 476,
  Rrota: -3.2, Rarm1: 142, Rarm2: 501, Ext: 3,
};

// Geometric lobe — from htmlspirograph.com/#0,50,0,0,1,-0.8,52,-760,508,0.0125,94,534,3.2,188,560,56,102
const BASE_DIAMOND: SpiroParams = {
  Crota: -0.8, HBx: 52, HBy: -760, Hdist: 508,
  Lrota: 0.0125, Larm1: 94, Larm2: 534,
  Rrota: 3.2, Rarm1: 188, Rarm2: 560, Ext: 56, Loffset: 102,
};

// Open ring — from htmlspirograph.com/#0,50,0,1,1,-1.44,30,-700,1174,2.5,120,860,-3.6,100,1050,75
const BASE_OPEN: SpiroParams = {
  Crota: -1.44, HBx: 30, HBy: -700, Hdist: 1174,
  Lrota: 2.5, Larm1: 120, Larm2: 860,
  Rrota: -3.6, Rarm1: 100, Rarm2: 1050, Ext: 75,
};

// Gallery patterns from htmlspirograph.com/uploads — used as fallbacks
const GALLERY_BASES: SpiroParams[] = [
  // #1,9,4,...,3.6,-17,-336,322,-12.6,140,290,-0.02353,79,317,78,18
  { Crota: 3.6, HBx: -17, HBy: -336, Hdist: 322, Lrota: -12.6, Larm1: 140, Larm2: 290, Rrota: -0.02353, Rarm1: 79, Rarm2: 317, Ext: 78, Loffset: 18 },
  // #0,200,0,...,0.4,-44,-232,288,-4.4,21,232,0.003571,129,325,67,331
  { Crota: 0.4, HBx: -44, HBy: -232, Hdist: 288, Lrota: -4.4, Larm1: 21, Larm2: 232, Rrota: 0.003571, Rarm1: 129, Rarm2: 325, Ext: 67, Loffset: 331 },
  // #0,200,4,...,0.91,-52,-203,317,4.1,93,313,3.8,127,327,80,156
  { Crota: 0.91, HBx: -52, HBy: -203, Hdist: 317, Lrota: 4.1, Larm1: 93, Larm2: 313, Rrota: 3.8, Rarm1: 127, Rarm2: 327, Ext: 80, Loffset: 156 },
  // #0,200,4,...,1,-76,-224,281,0.007692,98,299,-2.3333,104,332,75,7
  { Crota: 1, HBx: -76, HBy: -224, Hdist: 281, Lrota: 0.007692, Larm1: 98, Larm2: 299, Rrota: -2.3333, Rarm1: 104, Rarm2: 332, Ext: 75, Loffset: 7 },
];

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateDenseParams(): SpiroParams {
  for (let attempt = 0; attempt < 100; attempt++) {
    const Hdist = rnd(450, 780);
    const Larm1 = rnd(100, 200);
    const Rarm1 = rnd(100, 200);
    const DMin = Math.max(0, Hdist - Larm1 - Rarm1);
    const DMax = Hdist + Larm1 + Rarm1;

    if (DMin < 30) continue;

    const armSum = rnd(DMax + 40, DMax + 300);
    // Keep arm lengths close together for dense center fill (small void)
    const diffMax = Math.min(DMin - 20, armSum * 0.08);
    if (diffMax <= 0) continue;

    const armDiff = rnd(-diffMax, diffMax);
    const Larm2 = (armSum + armDiff) / 2;
    const Rarm2 = (armSum - armDiff) / 2;
    if (Larm2 < 100 || Rarm2 < 100) continue;

    const Crota = rnd(-2.5, 2.5);
    const Lrota = rnd(-4, 4);
    const Rrota = rnd(-4, 4);
    if (Math.abs(Crota) < 0.1 || Math.abs(Lrota) < 0.05 || Math.abs(Rrota) < 0.05) continue;
    // Avoid both rotation rates being nearly equal (produces degenerate straight lines)
    if (Math.abs(Math.abs(Lrota) - Math.abs(Rrota)) < 0.05) continue;

    const HBx = rnd(-100, 100);
    const HBy = rnd(-650, -400);
    const Ext = rnd(2, 60);

    return { Crota, HBx, HBy, Hdist, Lrota, Larm1, Larm2, Rrota, Rarm1, Rarm2, Ext };
  }
  return Math.random() < 0.5 ? { ...BASE_DENSE } : { ...GALLERY_BASES[2] };
}

function generateOpenParams(): SpiroParams {
  for (let attempt = 0; attempt < 100; attempt++) {
    const Hdist = rnd(700, 1400);
    const Larm1 = rnd(80, 180);
    const Rarm1 = rnd(80, 180);
    const DMin = Math.max(0, Hdist - Larm1 - Rarm1);
    const DMax = Hdist + Larm1 + Rarm1;

    if (DMin < 80) continue;

    const armSum = rnd(DMax + 80, DMax + 600);
    // Larger arm difference creates visible center void (open ring)
    const diffMax = Math.min(DMin * 0.45, armSum * 0.28);
    if (diffMax <= 10) continue;

    const armDiff = rnd(-diffMax, diffMax);
    const Larm2 = (armSum + armDiff) / 2;
    const Rarm2 = (armSum - armDiff) / 2;
    if (Larm2 < 80 || Rarm2 < 80) continue;

    const Crota = rnd(-2, 2);
    const Lrota = rnd(-4, 4);
    const Rrota = rnd(-4, 4);
    if (Math.abs(Crota) < 0.1 || Math.abs(Lrota) < 0.05 || Math.abs(Rrota) < 0.05) continue;
    if (Math.abs(Math.abs(Lrota) - Math.abs(Rrota)) < 0.05) continue;

    const HBx = rnd(-150, 150);
    const HBy = rnd(-900, -400);
    const Ext = rnd(10, 120);

    return { Crota, HBx, HBy, Hdist, Lrota, Larm1, Larm2, Rrota, Rarm1, Rarm2, Ext };
  }
  return { ...BASE_OPEN };
}

function generateGeometricParams(): SpiroParams {
  for (let attempt = 0; attempt < 100; attempt++) {
    const Hdist = rnd(400, 800);
    const Larm1 = rnd(60, 180);
    const Rarm1 = rnd(120, 240);
    const DMin = Math.max(0, Hdist - Larm1 - Rarm1);
    const DMax = Hdist + Larm1 + Rarm1;

    if (DMin < 30) continue;

    const armSum = rnd(DMax + 30, DMax + 350);
    const diffMax = Math.min(DMin - 10, armSum * 0.12);
    if (diffMax <= 5) continue;

    const armDiff = rnd(-diffMax, diffMax);
    const Larm2 = (armSum + armDiff) / 2;
    const Rarm2 = (armSum - armDiff) / 2;
    if (Larm2 < 60 || Rarm2 < 60) continue;

    const Crota = rnd(-1.5, 1.5);
    if (Math.abs(Crota) < 0.05) continue;
    // One very slow arm + one fast arm → lobe/petal patterns
    // Randomise which arm is slow to get varied compositions
    const slowRota = rnd(0.005, 0.06) * (Math.random() < 0.5 ? 1 : -1);
    const fastRota = rnd(1.5, 5) * (Math.random() < 0.5 ? 1 : -1);
    const [Lrota, Rrota] = Math.random() < 0.5 ? [slowRota, fastRota] : [fastRota, slowRota];

    const HBx = rnd(-80, 80);
    const HBy = rnd(-900, -500);
    const Ext = rnd(10, 100);
    const Loffset = rnd(0, 360);

    return { Crota, HBx, HBy, Hdist, Lrota, Larm1, Larm2, Rrota, Rarm1, Rarm2, Ext, Loffset };
  }
  const geomBases = [BASE_DIAMOND, GALLERY_BASES[0], GALLERY_BASES[1], GALLERY_BASES[3]];
  return { ...geomBases[Math.floor(Math.random() * geomBases.length)] };
}

class SpirographCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ro: ResizeObserver;
  private rafId = 0;
  private running = false;
  private resizeTimer = 0;
  private drawTimer = 0;
  private resolveStart: (() => void) | null = null;

  private style: 'dense' | 'open' | 'geometric' = 'dense';
  private stepsTotal = 0;
  private drawn = 0;
  private alpha = 0.20;

  // Original 960px canvas reference size
  private static readonly REF = 960;

  // Pantograph params (in original 960px units)
  private params: SpiroParams = { ...BASE_DENSE };

  // Rotation accumulators in degrees
  private Lrot = 0;
  private Rrot = 0;
  private Crot = 0;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    let skipFirst = true;
    this.ro = new ResizeObserver(() => {
      if (skipFirst) { skipFirst = false; return; }
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.stop(), 350);
    });
    this.ro.observe(container);
  }

  private resize(): void {
    this.canvas.width = this.canvas.offsetWidth || 300;
    this.canvas.height = this.canvas.offsetHeight || 400;
  }

  private calc(scale: number): { fx: number; fy: number; color: string } | null {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    const { HBx, HBy, Hdist, Larm1, Larm2, Rarm1, Rarm2, Ext } = this.params;

    // Scale spatial params from 960px to actual canvas size
    const s = scale;
    const handsX = cx + HBx * s;
    const handsY = cy + HBy * s;
    const H1X = handsX - (Hdist * s) / 2;
    const H1Y = handsY;
    const H2X = handsX + (Hdist * s) / 2;
    const H2Y = handsY;

    const H1arm1X = Math.cos(this.Lrot * AM) * (Larm1 * s) + H1X;
    const H1arm1Y = Math.sin(this.Lrot * AM) * (Larm1 * s) + H1Y;
    const H2arm1X = Math.cos(this.Rrot * AM) * (Rarm1 * s) + H2X;
    const H2arm1Y = Math.sin(this.Rrot * AM) * (Rarm1 * s) + H2Y;

    const dx = H2arm1X - H1arm1X;
    const dy = H2arm1Y - H1arm1Y;
    const D = Math.hypot(dx, dy);
    if (D < 1e-6) return null;

    const Larm2s = Larm2 * s;
    const Rarm2s = Rarm2 * s;

    const cosGamma = (Rarm2s * Rarm2s + Larm2s * Larm2s - D * D) / (2 * Rarm2s * Larm2s);
    if (cosGamma < -1 || cosGamma > 1) return null;

    const gamma = Math.acos(cosGamma);
    const sinAlpha = (Rarm2s * Math.sin(gamma)) / D;
    const sinBeta = (Larm2s * Math.sin(gamma)) / D;
    if (Math.abs(sinAlpha) > 1 || Math.abs(sinBeta) > 1) return null;

    let alpha = Math.asin(sinAlpha);
    let beta = Math.asin(sinBeta);

    const clampedDy = Math.max(-1, Math.min(1, dy / D));
    const delta = Math.asin(clampedDy);

    if (Larm2 > Rarm2) beta = Math.PI - alpha - gamma;
    if (Rarm2 > Larm2) alpha = Math.PI - beta - gamma;

    const H2a = Math.PI - (beta - delta);

    const DReX = H2arm1X + Math.cos(H2a) * ((Rarm2 + Ext) * s);
    const DReY = H2arm1Y + Math.sin(H2a) * ((Rarm2 + Ext) * s);

    // Apply canvas rotation (Crot) around center
    const nx = DReX - cx;
    const ny = DReY - cy;
    const nd = Math.hypot(nx, ny);
    if (nd === 0) return null;

    // No cutpixels — let canvas bounds clip naturally
    let na = Math.atan2(ny, nx);
    na += this.Crot * AM;

    const fx = cx + Math.cos(na) * nd;
    const fy = cy + Math.sin(na) * nd;

    // Analogue colormode with raised floor — never produces near-black strokes on dark bg
    // Range per channel: [81, 255] so every stroke is visibly colored
    const phase = this.Lrot * AM;
    const phase2 = this.Rrot * AM;
    const r = Math.round(Math.sin(phase) * 87 + 168);
    const g = Math.round(Math.sin(phase + Math.PI * 2 / 3) * 87 + 168);
    const b = Math.round(Math.sin(phase2 + Math.PI * 4 / 3) * 87 + 168);
    const color = `rgba(${r},${g},${b},${this.alpha})`;

    return { fx, fy, color };
  }

  start(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.resolveStart = resolve;

      const roll = Math.random();
      this.style = roll < 0.34 ? 'dense' : roll < 0.67 ? 'open' : 'geometric';
      this.params = this.style === 'dense'
        ? generateDenseParams()
        : this.style === 'open'
          ? generateOpenParams()
          : generateGeometricParams();
      this.Lrot = this.params.Loffset ?? 0;
      this.Rrot = 0;
      this.Crot = 0;
      this.drawn = 0;

      this.alpha = this.style === 'dense' ? 0.38 : this.style === 'open' ? 0.42 : 0.38;

      const DRAW_MS = Math.min(durationMs, 3000);
      const fps = 30;
      const frames = Math.round(DRAW_MS / 1000 * fps);
      let stepsPerFrame: number;

      if (this.style === 'geometric') {
        const slowSpeed = Math.max(0.01, Math.min(Math.abs(this.params.Lrota), Math.abs(this.params.Rrota)));
        const targetSteps = Math.round(60 / slowSpeed);
        stepsPerFrame = Math.max(20, Math.min(300, Math.ceil(targetSteps / frames)));
      } else {
        stepsPerFrame = this.style === 'dense' ? 50 : 20;
      }
      this.stepsTotal = stepsPerFrame * frames;

      this.resize();
      const scale = Math.min(this.canvas.width, this.canvas.height) / SpirographCanvas.REF / 1.35;

      this.ctx.globalCompositeOperation = 'screen';
      this.ctx.fillStyle = '#060410';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.lineWidth = this.style === 'dense' ? 0.6 : 0.8;

      this.running = true;
      let prevPt: { fx: number; fy: number } | null = null;

      // Resolve via setTimeout — immune to RAF throttling in background/inactive panels
      this.drawTimer = window.setTimeout(() => {
        this.running = false;
        const res = this.resolveStart;
        this.resolveStart = null;
        res?.();
      }, durationMs);

      const tick = () => {
        if (!this.running) {
          const res = this.resolveStart;
          this.resolveStart = null;
          res?.();
          return;
        }

        for (let i = 0; i < stepsPerFrame && this.drawn < this.stepsTotal; i++) {
          this.Lrot = (this.Lrot + this.params.Lrota + 360) % 360;
          this.Rrot = (this.Rrot + this.params.Rrota + 360) % 360;
          this.Crot = (this.Crot + this.params.Crota + 360) % 360;
          this.drawn++;

          const pt = this.calc(scale);
          if (pt) {
            if (prevPt) {
              this.ctx.beginPath();
              this.ctx.strokeStyle = pt.color;
              this.ctx.moveTo(prevPt.fx, prevPt.fy);
              this.ctx.lineTo(pt.fx, pt.fy);
              this.ctx.stroke();
            }
            prevPt = { fx: pt.fx, fy: pt.fy };
          } else {
            prevPt = null;
          }
        }

        this.rafId = requestAnimationFrame(tick);
      };

      this.rafId = requestAnimationFrame(tick);
    });
  }

  fadeOut(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const snap = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      const tick = () => {
        const p = Math.min(1, (Date.now() - start) / ms);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalAlpha = 1 - p;
        this.ctx.putImageData(snap, 0, 0);
        this.ctx.globalAlpha = 1;
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.drawTimer);
    const res = this.resolveStart;
    this.resolveStart = null;
    res?.();
  }

  remove(): void {
    this.stop();
    this.ro.disconnect();
    clearTimeout(this.resizeTimer);
    this.canvas.remove();
  }
}

async function fadeEl(el: HTMLElement, from: number, to: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      el.style.opacity = String(from + (to - from) * p);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

export class CosmosMode {
  private stopped = false;
  private spiro: SpirographCanvas | null = null;
  private pastKeys = new Set<string>();
  private pastFacts: string[] = [];
  private disabledSources = new Set<string>();
  private intervalMs = 15000;
  private zenCategories: string[] = [];
  private zenCategoryQueue: string[] = [];
  private snippetsFn: () => Snippet[] = () => [];

  private readonly canvasWrap: HTMLElement;
  private readonly msgEl: HTMLElement;

  constructor(container: HTMLElement, private language: string) {
    container.innerHTML = '';

    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'cosmos-canvas-wrap';

    this.msgEl = document.createElement('div');
    this.msgEl.className = 'cosmos-message';
    this.msgEl.style.opacity = '0';

    container.appendChild(this.canvasWrap);
    container.appendChild(this.msgEl);
  }

  stop(): void {
    this.stopped = true;
    this.spiro?.stop();
  }

  refresh(snippets: Snippet[], language: string): void {
    this.language = language;
    this.snippetsFn = () => snippets;
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    // restart the current cycle so the new interval takes effect
    this.spiro?.stop();
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      const [disabled, ms] = await Promise.all([getDisabledSources(), getDripInterval()]);
      this.disabledSources = new Set(disabled);
      this.intervalMs = ms;
    } catch { /* use defaults */ }

    void this.extractCategories(this.snippetsFn());
    void this.runLoop();
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

  private async extractCategories(snippets: Snippet[]): Promise<void> {
    if (this.zenCategories.length > 0) return;

    try {
      const cached = await chrome.storage.session.get('sonto_zen_categories');
      if (Array.isArray(cached?.sonto_zen_categories) && (cached.sonto_zen_categories as unknown[]).length > 0) {
        this.zenCategories = cached.sonto_zen_categories as string[];
        return;
      }
    } catch {}

    if (snippets.length === 0) return;

    const valid = snippets.filter((s) => !JUNK_PATTERNS.some((p) => p.test(`${s.title} ${s.text}`)));
    const manual = valid.filter((s) => s.source !== 'history');
    const history = valid.filter((s) => s.source === 'history').sort(() => Math.random() - 0.5).slice(0, 200);
    const sample = [...manual, ...history].slice(0, 250).map((s) => ({
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

  private async fetchNext(): Promise<[ZenFetchResult, string | null]> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const fetcher = pickFetcher(ZEN_FETCHERS, this.disabledSources);
      try {
        const result = await fetcher.fetch({
          language: this.language,
          isValidFact: (text) => {
            if (!text || text.length < 10 || text.length > 500) return false;
            if (this.pastKeys.has(text.slice(0, 80))) return false;
            return true;
          },
          pickCategory: () => this.pickCategory(),
        });
        if (result) {
          const key = isTextResult(result) ? result.text.slice(0, 80) : result.imageUrl;
          if (!this.pastKeys.has(key)) {
            this.pastKeys.add(key);
            if (this.pastKeys.size > 50) {
              const first = this.pastKeys.values().next().value;
              if (first) this.pastKeys.delete(first);
            }
            return [result, fetcher.label];
          }
        }
      } catch { /* try next */ }
    }

    // Fallback: generate an LLM fact based on user history categories
    const category = this.pickCategory();
    if (category) {
      try {
        const useStat = Math.random() < 0.1;
        const response = await chrome.runtime.sendMessage({
          type: useStat ? MSG.GENERATE_ZEN_STAT : MSG.GENERATE_ZEN_FACT,
          category,
          previousFacts: this.pastFacts.slice(-20),
          language: this.language,
        }) as { ok: boolean; fact?: string };

        if (
          response?.ok && response.fact &&
          !response.fact.includes('[NULL]') &&
          response.fact.trim().length >= 50 &&
          !AI_PATTERNS.some((p) => p.test(response.fact!)) &&
          !this.pastKeys.has(response.fact.slice(0, 80))
        ) {
          this.pastKeys.add(response.fact.slice(0, 80));
          this.pastFacts.push(response.fact);
          if (this.pastFacts.length > 30) this.pastFacts = this.pastFacts.slice(-30);
          return [{ text: response.fact }, null];
        }
      } catch {}
    }

    return [null, null];
  }

  private renderResult(result: ZenFetchResult, source: string | null): void {
    this.msgEl.innerHTML = '';

    if (!result) {
      const el = document.createElement('div');
      el.className = 'cosmos-text';
      el.textContent = '✦';
      this.msgEl.appendChild(el);
      return;
    }

    if (isArtResult(result)) {
      const sep = result.caption.includes(' · ') ? ' · ' : ' — ';
      const sepIdx = result.caption.indexOf(sep);
      const title = sepIdx !== -1 ? result.caption.slice(0, sepIdx) : result.caption;
      const sub = sepIdx !== -1 ? result.caption.slice(sepIdx + sep.length) : '';

      const img = document.createElement('img');
      img.className = 'cosmos-art-img';
      img.src = result.imageUrl;
      img.alt = result.caption;
      img.addEventListener('error', () => img.remove(), { once: true });

      const titleEl = document.createElement('div');
      titleEl.className = 'cosmos-art-title';
      titleEl.textContent = title;

      this.msgEl.appendChild(img);
      this.msgEl.appendChild(titleEl);

      if (sub) {
        const cap = document.createElement('div');
        cap.className = 'cosmos-art-caption';
        cap.textContent = sub;
        this.msgEl.appendChild(cap);
      }
      return;
    }

    if (isTextResult(result)) {
      if (result.icon) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'cosmos-icon';
        iconWrap.innerHTML = result.icon;
        this.msgEl.appendChild(iconWrap);
      }

      const textEl = document.createElement('div');
      textEl.className = 'cosmos-text';
      if (result.html) {
        textEl.innerHTML = result.html;
      } else {
        textEl.textContent = result.text;
      }
      this.msgEl.appendChild(textEl);

      if (result.link) {
        const link = document.createElement('a');
        link.className = 'cosmos-link';
        link.href = result.link;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Read more';
        this.msgEl.appendChild(link);
      }
    }

    if (source) {
      const srcEl = document.createElement('div');
      srcEl.className = 'cosmos-source';
      srcEl.textContent = source;
      this.msgEl.appendChild(srcEl);
    }
  }

  private async runLoop(): Promise<void> {
    if (this.stopped) return;

    const FADE_MS = 500;

    // Spiro and content fetch start simultaneously — spiro draws for 3s then holds
    this.spiro?.remove();
    this.spiro = new SpirographCanvas(this.canvasWrap);
    const spiroPromise = this.spiro.start(this.intervalMs);

    const [result, source] = await this.fetchNext();
    if (this.stopped) { this.spiro.stop(); return; }

    this.renderResult(result, source);
    await fadeEl(this.msgEl, 0, 1, FADE_MS);
    if (this.stopped) { this.spiro.stop(); return; }

    // Wait for spiro's full display window to expire
    await spiroPromise;
    if (this.stopped) return;

    // Fade message and spiro out together
    await Promise.all([
      fadeEl(this.msgEl, 1, 0, FADE_MS),
      this.spiro.fadeOut(FADE_MS),
    ]);
    if (this.stopped) return;

    this.spiro.remove();
    this.spiro = null;

    void this.runLoop();
  }
}
