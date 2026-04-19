import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORE = path.join(ROOT, 'docs/store');
const SHOTS = path.join(ROOT, 'docs/screenshots');
const ICONS = path.join(ROOT, 'icons');

const toUrl = (p) => 'file://' + p;

const tiles = [
  {
    name: 'tile1_hero',
    bg: `${STORE}/hero_ad.jpg`,
    shot: null,
    eyebrow: 'NOTO',
    headline: 'Your clipboard.\nYour prompts.\nOne tidy sidebar.',
    sub: 'A second memory for Chrome. Offline. On-device.',
    layout: 'hero',
  },
  {
    name: 'tile2_clipboard',
    bg: `${STORE}/bg_clipboard.jpg`,
    shot: `${SHOTS}/clipboard_dark.png`,
    eyebrow: 'CLIPBOARD',
    headline: 'Never lose\na copy again.',
    sub: 'Every copy flows in automatically. Pin it, tag it, search it.',
    layout: 'split',
  },
  {
    name: 'tile3_prompts',
    bg: `${STORE}/bg_prompts.jpg`,
    shot: `${SHOTS}/prompt_modal.png`,
    eyebrow: 'PROMPTS',
    headline: 'Prompts that\nstick around.',
    sub: 'Color-labeled snippets for the phrases you reuse all day.',
    layout: 'split',
  },
  {
    name: 'tile4_privacy',
    bg: `${STORE}/bg_privacy.jpg`,
    shot: null,
    eyebrow: 'PRIVACY',
    headline: 'PIN-locked.\nOn-device.\nYours.',
    sub: 'No accounts. No sync. No tracking. Ever.',
    layout: 'hero',
  },
  {
    name: 'tile5_themes',
    bg: `${STORE}/bg_clipboard.jpg`,
    shot: `${SHOTS}/clipboard_light.png`,
    shot2: `${SHOTS}/clipboard_dark.png`,
    eyebrow: 'THEMES',
    headline: 'Light or dark.\nYour call.',
    sub: 'Follows Chrome, or pick your own.',
    layout: 'dual',
  },
];

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1280px; height: 800px; overflow: hidden; font-family: -apple-system, 'Helvetica Neue', sans-serif; }
  .tile { position: relative; width: 1280px; height: 800px; overflow: hidden; color: #fff; }
  .bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .vignette {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 30% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 85%);
  }
  .scrim-left {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(8,8,10,0.82) 0%, rgba(8,8,10,0.55) 35%, rgba(8,8,10,0) 60%);
  }
  .content { position: relative; z-index: 2; height: 100%; padding: 80px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .brand img { width: 36px; height: 36px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.24em; color: #e8b931; text-transform: uppercase; }
  .headline {
    font-size: 72px; font-weight: 700; line-height: 1.02; letter-spacing: -0.025em;
    white-space: pre-line; margin-bottom: 24px;
    background: linear-gradient(180deg, #ffffff 0%, #cfcfd6 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 20px rgba(0,0,0,0.4);
  }
  .sub { font-size: 22px; font-weight: 400; color: rgba(255,255,255,0.72); max-width: 520px; line-height: 1.35; letter-spacing: -0.005em; }
  .mock {
    position: absolute; right: 80px; top: 50%; transform: translateY(-50%);
    height: 680px; width: auto;
    border-radius: 18px; overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 6px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
  }
  .mock img { height: 100%; width: auto; display: block; }
  .dual { position: absolute; right: 60px; top: 50%; transform: translateY(-50%); display: flex; gap: 24px; }
  .dual .mock { position: static; transform: none; height: 620px; }

  /* Hero layout — center composition, full-bleed bg */
  .tile[data-layout="hero"] .content { align-items: flex-start; padding-left: 100px; padding-right: 100px; }
  .tile[data-layout="hero"] .headline { font-size: 84px; }
  .tile[data-layout="hero"] .sub { font-size: 24px; }

  /* Split layout — text left, shot right */
  .tile[data-layout="split"] .content { max-width: 640px; }

  /* Dual layout */
  .tile[data-layout="dual"] .content { max-width: 540px; }
`;

function renderHtml(t) {
  const brand = `<div class="brand"><img src="${toUrl(ICONS)}/icon128.png" alt="" /><span class="eyebrow">${t.eyebrow}</span></div>`;
  const textBlock = `
    ${brand}
    <h1 class="headline">${t.headline}</h1>
    <p class="sub">${t.sub}</p>
  `;
  let mock = '';
  if (t.layout === 'split' && t.shot) {
    mock = `<div class="mock"><img src="${toUrl(t.shot)}" alt="" /></div>`;
  } else if (t.layout === 'dual') {
    mock = `<div class="dual">
      <div class="mock"><img src="${toUrl(t.shot)}" alt="" /></div>
      <div class="mock"><img src="${toUrl(t.shot2)}" alt="" /></div>
    </div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="tile" data-layout="${t.layout}">
      <div class="bg" style="background-image:url('${toUrl(t.bg)}')"></div>
      <div class="scrim-left"></div>
      <div class="vignette"></div>
      <div class="content">${textBlock}</div>
      ${mock}
    </div>
  </body></html>`;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const tmp = path.join(STORE, '_tile.html');
for (const t of tiles) {
  fs.writeFileSync(tmp, renderHtml(t));
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  });
  await new Promise(r => setTimeout(r, 300));
  const out = path.join(STORE, `${t.name}.png`);
  await page.screenshot({ path: out, type: 'png', omitBackground: false });
  console.log('wrote', out);
}
fs.unlinkSync(tmp);

await browser.close();
