import { getDripInterval, getDisabledSources } from '../shared/storage';
import { type ZenArtResult, type ZenFetchResult, type ZenTextResult, ZEN_FETCHERS, pickFetcher } from './zen/zen-fetchers';

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

// Dense center — from htmlspirograph.com/#0,50,4,0,1,0.8,-90,-535,631,-0.005,145,476,-3.2,142,501,3,4,0,1,740
const BASE_DENSE: SpiroParams = {
  Crota: 0.8, HBx: -90, HBy: -535, Hdist: 631,
  Lrota: -0.005, Larm1: 145, Larm2: 476,
  Rrota: -3.2, Rarm1: 142, Rarm2: 501, Ext: 3,
};

// Geometric lobe — from htmlspirograph.com/#0,50,0,0,1,-0.8,52,-760,508,0.0125,94,534,3.2,188,560,56,102,0,1,1597
// One arm very slow (0.0125°/step), the other fast (3.2°/step) → diamond lobe pattern
const BASE_DIAMOND: SpiroParams = {
  Crota: -0.8, HBx: 52, HBy: -760, Hdist: 508,
  Lrota: 0.0125, Larm1: 94, Larm2: 534,
  Rrota: 3.2, Rarm1: 188, Rarm2: 560, Ext: 56, Loffset: 102,
};

// Open ring — from htmlspirograph.com/#0,50,0,1,1,-1.44,30,-700,1174,2.5,120,860,-3.6,100,1050,75,0,0,1,1064
const BASE_OPEN: SpiroParams = {
  Crota: -1.44, HBx: 30, HBy: -700, Hdist: 1174,
  Lrota: 2.5, Larm1: 120, Larm2: 860,
  Rrota: -3.6, Rarm1: 100, Rarm2: 1050, Ext: 75,
};

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
  return { ...BASE_DENSE };
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
    const Lrota = rnd(0.005, 0.06) * (Math.random() < 0.5 ? 1 : -1);
    const Rrota = rnd(1.5, 4) * (Math.random() < 0.5 ? 1 : -1);

    const HBx = rnd(-80, 80);
    const HBy = rnd(-900, -500);
    const Ext = rnd(10, 100);
    const Loffset = rnd(0, 360);

    return { Crota, HBx, HBy, Hdist, Lrota, Larm1, Larm2, Rrota, Rarm1, Rarm2, Ext, Loffset };
  }
  return { ...BASE_DIAMOND };
}

class SpirographCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private rafId = 0;
  private running = false;

  private style: 'dense' | 'open' | 'geometric' = 'dense';
  private stepsTotal = 0;
  private drawn = 0;

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

    let color: string;
    if (this.style === 'dense') {
      // Analogue colormode: three phase-shifted sine waves for smooth rainbow cycling
      const phase = this.Lrot * AM;
      const phase2 = this.Rrot * AM;
      const r = Math.round(Math.sin(phase) * 127 + 127);
      const g = Math.round(Math.sin(phase + Math.PI * 2 / 3) * 127 + 127);
      const b = Math.round(Math.sin(phase2 + Math.PI * 4 / 3) * 127 + 127);
      color = `rgb(${r},${g},${b})`;
    } else if (this.style === 'open') {
      // One smooth blue → orange → blue arc over the full drawing
      const t = this.stepsTotal > 0 ? this.drawn / this.stepsTotal : 0;
      const hue = Math.round(210 + Math.sin(t * Math.PI) * 175);
      color = `hsl(${hue}, 90%, 65%)`;
    } else {
      // Geometric: two full oscillations → alternating blue/orange strands per lobe
      const t = this.stepsTotal > 0 ? this.drawn / this.stepsTotal : 0;
      const hue = Math.round(210 + Math.sin(t * 2 * Math.PI) * 175);
      color = `hsl(${hue}, 90%, 65%)`;
    }

    return { fx, fy, color };
  }

  start(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
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

      // Steps per frame controls visual density and draw speed.
      // Dense: more steps → fills the space. Geometric: fewer → visible fine strands.
      const fps = 60;
      const stepsPerFrame = this.style === 'dense' ? 30 : this.style === 'geometric' ? 9 : 12;
      this.stepsTotal = stepsPerFrame * Math.round(durationMs / 1000 * fps);

      this.resize();
      const scale = Math.min(this.canvas.width, this.canvas.height) / SpirographCanvas.REF / 1.3;

      this.ctx.globalCompositeOperation = 'screen';
      // Dark indigo base so the center void blends rather than reads as a harsh black hole
      this.ctx.fillStyle = '#060410';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.lineWidth = 0.8;

      this.running = true;
      const endAt = Date.now() + durationMs;
      let prevPt: { fx: number; fy: number } | null = null;

      const tick = () => {
        if (!this.running) { resolve(); return; }
        if (Date.now() >= endAt) { this.running = false; resolve(); return; }

        // Draw steps until stepsTotal reached, then just hold the completed pattern
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
  private intervalMs = 15000;

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
  }

  private async runLoop(first: boolean): Promise<void> {
    if (this.stopped) return;

    const SPIRO_MS = 3000;
    const FADE_MS = 500;

    if (first) {
      const result = await this.fetchNext();
      if (this.stopped) return;
      this.renderResult(result);
      await fadeEl(this.msgEl, 0, 1, FADE_MS);
      if (this.stopped) return;
    }

    // Account for three sequential fades: message out + spiro fade-out + message in
    const showMs = Math.max(this.intervalMs - SPIRO_MS - FADE_MS * 3, 1500);

    // Kick off fetch after a delay so it's ready when we need it
    const nextResultPromise = new Promise<ZenFetchResult>((resolve) => {
      setTimeout(() => void this.fetchNext().then(resolve), Math.max(showMs - 2000, 0));
    });

    await new Promise<void>((r) => setTimeout(r, showMs));
    if (this.stopped) return;

    await fadeEl(this.msgEl, 1, 0, FADE_MS);
    if (this.stopped) return;

    // New spirograph every cycle
    this.spiro?.remove();
    this.spiro = new SpirographCanvas(this.canvasWrap);
    await this.spiro.start(SPIRO_MS);
    if (this.stopped) return;

    // Spiro fully fades out first, then message fades in — no overlap
    await this.spiro.fadeOut(FADE_MS);
    if (this.stopped) return;

    this.spiro.remove();
    this.spiro = null;

    const nextResult = await nextResultPromise;
    if (this.stopped) return;

    this.renderResult(nextResult);
    await fadeEl(this.msgEl, 0, 1, FADE_MS);

    void this.runLoop(false);
  }
}
