import { getDripInterval, getDisabledSources } from '../shared/storage';
import { type ZenArtResult, type ZenFetchResult, type ZenTextResult, ZEN_FETCHERS, pickFetcher } from './zen/zen-fetchers';

function isArtResult(r: ZenFetchResult): r is ZenArtResult {
  return r !== null && 'imageUrl' in r;
}

function isTextResult(r: ZenFetchResult): r is ZenTextResult {
  return r !== null && 'text' in r;
}

interface SpiroPreset {
  Crota: number; HBx: number; HBy: number; Hdist: number;
  Lrota: number; Larm1: number; Larm2: number;
  Rrota: number; Rarm1: number; Rarm2: number; Ext: number;
}

class SpirographCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId = 0;
  private running = false;

  // Pantograph state
  private Crota = 0; private HBx = 0; private HBy = 0; private Hdist = 0;
  private Lrota = 0; private Larm1 = 0; private Larm2 = 0;
  private Rrota = 0; private Rarm1 = 0; private Rarm2 = 0; private Ext = 0;

  // Rotation state
  private LrotaVal = 0; private RrotaVal = 0; private CrotaVal = 0;

  private static readonly PRESETS: SpiroPreset[] = [
    { Crota: -1.44, HBx: 9,   HBy: -63, Hdist: 106, Lrota: 2.5,  Larm1: 11, Larm2: 77, Rrota: -3.6,  Rarm1: 9,  Rarm2: 95, Ext: 7  },
    { Crota: -0.5,  HBx: 0,   HBy: -54, Hdist: 96,  Lrota: 1.2,  Larm1: 12, Larm2: 84, Rrota: -2.0,  Rarm1: 8,  Rarm2: 89, Ext: 5  },
    { Crota: 1.0,   HBx: -3,  HBy: -60, Hdist: 102, Lrota: -3.0, Larm1: 9,  Larm2: 81, Rrota: 1.5,   Rarm1: 11, Rarm2: 90, Ext: 6  },
    { Crota: -2.0,  HBx: 2,   HBy: -59, Hdist: 108, Lrota: 3.6,  Larm1: 10, Larm2: 80, Rrota: -1.44, Rarm1: 8,  Rarm2: 93, Ext: 5  },
  ];

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.canvas.width = this.canvas.offsetWidth || 300;
    this.canvas.height = this.canvas.offsetHeight || 400;
  }

  private applyPreset(p: SpiroPreset): void {
    this.Crota = p.Crota; this.HBx = p.HBx; this.HBy = p.HBy; this.Hdist = p.Hdist;
    this.Lrota = p.Lrota; this.Larm1 = p.Larm1; this.Larm2 = p.Larm2;
    this.Rrota = p.Rrota; this.Rarm1 = p.Rarm1; this.Rarm2 = p.Rarm2;
    this.Ext = p.Ext;
    this.LrotaVal = 0; this.RrotaVal = 0; this.CrotaVal = 0;
  }

  private calc(): { fx: number; fy: number; r: number; g: number; b: number } | null {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    // Hinge base
    const hx = cx + this.HBx;
    const hy = cy + this.HBy;
    const dist = this.Hdist;

    // Left arm
    const Lx = hx + Math.cos(this.LrotaVal) * dist;
    const Ly = hy + Math.sin(this.LrotaVal) * dist;

    // Right arm hinge (offset from center)
    const Rx = cx + Math.cos(this.CrotaVal) * this.Ext;
    const Ry = cy + Math.sin(this.CrotaVal) * this.Ext;

    // Distance between left tip and right hinge
    const D = Math.hypot(Rx - Lx, Ry - Ly);

    if (D < 1e-6) return null;

    const cosGamma = (this.Rarm2 * this.Rarm2 + this.Larm2 * this.Larm2 - D * D) / (2 * this.Rarm2 * this.Larm2);
    if (cosGamma < -1 || cosGamma > 1) return null;

    const gamma = Math.acos(cosGamma);

    const sinA = (this.Larm2 * Math.sin(gamma)) / D;
    const clampedSinA = Math.max(-1, Math.min(1, sinA));
    const alpha = Math.asin(clampedSinA);

    const baseAngle = Math.atan2(Ry - Ly, Rx - Lx);
    const angle = baseAngle + alpha;

    const fx = Lx + Math.cos(angle) * this.Rarm2;
    const fy = Ly + Math.sin(angle) * this.Rarm2;

    // Color from arm rotations (screen blend mode, black bg)
    const r = Math.floor(128 + 127 * Math.sin(this.LrotaVal));
    const g = Math.floor(128 + 127 * Math.sin(this.RrotaVal + 2.094));
    const b = Math.floor(128 + 127 * Math.sin(this.CrotaVal + 4.189));

    return { fx, fy, r, g, b };
  }

  start(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const preset = SpirographCanvas.PRESETS[Math.floor(Math.random() * SpirographCanvas.PRESETS.length)];
      this.applyPreset(preset);

      this.resize();
      this.ctx.globalCompositeOperation = 'screen';
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.lineWidth = 0.7;

      this.running = true;
      const endAt = Date.now() + durationMs;
      let prevPt: { fx: number; fy: number } | null = null;

      const tick = () => {
        if (!this.running) { resolve(); return; }

        const now = Date.now();
        if (now >= endAt) {
          this.running = false;
          resolve();
          return;
        }

        const STEPS = 60;
        for (let i = 0; i < STEPS; i++) {
          this.LrotaVal += this.Lrota * 0.001;
          this.RrotaVal += this.Rrota * 0.001;
          this.CrotaVal += this.Crota * 0.001;

          const pt = this.calc();
          if (pt) {
            if (prevPt) {
              this.ctx.beginPath();
              this.ctx.strokeStyle = `rgb(${pt.r},${pt.g},${pt.b})`;
              this.ctx.moveTo(prevPt.fx, prevPt.fy);
              this.ctx.lineTo(pt.fx, pt.fy);
              this.ctx.stroke();
            }
            prevPt = { fx: pt.fx, fy: pt.fy };
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
  }

  remove(): void {
    this.stop();
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
  private disabledSources = new Set<string>();
  private intervalMs = 10000;

  private readonly wrap: HTMLElement;
  private readonly canvasWrap: HTMLElement;
  private readonly msgEl: HTMLElement;

  constructor(container: HTMLElement, private language: string) {
    container.innerHTML = '';

    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'cosmos-canvas-wrap';

    this.msgEl = document.createElement('div');
    this.msgEl.className = 'cosmos-message';
    this.msgEl.style.opacity = '0';

    this.wrap = container;
    container.appendChild(this.canvasWrap);
    container.appendChild(this.msgEl);
  }

  stop(): void {
    this.stopped = true;
    this.spiro?.stop();
  }

  refresh(language: string): void {
    this.language = language;
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      const [disabled, ms] = await Promise.all([getDisabledSources(), getDripInterval()]);
      this.disabledSources = new Set(disabled);
      this.intervalMs = ms;
    } catch { /* use defaults */ }

    void this.runLoop(true);
  }

  private async fetchNext(): Promise<ZenFetchResult> {
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
            return result;
          }
        }
      } catch { /* try next */ }
    }
    return null;
  }

  private renderResult(result: ZenFetchResult): void {
    this.msgEl.innerHTML = '';

    if (!result) {
      const el = document.createElement('div');
      el.className = 'cosmos-text';
      el.textContent = '✦';
      this.msgEl.appendChild(el);
      return;
    }

    if (isArtResult(result)) {
      const img = document.createElement('img');
      img.className = 'cosmos-art-img';
      img.src = result.imageUrl;
      img.alt = result.caption;

      const cap = document.createElement('div');
      cap.className = 'cosmos-art-caption';
      cap.textContent = result.caption;

      this.msgEl.appendChild(img);
      this.msgEl.appendChild(cap);
      return;
    }

    if (isTextResult(result)) {
      if (result.icon) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'cosmos-icon';
        iconWrap.innerHTML = result.icon;
        this.msgEl.appendChild(iconWrap);
      }

      if (result.html) {
        const textEl = document.createElement('div');
        textEl.className = 'cosmos-text';
        textEl.innerHTML = result.html;
        this.msgEl.appendChild(textEl);
      } else {
        const textEl = document.createElement('div');
        textEl.className = 'cosmos-text';
        textEl.textContent = result.text;
        this.msgEl.appendChild(textEl);
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
    }
  }

  private async runLoop(first: boolean): Promise<void> {
    if (this.stopped) return;

    const SPIRO_MS = 2500;
    const FADE_MS = 500;

    if (first) {
      const result = await this.fetchNext();
      if (this.stopped) return;
      this.renderResult(result);
      await fadeEl(this.msgEl, 0, 1, FADE_MS);
      if (this.stopped) return;
    }

    const showMs = Math.max(this.intervalMs - SPIRO_MS - FADE_MS * 2, 1000);

    // Prefetch next while showing current
    const nextResultPromise = new Promise<ZenFetchResult>((resolve) => {
      setTimeout(() => {
        void this.fetchNext().then(resolve);
      }, Math.max(showMs - 1500, 0));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, showMs));
    if (this.stopped) return;

    // Fade out message
    await fadeEl(this.msgEl, 1, 0, FADE_MS);
    if (this.stopped) return;

    // Spirograph animation
    this.spiro?.remove();
    this.spiro = new SpirographCanvas(this.canvasWrap);
    this.canvasWrap.style.opacity = '1';
    await this.spiro.start(SPIRO_MS);
    if (this.stopped) return;

    // Get next content (should be ready)
    const nextResult = await nextResultPromise;
    if (this.stopped) return;

    // Render next message while canvas fades out
    this.renderResult(nextResult);

    await Promise.all([
      this.spiro.fadeOut(FADE_MS),
      fadeEl(this.msgEl, 0, 1, FADE_MS),
    ]);

    this.spiro.remove();
    this.spiro = null;

    void this.runLoop(false);
  }
}
