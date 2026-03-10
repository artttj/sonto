// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(srcPath, destPath) {
  mkdirp(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
}

function copyHtml(srcPath, destPath) {
  let html = fs.readFileSync(srcPath, 'utf8');
  html = html.replace(/ type="module"/g, '');
  mkdirp(path.dirname(destPath));
  fs.writeFileSync(destPath, html);
}

async function minifyCss(srcPath, destPath) {
  const css = fs.readFileSync(srcPath, 'utf8');
  const result = await esbuild.transform(css, { loader: 'css', minify: true });
  mkdirp(path.dirname(destPath));
  fs.writeFileSync(destPath, result.code);
}


async function build() {
  if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
  mkdirp(dist);

  copyFile(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));

  mkdirp(path.join(dist, 'icons'));
  for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
    const srcIcon = path.join(root, 'icons', icon);
    if (fs.existsSync(srcIcon)) {
      copyFile(srcIcon, path.join(dist, 'icons', icon));
    }
  }

  mkdirp(path.join(dist, 'fonts'));
  for (const font of fs.readdirSync(path.join(src, 'fonts'))) {
    copyFile(path.join(src, 'fonts', font), path.join(dist, 'fonts', font));
  }

  copyHtml(path.join(src, 'sidebar', 'sidebar.html'), path.join(dist, 'sidebar', 'sidebar.html'));
  copyHtml(path.join(src, 'settings', 'settings.html'), path.join(dist, 'settings', 'settings.html'));
  await minifyCss(path.join(src, 'sidebar', 'sidebar.css'), path.join(dist, 'sidebar', 'sidebar.css'));
  await minifyCss(path.join(src, 'settings', 'settings.css'), path.join(dist, 'settings', 'settings.css'));

  const common = { bundle: true, minify: true, target: 'es2020' };

  await Promise.all([
    esbuild.build({
      ...common,
      entryPoints: [path.join(src, 'background', 'service-worker.ts')],
      format: 'esm',
      outfile: path.join(dist, 'background', 'service-worker.js'),
    }),
    esbuild.build({
      ...common,
      entryPoints: [path.join(src, 'content', 'main.ts')],
      format: 'iife',
      outfile: path.join(dist, 'content', 'content.js'),
    }),
    esbuild.build({
      ...common,
      entryPoints: [path.join(src, 'sidebar', 'sidebar.ts')],
      format: 'iife',
      outfile: path.join(dist, 'sidebar', 'sidebar.js'),
    }),
    esbuild.build({
      ...common,
      entryPoints: [path.join(src, 'settings', 'settings.ts')],
      format: 'iife',
      outfile: path.join(dist, 'settings', 'settings.js'),
    }),
  ]);

  const files = fs.readdirSync(dist, { recursive: true })
    .filter(f => !fs.statSync(path.join(dist, f)).isDirectory())
    .map(f => {
      const size = fs.statSync(path.join(dist, f)).size;
      return `  ${String(size).padStart(8)} B  ${f}`;
    });
  console.log(`\nBuilt to dist/  (${files.length} files)\n${files.join('\n')}`);
  console.log('\nIn Chrome → Load unpacked → select the dist/ folder.');
}

build().catch((err) => { console.error(err); process.exit(1); });