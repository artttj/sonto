export type FeedItem = { title: string; link: string; description?: string };

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
    return [{ title, link, description }];
  });
}
