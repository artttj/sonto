import {
  AI_PATTERNS,
  OBLIQUE_STRATEGIES,
  SVG_ATLAS,
  SVG_HAIKU,
  SVG_HN,
  SVG_PHILOSOPHY,
  SVG_REDDIT,
  SVG_SMITHSONIAN,
  escapeHtml,
} from './zen-content';
import { getCustomFeeds } from '../../shared/storage';
import { parseFeed } from '../../shared/rss-parser';
import kotowazaData from '../../../node_modules/kotowaza/data/kotowaza.json';
import haikuData from './haiku-data.json';

// Wrap text in smart quotes unless it already starts with one.
// Splits on em-dash attribution so the author stays outside the quotes:
// "Some wisdom" — Socrates
function stripWrappingQuotes(text: string): string {
  return text.replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, '').trim();
}

function wrapQuotes(text: string): string {
  const cleaned = stripWrappingQuotes(text);
  const match = cleaned.match(/^([\s\S]+?)(\s[\u2014\-]{1,2}\s.+)$/);
  if (match) return `\u201C${match[1]}\u201D${match[2]}`;
  return `\u201C${cleaned}\u201D`;
}

export type ZenTextResult = { text: string; link?: string; icon?: string; html?: string };
export type ZenArtResult = { imageUrl: string; caption: string; link?: string };
export type ZenFetchResult = ZenTextResult | ZenArtResult | null;

export interface FetcherContext {
  language: string;
  isValidFact: (text: string) => boolean;
  pickCategory: () => string | null;
}

export type ZenFetcher = {
  id: string;
  label: string;
  weight: number;
  fetch: (ctx: FetcherContext) => Promise<ZenFetchResult>;
};

const REDDIT_SUBREDDITS = [
  'science', 'Futurology', 'space', 'history',
  'philosophy', 'AskScience', 'dataisbeautiful',
];

const MET_HIGHLIGHTED_IDS = [
  488660, 466105, 453351, 456949, 453183, 451023, 453336, 451725, 910555, 451268,
  544502, 733808, 250939, 435641, 436573, 437769, 436440, 437900, 438814, 892627,
  247009, 437971, 437326, 435853, 437455, 437609, 436323, 437891, 435851, 436244,
  436851, 437447, 439933, 247008, 40055, 451270, 74813, 656430, 50486, 437329,
  255275, 437826, 437549, 435728, 438754, 544442, 436964, 436840, 438605, 437175,
  437879, 436658, 437423, 436918, 437869, 591855, 436105, 436106, 436792, 435802,
  436121, 11417, 45734, 437984, 436527, 436532, 437980, 436528, 10481, 459055,
  436524, 437331, 436533, 452658, 436529, 436534, 436530, 436526,
];

const GETTY_PAGES = [1000,1500,2000,3500,4000,4500,6500,7000,7500,9000,9500,12000,12500,13000,14000,14500,15000,17000,17500,18000,19000,19500,20000,20500,21000,21500,22000,22500,23000,23500,24000,24500,25000,26500,27000,27500,28500,29000,29500,30500,31000,31500,32000,32500,33500,34000,34500,35000,35500,36000,36500,37000,37500,38500,39500,40000,40500,41000,41500];
let gettyUuidCache: string[] = [];

let kotowazaQueue: Array<unknown> = [];
let obliqueQueue: string[] = [];
let haikuQueue: string[] = [];

function decodeHtml(str: string): string {
  return new DOMParser().parseFromString(str, 'text/html').body.textContent ?? str;
}

function containsAiContent(text: string): boolean {
  return AI_PATTERNS.some((p) => p.test(text));
}

function isValidHnTitle(title: string): boolean {
  return title.length >= 10 && !/^Ask HN:/i.test(title) && !containsAiContent(title);
}

function isValidRedditPost(post: { stickied: boolean; over_18: boolean; score: number; title: string }): boolean {
  return !post.stickied && !post.over_18 && post.score > 50 && post.title.length >= 20 && !containsAiContent(post.title);
}

export const ZEN_FETCHERS: ZenFetcher[] = [
  {
    id: 'hnStory',
    label: 'Hacker News',
    weight: 5,
    fetch: async () => {
      try {
        const listRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
          signal: AbortSignal.timeout(8000),
        });
        if (!listRes.ok) return null;
        const ids = await listRes.json() as number[];
        const pool = ids.slice(0, 30);
        const id = pool[Math.floor(Math.random() * pool.length)];
        const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!itemRes.ok) return null;
        const item = await itemRes.json() as {
          title?: string;
          url?: string;
          type?: string;
          dead?: boolean;
          deleted?: boolean;
        };
        if (item.dead || item.deleted || item.type !== 'story') return null;
        const title = item.title?.replace(/<[^>]+>/g, '').trim() ?? '';
        if (!isValidHnTitle(title)) return null;
        const link = item.url ?? `https://news.ycombinator.com/item?id=${id}`;
        return { text: title, link, icon: SVG_HN };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'reddit',
    label: 'Reddit',
    weight: 7,
    fetch: async () => {
      try {
        const sub = REDDIT_SUBREDDITS[Math.floor(Math.random() * REDDIT_SUBREDDITS.length)];
        const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json() as {
          data?: {
            children?: Array<{
              data: { title: string; permalink: string; score: number; stickied: boolean; over_18: boolean };
            }>;
          };
        };
        const posts = (data.data?.children ?? [])
          .map((p) => p.data)
          .filter((p) => isValidRedditPost(p));
        if (posts.length === 0) return null;
        const pick = posts[Math.floor(Math.random() * Math.min(posts.length, 10))];
        return {
          text: `r/${sub}: ${pick.title}`,
          link: `https://www.reddit.com${pick.permalink}`,
          icon: SVG_REDDIT,
        };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'metArtwork',
    label: 'Met Artwork',
    weight: 10,
    fetch: async (ctx) => {
      const fetchObject = async (objectId: number) => {
        const objRes = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!objRes.ok) return null;
        const obj = await objRes.json() as {
          primaryImageSmall?: string;
          title?: string;
          artistDisplayName?: string;
          objectDate?: string;
          isPublicDomain?: boolean;
        };
        if (!obj.primaryImageSmall || !obj.isPublicDomain) return null;
        const title = obj.title?.trim() || 'Untitled';
        const parts = [title];
        if (obj.artistDisplayName?.trim()) parts.push(obj.artistDisplayName.trim());
        if (obj.objectDate?.trim()) parts.push(obj.objectDate.trim());
        return { imageUrl: obj.primaryImageSmall, caption: parts.join(' — ') };
      };

      try {
        const category = ctx.pickCategory();
        if (!category) {
          const fallbackId = MET_HIGHLIGHTED_IDS[Math.floor(Math.random() * MET_HIGHLIGHTED_IDS.length)];
          return await fetchObject(fallbackId);
        }
        const keyword = encodeURIComponent(category.split(/\s+/)[0]);
        const searchRes = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${keyword}&hasImages=true&isPublicDomain=true`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json() as { total: number; objectIDs?: number[] };
          const ids = searchData.objectIDs ?? [];
          if (ids.length > 0) {
            const pool = ids.slice(0, 50);
            const objectId = pool[Math.floor(Math.random() * pool.length)];
            const result = await fetchObject(objectId);
            if (result) return result;
          }
        }
        const fallbackId = MET_HIGHLIGHTED_IDS[Math.floor(Math.random() * MET_HIGHLIGHTED_IDS.length)];
        return await fetchObject(fallbackId);
      } catch {
        return null;
      }
    },
  },
  {
    id: 'marsRover',
    label: 'Perseverance Rover',
    weight: 7,
    fetch: async () => {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const currentYear = today.getFullYear();
      const year = Math.floor(Math.random() * (currentYear - 2021)) + 2021;
      const date = `${year}-${mm}-${dd}`;
      const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      try {
        const res = await fetch(
          `https://rovers.nebulum.one/api/v1/rovers/perseverance/photos?earth_date=${date}`,
          { signal: AbortSignal.timeout(9000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as {
          photos?: Array<{ img_src: string; camera: { full_name: string }; rover: { name: string } }>;
        };
        const photos = data.photos ?? [];
        if (photos.length === 0) return null;
        const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 20))];
        return {
          imageUrl: photo.img_src,
          caption: `Mars on ${dateLabel} · Perseverance · ${photo.camera.full_name}`,
        };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'clevelandArtwork',
    label: 'Cleveland Museum of Art',
    weight: 8,
    fetch: async (ctx) => {
      try {
        const skip = Math.floor(Math.random() * 3000);
        const res = await fetch(
          `https://openaccess-api.clevelandart.org/api/artworks/?cc0&has_image=1&limit=10&skip=${skip}&fields=title,creators,creation_date,images,did_you_know,url`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as {
          data?: Array<{
            title?: string;
            creators?: Array<{ description?: string }>;
            creation_date?: string;
            images?: { web?: { url?: string } };
            did_you_know?: string;
            url?: string;
          }>;
        };
        const artworks = (data.data ?? []).filter((a) => a.images?.web?.url);
        if (artworks.length === 0) return null;
        const pick = artworks[Math.floor(Math.random() * artworks.length)];

        const fact = pick.did_you_know?.trim();
        if (fact && fact.length >= 50 && ctx.isValidFact(fact) && Math.random() < 0.4) {
          return { text: fact, link: pick.url };
        }

        const title = pick.title?.trim() || 'Untitled';
        const creator = pick.creators?.[0]?.description?.trim();
        const date = pick.creation_date?.trim();
        const parts = [title];
        if (creator) parts.push(creator);
        if (date) parts.push(date);
        return { imageUrl: pick.images!.web!.url!, caption: parts.join(' — ') };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'customRss',
    label: 'Custom RSS Feeds',
    weight: 8,
    fetch: async (ctx) => {
      const feeds = await getCustomFeeds();
      if (feeds.length === 0) return null;
      const feed = feeds[Math.floor(Math.random() * feeds.length)];
      try {
        const res = await fetch(feed.url, { signal: AbortSignal.timeout(9000) });
        if (!res.ok) return null;
        const xml = await res.text();
        const items = parseFeed(xml).filter((it) => ctx.isValidFact(it.title));
        if (items.length === 0) return null;
        const pick = items[Math.floor(Math.random() * Math.min(items.length, 20))];
        if (pick.imageUrl) {
          return { imageUrl: pick.imageUrl, caption: pick.title, link: pick.link };
        }
        return { text: pick.title, link: pick.link };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'kotowaza',
    label: 'Japanese Proverbs',
    weight: 4,
    fetch: async (ctx) => {
      if (kotowazaQueue.length === 0) {
        kotowazaQueue = [...kotowazaData].sort(() => Math.random() - 0.5);
      }
      const item = kotowazaQueue.pop() as { japanese?: string; romaji?: string; literal?: string; meaning?: { en?: string } } | undefined;
      if (!item?.japanese) return null;
      const jp = item.japanese;
      const meaning = item.meaning?.en ?? item.literal ?? '';
      if (!meaning || !ctx.isValidFact(meaning)) return null;
      const html = `<span class="zen-kotowaza-jp">${escapeHtml(jp)}</span><span class="zen-kotowaza-meaning">${escapeHtml(meaning)}</span>`;
      return { text: `${jp} — ${meaning}`, html };
    },
  },
  {
    id: 'obliqueStrategies',
    label: 'Oblique Strategies',
    weight: 3,
    fetch: async () => {
      if (obliqueQueue.length === 0) {
        obliqueQueue = [...OBLIQUE_STRATEGIES].sort(() => Math.random() - 0.5);
      }
      const card = obliqueQueue.pop();
      if (!card) return null;
      return { text: card, html: `<span class="zen-oblique">${escapeHtml(card)}</span>`, icon: '' };
    },
  },
  {
    id: 'haiku',
    label: 'Haiku',
    weight: 4,
    fetch: async () => {
      if (haikuQueue.length === 0) {
        haikuQueue = [...haikuData].sort(() => Math.random() - 0.5);
      }
      const raw = haikuQueue.pop();
      if (!raw) return null;
      const lines = raw.split(' / ').map((l) => l.trim()).filter(Boolean);
      const html = lines.map((l) => `<span class="zen-haiku-line">${escapeHtml(l)}</span>`).join('');
      return { text: raw.replace(/ \/ /g, '\n'), html, icon: SVG_HAIKU };
    },
  },
  {
    id: 'philosophyEssay',
    label: '1000-Word Philosophy',
    weight: 8,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://1000wordphilosophy.com/feed/', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const xml = await res.text();
        const items = parseFeed(xml).filter((it) => ctx.isValidFact(it.title));
        if (items.length === 0) return null;
        const pick = items[Math.floor(Math.random() * items.length)];
        return { text: pick.title, link: pick.link, icon: SVG_PHILOSOPHY };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'gettyArtwork',
    label: 'Getty Museum Art',
    weight: 8,
    fetch: async () => {
      try {
        if (gettyUuidCache.length === 0) {
          const page = GETTY_PAGES[Math.floor(Math.random() * GETTY_PAGES.length)];
          const res = await fetch(
            `https://data.getty.edu/museum/collection/activity-stream/page/${page}`,
            { signal: AbortSignal.timeout(7000) },
          );
          if (!res.ok) return null;
          const data = await res.json() as { orderedItems?: Array<{ object?: { type?: string; id?: string } }> };
          const uuids = (data.orderedItems ?? [])
            .filter((it) => it.object?.type === 'HumanMadeObject' && it.object?.id)
            .map((it) => it.object!.id!.split('/').pop()!);
          if (uuids.length === 0) return null;
          gettyUuidCache.push(...uuids.sort(() => Math.random() - 0.5));
        }
        const uuid = gettyUuidCache.pop();
        if (!uuid) return null;
        const res = await fetch(
          `https://data.getty.edu/museum/collection/object/${uuid}`,
          { signal: AbortSignal.timeout(7000) },
        );
        if (!res.ok) return null;
        const obj = await res.json() as {
          _label?: string;
          representation?: Array<{ id?: string }>;
          produced_by?: { carried_out_by?: Array<{ _label?: string }> };
        };
        const imageUrl = obj.representation?.[0]?.id?.replace('/full/full/', '/full/!900,700/');
        if (!imageUrl) return null;
        const title = obj._label?.replace(/\s*\([^)]+\)\s*$/, '').trim() ?? '';
        const artist = obj.produced_by?.carried_out_by?.[0]?._label?.trim() ?? '';
        const caption = artist ? `${title} — ${artist}` : title;
        const link = `https://www.getty.edu/art/collection/object/${uuid}`;
        return { imageUrl, caption, link };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'smithsonianNews',
    label: 'Smithsonian Smart News',
    weight: 9,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://www.smithsonianmag.com/rss/smart-news/', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const items = parseFeed(await res.text()).filter((it) => ctx.isValidFact(it.title));
        if (items.length === 0) return null;
        const pick = items[Math.floor(Math.random() * Math.min(items.length, 15))];
        if (pick.imageUrl) return { imageUrl: pick.imageUrl, caption: pick.title, link: pick.link };
        return { text: pick.title, link: pick.link, icon: SVG_SMITHSONIAN };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'atlasObscura',
    label: 'Atlas Obscura',
    weight: 9,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://www.atlasobscura.com/feeds/latest', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const items = parseFeed(await res.text()).filter((it) => ctx.isValidFact(it.title));
        if (items.length === 0) return null;
        const pick = items[Math.floor(Math.random() * Math.min(items.length, 15))];
        if (pick.description) {
          const doc = new DOMParser().parseFromString(pick.description, 'text/html');
          const img = doc.querySelector('img');
          if (img?.src) return { imageUrl: img.src, caption: pick.title, link: pick.link };
        }
        return { text: pick.title, link: pick.link, icon: SVG_ATLAS };
      } catch {
        return null;
      }
    },
  },
];

export function pickFetcher(fetchers: ZenFetcher[], disabledIds?: ReadonlySet<string>): ZenFetcher {
  const pool = disabledIds ? fetchers.filter((f) => !disabledIds.has(f.id)) : fetchers;
  const available = pool.length > 0 ? pool : fetchers;
  const total = available.reduce((sum, f) => sum + f.weight, 0);
  let roll = Math.random() * total;
  for (const f of available) {
    roll -= f.weight;
    if (roll <= 0) return f;
  }
  return available[available.length - 1];
}
