// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { getDripInterval, getDisabledSources, getTheme } from '../shared/storage';
import { translateText } from './zen/translator';
import { type ZenFetchResult, ZEN_FETCHERS, isArtResult, isTextResult, pickFetcher } from './zen/zen-fetchers';

const AM = Math.PI / 180;

interface SpiroParams {
  Crota: number; HBx: number; HBy: number; Hdist: number;
  Lrota: number; Larm1: number; Larm2: number;
  Rrota: number; Rarm1: number; Rarm2: number; Ext: number;
  Loffset?: number;
}

const BASE_DENSE: SpiroParams = {
  Crota: 0.8, HBx: -90, HBy: -535, Hdist: 631,
  Lrota: -0.005, Larm1: 145, Larm2: 476,
  Rrota: -3.2, Rarm1: 142, Rarm2: 501, Ext: 3,
};

const BASE_DIAMOND: SpiroParams = {
  Crota: -0.8, HBx: 52, HBy: -760, Hdist: 508,
  Lrota: 0.0125, Larm1: 94, Larm2: 534,
  Rrota: 3.2, Rarm1: 188, Rarm2: 560, Ext: 56, Loffset: 102,
};

const BASE_OPEN: SpiroParams = {
  Crota: -1.44, HBx: 30, HBy: -700, Hdist: 1174,
  Lrota: 2.5, Larm1: 120, Larm2: 860,
  Rrota: -3.6, Rarm1: 100, Rarm2: 1050, Ext: 75,
};

const GALLERY_BASES: SpiroParams[] = [
  { Crota: 3.6, HBx: -17, HBy: -336, Hdist: 322, Lrota: -12.6, Larm1: 140, Larm2: 290, Rrota: -0.02353, Rarm1: 79, Rarm2: 317, Ext: 78, Loffset: 18 },
  { Crota: 0.4, HBx: -44, HBy: -232, Hdist: 288, Lrota: -4.4, Larm1: 21, Larm2: 232, Rrota: 0.003571, Rarm1: 129, Rarm2: 325, Ext: 67, Loffset: 331 },
  { Crota: 0.91, HBx: -52, HBy: -203, Hdist: 317, Lrota: 4.1, Larm1: 93, Larm2: 313, Rrota: 3.8, Rarm1: 127, Rarm2: 327, Ext: 80, Loffset: 156 },
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
    const diffMax = Math.min(DMin - 20, armSum * 0.08);
    if (diffMax <= 0) continue;

    const armDiff = rnd(-diffMax, diffMax);
    const Larm2 = (armSum + armDiff) / 2;
    const Rarm2 = (armSum - armDiff) / 2;
    if (Larm2 < 100 || Rarm2 < 100) continue;

    const Crota = rnd(-3.5, 3.5);
    const Lrota = rnd(-6, 6);
    const Rrota = rnd(-6, 6);
    if (Math.abs(Crota) < 0.1 || Math.abs(Lrota) < 0.05 || Math.abs(Rrota) < 0.05) continue;
    if (Math.abs(Math.abs(Lrota) - Math.abs(Rrota)) < 0.05) continue;

    const HBx = rnd(-100, 100);
    const HBy = rnd(-650, -400);
    const Ext = rnd(5, 90);

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

    const Crota = rnd(-3, 3);
    const Lrota = rnd(-6, 6);
    const Rrota = rnd(-6, 6);
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
  private removed = false;

  private style: 'dense' | 'open' | 'geometric' = 'dense';
  private stepsTotal = 0;
  private drawn = 0;
  private alpha = 0.20;
  private light = false;

  // Original 960px canvas reference size
  private static readonly REF = 960;

  // Pantograph params (in original 960px units)
  private params: SpiroParams = { ...BASE_DENSE };

  // Rotation accumulators in degrees
  private Lrot = 0;
  private Rrot = 0;
  private Crot = 0;

  constructor(container: HTMLElement, light = false) {
    this.light = light;
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

    const phase = this.Lrot * AM;
    const phase2 = this.Rrot * AM;
    let r: number, g: number, b: number;
    if (this.light) {
      r = Math.round(Math.sin(phase) * 55 + 170);
      g = Math.round(Math.sin(phase + Math.PI * 2 / 3) * 55 + 150);
      b = Math.round(Math.sin(phase2 + Math.PI * 4 / 3) * 55 + 200);
    } else {
      r = Math.round(Math.sin(phase) * 87 + 168);
      g = Math.round(Math.sin(phase + Math.PI * 2 / 3) * 87 + 168);
      b = Math.round(Math.sin(phase2 + Math.PI * 4 / 3) * 87 + 168);
    }
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

      if (this.light) {
        this.alpha = this.style === 'dense' ? 0.4 : this.style === 'open' ? 0.45 : 0.4;
      } else {
        this.alpha = this.style === 'dense' ? 0.38 : this.style === 'open' ? 0.42 : 0.38;
      }

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

      this.ctx.globalCompositeOperation = this.light ? 'source-over' : 'screen';
      this.ctx.fillStyle = this.light ? '#f0ede8' : '#060410';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const baseWidth = this.style === 'dense' ? 0.6 : 0.8;
      this.ctx.lineWidth = this.light ? baseWidth * 1.2 : baseWidth;

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
      this.canvas.style.transition = `opacity ${ms}ms ease`;
      this.canvas.style.opacity = '0';
      const done = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.style.transition = '';
        this.canvas.style.opacity = '1';
        resolve();
      };
      setTimeout(done, ms);
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

  setLight(light: boolean): void {
    this.light = light;
  }

  remove(): void {
    this.stop();
    this.ro.disconnect();
    clearTimeout(this.resizeTimer);
    this.canvas.remove();
    this.removed = true;
  }

  isRemoved(): boolean {
    return this.removed;
  }
}

async function fadeEl(el: HTMLElement, from: number, to: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    el.style.opacity = String(from);
    el.style.transition = `opacity ${ms}ms ease`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = String(to);
      });
    });
    setTimeout(() => {
      el.style.transition = '';
      el.style.opacity = String(to);
      resolve();
    }, ms + 50);
  });
}

interface HistoryItem {
  result: ZenFetchResult;
  source: string | null;
  timestamp: number;
}

export class CosmosMode {
  private stopped = false;
  private spiro: SpirographCanvas | null = null;
  private pastKeys = new Set<string>();
  private pastFacts: string[] = [];
  private disabledSources = new Set<string>();
  private intervalMs = 15000;
  private history: HistoryItem[] = [];
  private currentIndex = -1;
  private isNavigating = false;
  private autoAdvanceTimer: number | null = null;

  private readonly canvasWrap: HTMLElement;
  private readonly msgEl: HTMLElement;
  private readonly navWrap: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;

  constructor(container: HTMLElement, private language: string) {
    container.innerHTML = '';

    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'cosmos-canvas-wrap';

    this.msgEl = document.createElement('div');
    this.msgEl.className = 'cosmos-message';
    this.msgEl.style.opacity = '0';

    this.navWrap = document.createElement('div');
    this.navWrap.className = 'cosmos-nav-wrap';

    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'cosmos-nav-btn cosmos-nav-prev';
    this.prevBtn.disabled = true;
    this.prevBtn.setAttribute('aria-label', 'Previous');
    this.prevBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l-8 8 8 8"/></svg>`;

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'cosmos-nav-btn cosmos-nav-next';
    this.nextBtn.disabled = true;
    this.nextBtn.setAttribute('aria-label', 'Next');
    this.nextBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4l8 8-8 8"/></svg>`;

    this.navWrap.appendChild(this.prevBtn);
    this.navWrap.appendChild(this.nextBtn);

    container.appendChild(this.canvasWrap);
    container.appendChild(this.msgEl);
    container.appendChild(this.navWrap);

    this.prevBtn.addEventListener('click', () => this.navigate(-1));
    this.nextBtn.addEventListener('click', () => this.navigate(1));
    this.setupKeyboardNav();
  }

  stop(): void {
    this.stopped = true;
    this.isNavigating = false;
    this.spiro?.stop();
    this.clearAutoAdvance();
  }

  setTheme(theme: 'dark' | 'light'): void {
    const isLight = theme === 'light';
    this.spiro?.setLight(isLight);
  }

  private clearAutoAdvance(): void {
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private setupKeyboardNav(): void {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigate(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigate(1);
      }
    };
    document.addEventListener('keydown', handler);
  }

  private navigate(direction: -1 | 1): void {
    if (this.history.length === 0) return;

    const newIndex = this.currentIndex + direction;
    if (newIndex < 0 || newIndex >= this.history.length) return;

    this.isNavigating = true;
    this.clearAutoAdvance();
    void this.showHistoryItem(newIndex);
  }

  private async showHistoryItem(index: number): Promise<void> {
    this.currentIndex = index;
    const item = this.history[index];
    this.updateNavButtons();

    const FADE_MS = 300;

    await fadeEl(this.msgEl, 1, 0, FADE_MS);
    if (this.stopped) return;

    const skipSpiro = !item.result
      || !isTextResult(item.result)
      || (item.result.html?.includes('zen-haiku') ?? false)
      || (item.result.html?.includes('zen-oblique') ?? false);

    await this.renderResult(item.result, item.source);
    await fadeEl(this.msgEl, 0, 1, FADE_MS);
    if (this.stopped) return;

    if (!skipSpiro && !this.spiro) {
      const theme = await getTheme();
      this.spiro = new SpirographCanvas(this.canvasWrap, theme === 'light');
      const spiroPromise = this.spiro.start(this.intervalMs);
      await spiroPromise;
    } else if (!skipSpiro && this.spiro) {
      const spiroPromise = this.spiro.start(this.intervalMs);
      await spiroPromise;
    }

    if (this.isNavigating && index === this.history.length - 1) {
      this.isNavigating = false;
      void this.runLoop();
    }
  }

  private updateNavButtons(): void {
    this.prevBtn.disabled = this.currentIndex <= 0;
    this.nextBtn.disabled = this.currentIndex >= this.history.length - 1;

    this.prevBtn.style.opacity = this.currentIndex <= 0 ? '0.3' : '1';
    this.nextBtn.style.opacity = this.currentIndex >= this.history.length - 1 ? '0.3' : '1';
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    this.stopped = true;
    this.spiro?.stop();
    void this.restartLoop();
  }

  private async restartLoop(): Promise<void> {
    await new Promise((r) => setTimeout(r, 50));
    this.stopped = false;
    void this.runLoop();
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      const [disabled, ms] = await Promise.all([getDisabledSources(), getDripInterval()]);
      this.disabledSources = new Set(disabled);
      this.intervalMs = ms;
    } catch { /* use defaults */ }

    void this.runLoop();
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
          pickCategory: () => null,
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

    return [null, null];
  }

  private async renderResult(result: ZenFetchResult, source: string | null): Promise<void> {
    this.msgEl.innerHTML = '';

    if (!result) return;

    if (isTextResult(result) && !result.text?.trim() && !result.html?.trim()) return;

    if (isArtResult(result)) {
      const caption = await translateText(result.caption, this.language);
      const sep = caption.includes(' · ') ? ' · ' : ' — ';
      const sepIdx = caption.indexOf(sep);
      const title = sepIdx !== -1 ? caption.slice(0, sepIdx) : caption;
      const sub = sepIdx !== -1 ? caption.slice(sepIdx + sep.length) : '';

      const img = document.createElement('img');
      img.className = 'cosmos-art-img';
      img.src = result.imageUrl;
      img.alt = result.caption;
      img.addEventListener('load', () => img.classList.add('loaded'));
      img.addEventListener('error', () => img.remove(), { once: true });

      if (result.link) {
        const imgLink = document.createElement('a');
        imgLink.href = result.link;
        imgLink.target = '_blank';
        imgLink.rel = 'noopener';
        imgLink.appendChild(img);
        this.msgEl.appendChild(imgLink);
      } else {
        this.msgEl.appendChild(img);
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'cosmos-art-title';
      titleEl.textContent = title;
      this.msgEl.appendChild(titleEl);

      if (sub) {
        const cap = document.createElement('div');
        cap.className = 'cosmos-art-caption';
        cap.textContent = sub;
        this.msgEl.appendChild(cap);
      }

      if (result.link) {
        const link = document.createElement('a');
        link.className = 'cosmos-link';
        link.href = result.link;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Read more';
        this.msgEl.appendChild(link);
      }
    } else if (isTextResult(result)) {
      if (result.icon) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'cosmos-icon';
        iconWrap.innerHTML = result.icon;
        this.msgEl.appendChild(iconWrap);
      }

      const translated = await translateText(result.text, this.language);
      const textEl = document.createElement('div');
      textEl.className = 'cosmos-text';
      if (result.html && translated !== result.text) {
        textEl.textContent = translated;
      } else if (result.html) {
        textEl.innerHTML = result.html;
      } else {
        textEl.textContent = translated;
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

    const hideLabel = isTextResult(result) && result.hideLabel;
    if (source && !hideLabel) {
      const srcEl = document.createElement('div');
      srcEl.className = 'cosmos-source';
      srcEl.textContent = source;
      this.msgEl.appendChild(srcEl);
    }

    const saveText = isArtResult(result) ? result.caption : isTextResult(result) ? result.text : '';
    const saveLink = isArtResult(result) ? result.link : isTextResult(result) ? result.link : undefined;
    if (saveText) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'cosmos-save';
      saveBtn.innerHTML = '<span>Save</span>';
      saveBtn.addEventListener('click', () => {
        void chrome.runtime.sendMessage({
          type: MSG.CAPTURE_CLIP,
          text: saveText,
          url: saveLink,
          source: 'manual',
        }).then((res) => {
          saveBtn.innerHTML = res?.ok ? 'Saved' : 'Already saved';
          setTimeout(() => { saveBtn.innerHTML = '<span>Save</span>'; }, 2000);
        });
      });
      this.msgEl.appendChild(saveBtn);
    }
  }

  private async runLoop(): Promise<void> {
    if (this.stopped) return;
    if (this.isNavigating) return;

    const FADE_MS = 500;

    const [result, source] = await this.fetchNext();
    if (this.stopped) return;

    if (result) {
      this.history.push({ result, source, timestamp: Date.now() });
      this.currentIndex = this.history.length - 1;
      this.updateNavButtons();
    }

    const skipSpiro = !result
      || !isTextResult(result)
      || (result.html?.includes('zen-haiku') ?? false)
      || (result.html?.includes('zen-oblique') ?? false);

    if (!skipSpiro) {
      const theme = await getTheme();
      const needsNewSpiro = !this.spiro || this.spiro.isRemoved();

      if (needsNewSpiro) {
        this.spiro?.remove();
        this.spiro = new SpirographCanvas(this.canvasWrap, theme === 'light');
      }

      const spiroPromise = this.spiro!.start(this.intervalMs);

      await this.renderResult(result, source);
      await fadeEl(this.msgEl, 0, 1, FADE_MS);
      if (this.stopped) { this.spiro?.stop(); return; }

      await spiroPromise;
      if (this.stopped) return;

      await Promise.all([
        fadeEl(this.msgEl, 1, 0, FADE_MS),
        this.spiro!.fadeOut(FADE_MS),
      ]);
      if (this.stopped) return;
    } else {
      this.spiro?.remove();
      this.spiro = null;

      await this.renderResult(result, source);
      await fadeEl(this.msgEl, 0, 1, FADE_MS);
      if (this.stopped) return;

      await new Promise((r) => setTimeout(r, this.intervalMs));
      if (this.stopped) return;

      await fadeEl(this.msgEl, 1, 0, FADE_MS);
      if (this.stopped) return;
    }

    void this.runLoop();
  }
}