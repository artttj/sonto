// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { ClipItem } from './types';

export function exportToNotion(clip: ClipItem): void {
  const title = encodeURIComponent(clip.title || 'Noto');
  const text = encodeURIComponent(clip.text);
  const url = clip.url ? encodeURIComponent(clip.url) : '';
  
  const notionUrl = url 
    ? `https://www.notion.so/new?title=${title}&text=${text}&src=${url}`
    : `https://www.notion.so/new?title=${title}&text=${text}`;
  
  window.open(notionUrl, '_blank');
}

export function exportToObsidian(clip: ClipItem): string {
  const date = new Date(clip.timestamp).toISOString().slice(0, 10);
  const title = clip.title || 'Noto';
  
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${date}`,
    clip.url ? `source: ${clip.url}` : null,
    'tags: [sonto]',
    '---',
    '',
  ].filter(Boolean).join('\n');
  
  const content = `${frontmatter}${clip.text}`;
  
  void navigator.clipboard.writeText(content);
  
  return content;
}

export function exportToMarkdown(clip: ClipItem): string {
  const date = new Date(clip.timestamp).toLocaleDateString();
  let md = `# ${clip.title || 'Noto'}\n\n`;
  md += `*Saved on ${date}*\n\n`;
  if (clip.url) md += `[Source](${clip.url})\n\n`;
  md += clip.text;
  return md;
}

export function exportToJson(clip: ClipItem): string {
  return JSON.stringify(clip, null, 2);
}
