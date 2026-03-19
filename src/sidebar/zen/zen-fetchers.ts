// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import {
  AI_PATTERNS,
  OBLIQUE_STRATEGIES,
  SVG_ATLAS,
  SVG_HAIKU,
  SVG_HN,
  SVG_REDDIT,
  escapeHtml,
} from './zen-content';
import { getCustomFeeds, getCustomJsonSources, isItemSeen, markItemSeen, getRecentlySeenBySource } from '../../shared/storage';
import { parseFeed } from '../../shared/rss-parser';
import kotowazaData from '../../../node_modules/kotowaza/data/kotowaza.json';
import haikuData from './haiku-data.json';
import albumOfDayAlbums from './album-of-a-day.json';

const DAY_MS = 86_400_000;
import haikuData from './haiku-data.json';
import albumOfDayAlbums from './album-of-a-day.json';

export type ZenTextResult = { text: string; link?: string; icon?: string; html?: string; hideLabel?: boolean };
export type ZenArtResult = { imageUrl: string; caption: string; link?: string };
export type ZenFetchResult = ZenTextResult | ZenArtResult | null;

export function isArtResult(r: ZenFetchResult): r is ZenArtResult {
  return r !== null && 'imageUrl' in r;
}

export function isTextResult(r: ZenFetchResult): r is ZenTextResult {
  return r !== null && 'text' in r;
}

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

type AlbumOfDaySeed = {
  title: string;
  artist: string;
  year?: number;
  list: 'pitchfork' | 'rollingStone';
};

type MusicBrainzReleaseGroup = {
  id: string;
  title?: string;
  score?: number | string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
};

type MusicBrainzRelease = {
  id: string;
  title?: string;
  score?: number | string;
  date?: string;
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
};

type CoverArtImage = {
  image?: string;
  front?: boolean;
  types?: string[];
  thumbnails?: {
    '250'?: string;
    '500'?: string;
    '1200'?: string;
    small?: string;
    large?: string;
  };
};

const REDDIT_SUBREDDITS = [
  'science', 'Futurology', 'space', 'history',
  'philosophy', 'AskScience', 'dataisbeautiful',
];

const COMMONS_PAINTING_CATEGORIES = [
  'Category:Paintings',
  'Category:Landscape paintings',
  'Category:Portrait paintings',
  'Category:Oil paintings',
  'Category:Paintings by Vincent van Gogh',
  'Category:Watercolor paintings',
  'Category:Drawings',
  'Category:Prints',
  'Category:Japanese paintings',
  'Category:Chinese paintings',
  'Category:Baroque paintings',
  'Category:Impressionist paintings',
];

const MET_SEARCH_TERMS = [
  'painting', 'sculpture', 'portrait', 'landscape', 'still life',
  'drawing', 'print', 'photography', 'textile', 'ceramics',
  'metalwork', 'jewelry', 'furniture', 'costume', 'armor',
  'weapon', 'musical instrument', 'book', 'manuscript', 'calligraphy'
];
let metIdCache: number[] = [];

const GETTY_MAX_PAGE = 50000;
let gettyUuidCache: string[] = [];

const RIJKS_ID_MIN = 1;
const RIJKS_ID_MAX = 1000000;
let rijksIdCache: string[] = [];

let kotowazaQueue: Array<unknown> = [];
let obliqueQueue: string[] = [];
let haikuQueue: string[] = [];
let atlasCache: Array<{ title: string; link?: string; imageUrl?: string; id: string }> = [];
let smithsonianCache: Array<{ title: string; link?: string; imageUrl?: string; id: string }> = [];
let philosophyCache: Array<{ title: string; link?: string; id: string }> = [];
const albumOfDayList = albumOfDayAlbums as AlbumOfDaySeed[];
const albumOfDayCache = new Map<string, ZenArtResult | null>();
const albumOfDayResultCache = new Map<string, ZenArtResult | null>();

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
    id: 'wikimediaPaintings',
    label: 'Wikimedia Commons Paintings',
    weight: 1,
    fetch: async () => {
      try {
        const category = COMMONS_PAINTING_CATEGORIES[Math.floor(Math.random() * COMMONS_PAINTING_CATEGORIES.length)];
        const params = new URLSearchParams({
          action: 'query',
          generator: 'categorymembers',
          gcmtitle: category,
          gcmtype: 'file',
          gcmlimit: '50',
          prop: 'imageinfo|info',
          iiprop: 'url|extmetadata',
          iiurlwidth: '900',
          inprop: 'url',
          format: 'json',
          origin: '*',
        });
        const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;

        const data = await res.json() as {
          query?: {
            pages?: Record<string, {
              title?: string;
              fullurl?: string;
              imageinfo?: Array<{
                url?: string;
                thumburl?: string;
                extmetadata?: Record<string, { value?: string }>;
              }>;
            }>;
          };
        };

        const pages = Object.values(data.query?.pages ?? {})
          .filter((page) => page.imageinfo?.[0]?.url || page.imageinfo?.[0]?.thumburl);
        if (pages.length === 0) return null;

        const recentlySeen = await getRecentlySeenBySource('wikimediaPaintings', 30 * DAY_MS);
        const available = pages.filter((p) => !recentlySeen.has(p.title ?? ''));
        const pool = available.length > 0 ? available : pages;

        const pick = pool[Math.floor(Math.random() * pool.length)];
        const info = pick.imageinfo?.[0];
        if (!info) return null;

        const imageUrl = info.thumburl ?? info.url;
        if (!imageUrl) return null;

        const title = readCommonsTitle(pick.title, info.extmetadata);
        const artist = readCommonsMetadata(info.extmetadata, ['Artist']);
        const year = readCommonsYear(info.extmetadata);
        const caption = [title, artist, year].filter(Boolean).join(' — ');

        await markItemSeen(pick.title ?? '', 'wikimediaPaintings');
        return {
          imageUrl,
          caption: caption || 'Painting',
          link: pick.fullurl,
        };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'albumOfDay',
    label: 'Album of a Day',
    weight: 1,
    fetch: async () => {
      const dayKey = getAlbumDayKey();
      if (albumOfDayResultCache.has(dayKey)) {
        return albumOfDayResultCache.get(dayKey) ?? null;
      }

      const startIndex = hashString(dayKey) % albumOfDayList.length;
      const attempts = Math.min(albumOfDayList.length, 24);
      for (let i = 0; i < attempts; i++) {
        const album = albumOfDayList[(startIndex + i) % albumOfDayList.length];
        const result = await resolveAlbumOfDay(album);
        if (result) {
          albumOfDayResultCache.set(dayKey, result);
          return result;
        }
      }

      albumOfDayResultCache.set(dayKey, null);
      return null;
    },
  },
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
        const recentlySeen = await getRecentlySeenBySource('hnStory', 1 * DAY_MS);

        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
          const id = ids[Math.floor(Math.random() * Math.min(ids.length, 30))];
          if (recentlySeen.has(String(id))) {
            attempts++;
            continue;
          }
          const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(8000),
          });
          if (!itemRes.ok) {
            attempts++;
            continue;
          }
          const item = await itemRes.json() as {
            title?: string;
            url?: string;
            type?: string;
            dead?: boolean;
            deleted?: boolean;
          };
          if (item.dead || item.deleted || item.type !== 'story') {
            attempts++;
            continue;
          }
          const title = item.title?.replace(/<[^>]+>/g, '').trim() ?? '';
          if (!isValidHnTitle(title)) {
            attempts++;
            continue;
          }
          const link = item.url ?? `https://news.ycombinator.com/item?id=${id}`;
          await markItemSeen(String(id), 'hnStory');
          return { text: title, link, icon: SVG_HN, hideLabel: true };
        }
        return null;
      } catch {
        return null;
      }
    },
  },
  {
    id: 'reddit',
    label: 'Reddit',
    weight: 6,
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

        const recentlySeen = await getRecentlySeenBySource('reddit', 1 * DAY_MS);
        const availablePosts = posts.filter((p) => !recentlySeen.has(p.permalink));

        if (availablePosts.length === 0) {
          return null;
        }

        const pick = availablePosts[Math.floor(Math.random() * Math.min(availablePosts.length, 10))];
        await markItemSeen(pick.permalink, 'reddit');
        return {
          text: `r/${sub}: ${pick.title}`,
          link: `https://www.reddit.com${pick.permalink}`,
          icon: SVG_REDDIT,
          hideLabel: true,
        };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'metArtwork',
    label: 'Met Artwork',
    weight: 7,
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
          objectURL?: string;
        };
        if (!obj.primaryImageSmall || !obj.isPublicDomain) return null;
        const title = obj.title?.trim() || 'Untitled';
        const parts = [title];
        if (obj.artistDisplayName?.trim()) parts.push(obj.artistDisplayName.trim());
        if (obj.objectDate?.trim()) parts.push(obj.objectDate.trim());
        return { imageUrl: obj.primaryImageSmall, caption: parts.join(' — '), link: obj.objectURL };
      };

      const searchMet = async (query: string): Promise<number[]> => {
        const res = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true&isPublicDomain=true`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!res.ok) return [];
        const data = await res.json() as { objectIDs?: number[] };
        return data.objectIDs ?? [];
      };

      const pickFromIds = async (ids: number[]) => {
        if (ids.length === 0) return null;
        const recentlySeen = await getRecentlySeenBySource('metArtwork', 30 * DAY_MS);
        const availableIds = ids.filter((id) => !recentlySeen.has(String(id)));
        const pool = availableIds.length > 0 ? availableIds : ids;
        const objectId = pool[Math.floor(Math.random() * Math.min(pool.length, 300))];
        const result = await fetchObject(objectId);
        if (result) {
          await markItemSeen(String(objectId), 'metArtwork');
        }
        return result;
      };

      try {
        const category = ctx.pickCategory();
        if (category) {
          const keyword = category.split(/\s+/)[0];
          const ids = await searchMet(keyword);
          const result = await pickFromIds(ids);
          if (result) return result;
        }

        if (metIdCache.length === 0) {
          const term = MET_SEARCH_TERMS[Math.floor(Math.random() * MET_SEARCH_TERMS.length)];
          metIdCache = await searchMet(term);
        }
        return await pickFromIds(metIdCache);
      } catch {
        return null;
      }
    },
  },
  {
    id: 'marsRover',
    label: 'Perseverance Rover',
    weight: 5,
    fetch: async () => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const startYear = 2021;
      const startMonth = 2;

      const totalMonths = (currentYear - startYear) * 12 + (today.getMonth() - startMonth) + 1;
      const randomMonthOffset = Math.floor(Math.random() * totalMonths);
      const targetMonth = startMonth + randomMonthOffset;
      const targetYear = startYear + Math.floor(targetMonth / 12);
      const monthNum = ((targetMonth - 1) % 12) + 1;

      const daysInMonth = new Date(targetYear, monthNum, 0).getDate();
      const day = Math.floor(Math.random() * daysInMonth) + 1;

      const mm = String(monthNum).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const date = `${targetYear}-${mm}-${dd}`;
      const dateId = date;

      const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      const recentlySeen = await getRecentlySeenBySource('marsRover', 7 * DAY_MS);
      if (recentlySeen.has(dateId)) return null;

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
        await markItemSeen(dateId, 'marsRover');
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
    weight: 6,
    fetch: async (ctx) => {
      try {
        const clevelandTerms = [
          'painting', 'sculpture', 'drawing', 'print', 'photography',
          'textile', 'metalwork', 'ceramics', 'japanese', 'chinese', 'african'
        ];
        const term = clevelandTerms[Math.floor(Math.random() * clevelandTerms.length)];
        const skip = Math.floor(Math.random() * 10000);
        const res = await fetch(
          `https://openaccess-api.clevelandart.org/api/artworks/?cc0&has_image=1&q=${encodeURIComponent(term)}&limit=10&skip=${skip}&fields=title,creators,creation_date,images,did_you_know,url`,
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
        const artworks = (data.data ?? []).filter((a) => a.images?.web?.url && a.url);
        if (artworks.length === 0) return null;

        const recentlySeen = await getRecentlySeenBySource('clevelandArtwork', 30 * DAY_MS);
        const available = artworks.filter((a) => !recentlySeen.has(a.url!));
        const pool = available.length > 0 ? available : artworks;

        const pick = pool[Math.floor(Math.random() * pool.length)];
        await markItemSeen(pick.url!, 'clevelandArtwork');

        const title = pick.title?.trim() || 'Untitled';
        const creator = pick.creators?.[0]?.description?.trim();
        const date = pick.creation_date?.trim();
        const parts = [title];
        if (creator) parts.push(creator);
        if (date) parts.push(date);
        return { imageUrl: pick.images!.web!.url!, caption: parts.join(' — '), link: pick.url };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'kotowaza',
    label: 'Japanese Proverbs',
    weight: 7,
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
    weight: 6,
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
    weight: 7,
    fetch: async () => {
      if (haikuQueue.length === 0) {
        haikuQueue = [...haikuData].sort(() => Math.random() - 0.5);
      }
      const raw = haikuQueue.pop();
      if (!raw) return null;
      const lines = raw.split(' / ').map((l) => l.trim()).filter(Boolean);
      const html = lines.map((l) => `<span class="zen-haiku-line">${escapeHtml(l)}</span>`).join('');

      await markItemSeen(lines.join(' '), 'haiku');
      return { text: raw.replace(/ \/ /g, '\n'), html, icon: SVG_HAIKU };
    },
  },
  {
    id: 'philosophyEssay',
    label: '1000-Word Philosophy',
    weight: 7,
    fetch: async (ctx) => {
      try {
        if (philosophyCache.length === 0) {
          const res = await fetch('https://1000wordphilosophy.com/feed/', {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return null;
          const items = parseFeed(await res.text()).filter((it) => ctx.isValidFact(it.title));
          const recentlySeen = await getRecentlySeenBySource('philosophyEssay', 7 * DAY_MS);
          for (const it of items) {
            if (recentlySeen.has(it.link)) continue;
            philosophyCache.push({ title: it.title, link: it.link, id: it.link });
          }
          philosophyCache.sort(() => Math.random() - 0.5);
        }
        if (philosophyCache.length === 0) return null;
        const pick = philosophyCache.pop()!;
        await markItemSeen(pick.link!, 'philosophyEssay');
        return { text: pick.title, link: pick.link, icon: '<img class="zen-icon-img" src="https://1000wordphilosophy.com/wp-content/uploads/2024/09/1000-word-philosophy-square-logo.jpg" alt="1000-Word Philosophy" />', hideLabel: true };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'gettyArtwork',
    label: 'Getty Museum Art',
    weight: 6,
    fetch: async () => {
      try {
        if (gettyUuidCache.length === 0) {
          const page = Math.floor(Math.random() * GETTY_MAX_PAGE) + 1;
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

        const recentlySeen = await getRecentlySeenBySource('gettyArtwork', 30 * DAY_MS);
        let uuid: string | null = null;
        let attempts = 0;

        while (attempts < 15 && gettyUuidCache.length > 0) {
          const idx = Math.floor(Math.random() * gettyUuidCache.length);
          uuid = gettyUuidCache[idx];
          if (!recentlySeen.has(uuid)) break;
          gettyUuidCache.splice(idx, 1);
          uuid = null;
          attempts++;
        }

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
          subject_of?: Array<{ id?: string }>;
        };
        const imageUrl = obj.representation?.[0]?.id?.replace('/full/full/', '/full/!900,700/');
        if (!imageUrl) return null;
        const title = obj._label?.replace(/\s*\([^)]+\)\s*$/, '').trim() ?? '';
        const artist = obj.produced_by?.carried_out_by?.[0]?._label?.trim() ?? '';
        const caption = artist ? `${title} — ${artist}` : title;
        const link = obj.subject_of?.[0]?.id ?? null;
        await markItemSeen(uuid, 'gettyArtwork');
        return { imageUrl, caption, link };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'smithsonianNews',
    label: 'Smithsonian Smart News',
    weight: 8,
    fetch: async (ctx) => {
      try {
        if (smithsonianCache.length === 0) {
          const res = await fetch('https://www.smithsonianmag.com/rss/smart-news/', {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return null;
          const items = parseFeed(await res.text()).filter((it) => ctx.isValidFact(it.title));
          const recentlySeen = await getRecentlySeenBySource('smithsonianNews', 7 * DAY_MS);
          for (const it of items) {
            if (recentlySeen.has(it.link)) continue;
            smithsonianCache.push({ title: it.title, link: it.link, imageUrl: it.imageUrl, id: it.link });
          }
          smithsonianCache.sort(() => Math.random() - 0.5);
        }
        if (smithsonianCache.length === 0) return null;
        const pick = smithsonianCache.pop()!;
        await markItemSeen(pick.link!, 'smithsonianNews');
        if (pick.imageUrl) return { imageUrl: pick.imageUrl, caption: pick.title, link: pick.link };
        return { text: pick.title, link: pick.link, icon: '<img class="zen-icon-img" src="https://www.teachingforchange.org/wp-content/uploads/2022/04/smithsonian-magazine-logo-vector.png" alt="Smithsonian Magazine" />', hideLabel: true };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'atlasObscura',
    label: 'Atlas Obscura',
    weight: 8,
    fetch: async (ctx) => {
      try {
        if (atlasCache.length === 0) {
          const res = await fetch('https://www.atlasobscura.com/feeds/latest', {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return null;
          const items = parseFeed(await res.text()).filter((it) => ctx.isValidFact(it.title));
          const recentlySeen = await getRecentlySeenBySource('atlasObscura', 7 * DAY_MS);
          for (const it of items) {
            if (recentlySeen.has(it.link)) continue;
            let imageUrl: string | undefined;
            if (it.description) {
              const doc = new DOMParser().parseFromString(it.description, 'text/html');
              imageUrl = doc.querySelector('img')?.src;
            }
            atlasCache.push({ title: it.title, link: it.link, imageUrl, id: it.link });
          }
          atlasCache.sort(() => Math.random() - 0.5);
        }
        if (atlasCache.length === 0) return null;
        const pick = atlasCache.pop()!;
        await markItemSeen(pick.link!, 'atlasObscura');
        if (pick.imageUrl) return { imageUrl: pick.imageUrl, caption: pick.title, link: pick.link };
        return { text: pick.title, link: pick.link, icon: SVG_ATLAS };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'rijksmuseumArtwork',
    label: 'Rijksmuseum',
    weight: 6,
    fetch: async () => {
      const timeout = AbortSignal.timeout(12000);
      const headers = { Accept: 'application/ld+json' };

      try {
        if (rijksIdCache.length === 0) {
          const rand = Math.floor(Math.random() * (RIJKS_ID_MAX - RIJKS_ID_MIN)) + RIJKS_ID_MIN;
          const token = btoa(JSON.stringify({ token: `https://id.rijksmuseum.nl/200${rand}` }));
          const res = await fetch(
            `https://www.rijksmuseum.nl/search/collection?type=painting&imageAvailable=true&pageToken=${token}`,
            { signal: timeout },
          );
          if (!res.ok) return null;
          const page = await res.json() as {
            orderedItems?: Array<{ id?: string }>;
          };
          const ids = (page.orderedItems ?? [])
            .map((it) => it.id)
            .filter((id): id is string => !!id);
          if (ids.length === 0) return null;
          rijksIdCache.push(...ids.sort(() => Math.random() - 0.5));
        }

        const objectUrl = rijksIdCache.pop();
        if (!objectUrl) return null;

        const objRes = await fetch(objectUrl, { signal: timeout, headers });
        if (!objRes.ok) return null;
        const obj = await objRes.json() as {
          identified_by?: Array<{ type?: string; content?: string; language?: Array<{ id?: string }> }>;
          produced_by?: {
            part?: Array<{
              referred_to_by?: Array<{
                classified_as?: Array<{ id?: string }>;
                content?: string;
                language?: Array<{ id?: string }>;
              }>;
            }>;
          };
          subject_of?: Array<{
            digitally_carried_by?: Array<{ access_point?: Array<{ id?: string }> }>;
          }>;
        };

        const enLang = '300388277';
        const titleEntry = obj.identified_by?.find(
          (e) => e.type === 'Name' && e.language?.some((l) => l.id?.includes(enLang)),
        ) ?? obj.identified_by?.find((e) => e.type === 'Name');
        const title = titleEntry?.content?.trim() || 'Untitled';

        let artist = '';
        for (const part of obj.produced_by?.part ?? []) {
          for (const ref of part.referred_to_by ?? []) {
            if (ref.classified_as?.some((c) => c.id?.includes('300435417')) &&
                ref.language?.some((l) => l.id?.includes(enLang))) {
              artist = ref.content?.trim() ?? '';
            }
          }
        }

        const link = obj.subject_of?.[0]?.digitally_carried_by?.[0]?.access_point?.[0]?.id;

        const visualId = objectUrl.replace('/200', '/202');
        const visRes = await fetch(visualId, { signal: timeout, headers });
        if (!visRes.ok) return null;
        const vis = await visRes.json() as {
          digitally_shown_by?: Array<{ id?: string }>;
        };
        const digitalUrl = vis.digitally_shown_by?.[0]?.id;
        if (!digitalUrl) return null;

        const digRes = await fetch(digitalUrl, { signal: timeout, headers });
        if (!digRes.ok) return null;
        const dig = await digRes.json() as {
          access_point?: Array<{ id?: string }>;
        };
        const imageUrl = dig.access_point?.[0]?.id;
        if (!imageUrl) return null;

        const sized = imageUrl.replace('/full/max/', '/full/800,/');
        const caption = artist ? `${title} — ${artist}` : title;
        const itemId = objectUrl.split('/').pop() ?? objectUrl;
        await markItemSeen(itemId, 'rijksmuseumArtwork');
        const webUrl = itemId ? `https://www.rijksmuseum.nl/en/collection/${itemId}` : undefined;
        return { imageUrl: sized, caption, link: webUrl };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'customRss',
    label: 'Custom RSS Feeds',
    weight: 4,
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
    id: 'customJson',
    label: 'Custom API',
    weight: 4,
    fetch: async (ctx) => {
      const sources = await getCustomJsonSources();
      if (sources.length === 0) return null;
      const source = sources[Math.floor(Math.random() * sources.length)];
      try {
        const res = await fetch(source.url, { signal: AbortSignal.timeout(9000) });
        if (!res.ok) return null;
        const data = await res.json() as unknown;
        const items = Array.isArray(data)
          ? data as unknown[]
          : (data as { items?: unknown[] }).items ?? [];
        if (!Array.isArray(items) || items.length === 0) return null;
        const pick = items[Math.floor(Math.random() * Math.min(items.length, 20))] as {
          text?: string;
          image?: string;
          link?: string;
          attribution?: string;
        };
        if (!pick || typeof pick !== 'object') return null;
        const text = typeof pick.text === 'string' ? pick.text.trim() : '';
        const image = typeof pick.image === 'string' ? pick.image.trim() : '';
        const link = typeof pick.link === 'string' ? pick.link.trim() : undefined;
        const attribution = typeof pick.attribution === 'string' ? pick.attribution.trim() : '';
        if (image && (text || attribution)) {
          return { imageUrl: image, caption: attribution || text, link };
        }
        if (text && ctx.isValidFact(text)) {
          const displayText = attribution ? `${text} — ${attribution}` : text;
          return { text: displayText, link };
        }
        return null;
      } catch {
        return null;
      }
    },
  },
];

export function pickFetcher(fetchers: ZenFetcher[], disabledIds?: ReadonlySet<string>): ZenFetcher {
  return pickFetcherWithSignals(fetchers, {}, disabledIds);
}

export function pickFetcherWithSignals(
  fetchers: ZenFetcher[],
  signals: Record<string, number>,
  disabledIds?: ReadonlySet<string>,
): ZenFetcher {
  const pool = disabledIds ? fetchers.filter((f) => !disabledIds.has(f.id)) : fetchers;
  const available = pool.length > 0 ? pool : fetchers;
  const total = available.reduce((sum, f) => sum + getWeightedScore(f.id, f.weight, signals), 0);
  let roll = Math.random() * total;
  for (const f of available) {
    roll -= getWeightedScore(f.id, f.weight, signals);
    if (roll <= 0) return f;
  }
  return available[available.length - 1];
}

function getWeightedScore(sourceId: string, baseWeight: number, signals: Record<string, number>): number {
  const signal = Math.max(0, signals[sourceId] ?? 0);
  return baseWeight * (1 + Math.min(signal, 12) * 0.15);
}

async function resolveAlbumOfDay(album: AlbumOfDaySeed): Promise<ZenArtResult | null> {
  const cacheKey = `${album.artist}::${album.title}`.toLowerCase();
  if (albumOfDayCache.has(cacheKey)) {
    return albumOfDayCache.get(cacheKey) ?? null;
  }

  try {
    const query = [
      `releasegroup:"${escapeMusicBrainzQuery(album.title)}"`,
      `artist:"${escapeMusicBrainzQuery(album.artist)}"`,
      'primarytype:album',
    ].join(' AND ');

    const searchRes = await fetch(
      `https://musicbrainz.org/ws/2/release-group?fmt=json&limit=5&query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!searchRes.ok) {
      albumOfDayCache.set(cacheKey, null);
      return null;
    }

    const data = await searchRes.json() as { 'release-groups'?: MusicBrainzReleaseGroup[] };
    const groups = (data['release-groups'] ?? [])
      .filter((group) => group.id)
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

    for (const group of groups) {
      const cover = await fetchReleaseGroupCover(group.id);
      const resolvedCover = cover ?? await fetchReleaseCoverForGroup(group.id, album);
      if (!resolvedCover) continue;

      const artist = readArtistCredit(group['artist-credit']) || album.artist;
      const title = group.title?.trim() || album.title;
      const year = group['first-release-date']?.slice(0, 4) || (album.year ? String(album.year) : '');
      const caption = [title, artist, year].filter(Boolean).join(' · ');
      const result: ZenArtResult = {
        imageUrl: resolvedCover,
        caption,
        link: `https://musicbrainz.org/release-group/${group.id}`,
      };
      albumOfDayCache.set(cacheKey, result);
      return result;
    }
  } catch {
    albumOfDayCache.set(cacheKey, null);
    return null;
  }

  albumOfDayCache.set(cacheKey, null);
  return null;
}

async function fetchReleaseGroupCover(releaseGroupId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://coverartarchive.org/release-group/${releaseGroupId}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json() as { images?: CoverArtImage[] };
    const images = data.images ?? [];
    const front = images.find((image) => image.front)
      ?? images.find((image) => image.types?.includes('Front'))
      ?? images[0];
    if (!front) return null;

    return front.thumbnails?.['500']
      ?? front.thumbnails?.large
      ?? front.thumbnails?.['250']
      ?? front.image
      ?? null;
  } catch {
    return null;
  }
}

async function fetchReleaseCoverForGroup(releaseGroupId: string, album: AlbumOfDaySeed): Promise<string | null> {
  try {
    const query = [
      `rgid:${releaseGroupId}`,
      `release:"${escapeMusicBrainzQuery(album.title)}"`,
      `artist:"${escapeMusicBrainzQuery(album.artist)}"`,
    ].join(' AND ');
    const res = await fetch(
      `https://musicbrainz.org/ws/2/release?fmt=json&limit=5&query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;

    const data = await res.json() as { releases?: MusicBrainzRelease[] };
    const releases = (data.releases ?? [])
      .filter((release) => release.id)
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

    for (const release of releases) {
      const cover = await fetchReleaseCover(release.id);
      if (cover) return cover;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchReleaseCover(releaseId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://coverartarchive.org/release/${releaseId}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json() as { images?: CoverArtImage[] };
    const images = data.images ?? [];
    const front = images.find((image) => image.front)
      ?? images.find((image) => image.types?.includes('Front'))
      ?? images[0];
    if (!front) return null;

    return front.thumbnails?.['500']
      ?? front.thumbnails?.large
      ?? front.thumbnails?.['250']
      ?? front.image
      ?? null;
  } catch {
    return null;
  }
}

function readArtistCredit(credits?: MusicBrainzReleaseGroup['artist-credit']): string {
  return (credits ?? [])
    .map((credit) => credit.name?.trim() || credit.artist?.name?.trim() || '')
    .join('')
    .trim();
}

function escapeMusicBrainzQuery(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function getAlbumDayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function readCommonsTitle(
  fallbackTitle?: string,
  metadata?: Record<string, { value?: string }>,
): string {
  const objectName = readCommonsMetadata(metadata, ['ObjectName', 'Title']);
  if (objectName) return objectName;

  const fileTitle = fallbackTitle?.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();
  return fileTitle || 'Painting';
}

function readCommonsYear(metadata?: Record<string, { value?: string }>): string {
  const raw = readCommonsMetadata(metadata, ['DateTimeOriginal', 'Date']);
  const match = raw.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match?.[1] ?? raw;
}

function readCommonsMetadata(
  metadata: Record<string, { value?: string }> | undefined,
  keys: string[],
): string {
  for (const key of keys) {
    const value = metadata?.[key]?.value?.trim();
    if (!value) continue;
    const text = stripHtml(value)
      .replace(/\s+/g, ' ')
      .replace(/^\|+|\|+$/g, '')
      .trim();
    if (text) return text;
  }

  return '';
}

function stripHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.body.textContent?.trim() ?? '';
}
