// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildTags(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const main = hostname.split('.').slice(0, -1).join(' ').trim();
    return main ? [main.toLowerCase().slice(0, 32)] : [];
  } catch {
    return [];
  }
}
