// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export type FeedItem = { title: string; link: string; description?: string; imageUrl?: string };

function findImage(el: Element): string | undefined {
  const enc = el.querySelector('enclosure');
  if (enc) {
    const type = enc.getAttribute('type') ?? '';
    const url = enc.getAttribute('url') ?? '';
    if (url && type.startsWith('image/')) return url;
  }

  const media = el.querySelector('content[url], thumbnail[url]');
  if (media) {
    const url = media.getAttribute('url') ?? '';
    const medium = media.getAttribute('medium') ?? '';
    if (url && (medium === 'image' || /\.(jpe?g|png|webp|gif)/i.test(url))) return url;
  }

  return undefined;
}

export function parseFeed(xml: string): FeedItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const isAtom = doc.querySelector('feed') !== null;
  const items = isAtom
    ? [...doc.querySelectorAll('entry')]
    : [...doc.querySelectorAll('item')];

  return items.flatMap((el) => {
    const title = el.querySelector('title')?.textContent?.trim() ?? '';
    const link = isAtom
      ? (el.querySelector('link')?.getAttribute('href') ?? el.querySelector('link')?.textContent?.trim() ?? '')
      : (el.querySelector('link')?.textContent?.trim() ?? '');
    const description = el.querySelector('description, summary')?.textContent?.trim();
    if (!title || !link) return [];
    const imageUrl = findImage(el);
    return [{ title, link, description, imageUrl }];
  });
}
