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

const TRIVIA_CATEGORIES = [9, 10, 17, 18, 25];

const REDDIT_SUBREDDITS = [
  'todayilearned', 'science', 'Futurology', 'space', 'history',
  'technology', 'programming', 'entrepreneur', 'interestingasfuck', 'philosophy',
  'business', 'AskScience', 'dataisbeautiful',
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

let triviaCache: Array<{ question: string; answer: string }> = [];
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

const MULTIPLE_CHOICE_RE = /which of (the following|these|those)|all of the following|none of the following|which one of|which statement|following\s+(is|are|was|were)\s+(not\s+)?(true|false|correct|incorrect)/i;

function isMultipleChoiceTrivia(question: string): boolean {
  return MULTIPLE_CHOICE_RE.test(question);
}

export const ZEN_FETCHERS: ZenFetcher[] = [
  {
    id: 'uselessFacts',
    label: 'Random Facts',
    weight: 7,
    fetch: async (ctx) => {
      try {
        const res = await fetch(
          `https://uselessfacts.jsph.pl/api/v2/facts/random?language=${ctx.language}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { text?: string };
        const text = data.text?.trim() ?? '';
        return ctx.isValidFact(text) ? { text: stripWrappingQuotes(text) } : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: 'adviceSlip',
    label: 'Advice Slip',
    weight: 5,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://api.adviceslip.com/advice', {
          signal: AbortSignal.timeout(8000),
          cache: 'no-cache',
        });
        if (!res.ok) return null;
        const data = await res.json() as { slip?: { advice: string } };
        const text = data.slip?.advice.trim() ?? '';
        return ctx.isValidFact(text) ? { text: stripWrappingQuotes(text) } : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: 'stoicQuote',
    label: 'Stoic Quotes',
    weight: 5,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://stoic.tekloon.net/stoic-quote', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json() as { data?: { quote?: string; author?: string } };
        const quote = data.data?.quote?.trim() ?? '';
        const author = data.data?.author?.trim();
        if (!ctx.isValidFact(quote)) return null;
        const full = author ? `${quote} — ${author}` : quote;
        return { text: wrapQuotes(full) };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'designQuote',
    label: 'Design Quotes',
    weight: 4,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch(
          `https://quotesondesign.com/wp-json/custom/v1/random-post?nocache=${Date.now()}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { title?: string; content?: string };
        const decoded = new DOMParser().parseFromString(data.content ?? '', 'text/html').body.textContent ?? '';
        const raw = decoded.trim();
        const author = data.title?.trim();
        if (!ctx.isValidFact(raw)) return null;
        const full = author ? `${raw} — ${author}` : raw;
        return { text: wrapQuotes(full) };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'zenQuote',
    label: 'Zen Quotes',
    weight: 5,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://zenquotes.io/api/random', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json() as Array<{ q?: string; a?: string }>;
        const item = data[0];
        const quote = item?.q?.trim() ?? '';
        const author = item?.a?.trim();
        if (!ctx.isValidFact(quote)) return null;
        const full = author ? `${quote} — ${author}` : quote;
        return { text: wrapQuotes(full) };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'affirmation',
    label: 'Affirmations',
    weight: 5,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://www.affirmations.dev/', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json() as { affirmation?: string };
        const text = data.affirmation?.trim() ?? '';
        return text ? { text: wrapQuotes(text) } : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: 'hnStory',
    label: 'Hacker News',
    weight: 8,
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
    weight: 8,
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
    id: 'trivia',
    label: 'Trivia',
    weight: 7,
    fetch: async () => {
      if (triviaCache.length === 0) {
        try {
          const cat = TRIVIA_CATEGORIES[Math.floor(Math.random() * TRIVIA_CATEGORIES.length)];
          const difficulty = Math.random() < 0.5 ? 'hard' : 'medium';
          const res = await fetch(
            `https://opentdb.com/api.php?amount=10&category=${cat}&difficulty=${difficulty}&type=multiple`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!res.ok) return null;
          const data = await res.json() as {
            response_code: number;
            results: Array<{ question: string; correct_answer: string }>;
          };
          if (data.response_code !== 0 || !data.results?.length) return null;
          triviaCache = data.results.map((r) => ({
            question: decodeHtml(r.question),
            answer: decodeHtml(r.correct_answer),
          }));
        } catch {
          return null;
        }
      }

      const item = triviaCache.splice(Math.floor(Math.random() * triviaCache.length), 1)[0];
      if (!item) return null;
      if ((item.question + item.answer).length < 20) return null;
      if (isMultipleChoiceTrivia(item.question)) return null;
      const query = encodeURIComponent(`${item.question} ${item.answer}`);
      const html = `<span class="zen-trivia-answer">${escapeHtml(item.answer)}</span><span class="zen-trivia-question">${escapeHtml(item.question)}</span>`;
      return {
        text: `${item.answer}. ${item.question}`,
        link: `https://www.google.com/search?q=${query}`,
        html,
      };
    },
  },
  {
    id: 'metArtwork',
    label: 'Met Artwork',
    weight: 4,
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
    id: 'nasaMarsImage',
    label: 'NASA Mars Images',
    weight: 2,
    fetch: async () => {
      try {
        const page = Math.floor(Math.random() * 33) + 1;
        const res = await fetch(
          `https://images-api.nasa.gov/search?q=mars+surface&media_type=image&page_size=100&page=${page}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as {
          collection?: {
            items?: Array<{
              data?: Array<{ title?: string; date_created?: string; description?: string }>;
              links?: Array<{ href?: string; render?: string }>;
            }>;
          };
        };
        const items = (data.collection?.items ?? []).filter((it) => {
          if (!it.links?.some((l) => l.render === 'image' && l.href)) return false;
          const title = it.data?.[0]?.title?.trim() ?? '';
          // Skip archive catalog codes like "KSC-05pd-0823" — no spaces, contains dashes
          if (title && !title.includes(' ') && title.includes('-')) return false;
          return true;
        });
        if (items.length === 0) return null;
        const pick = items[Math.floor(Math.random() * items.length)];
        const meta = pick.data?.[0];
        const href = pick.links?.find((l) => l.render === 'image')?.href ?? '';
        // Prefer ~small.jpg over ~thumb.jpg for better resolution
        const imageUrl = href.replace('~thumb.jpg', '~small.jpg');
        const title = meta?.title?.trim() || 'Mars';
        const year = meta?.date_created ? new Date(meta.date_created).getFullYear() : '';
        const caption = year ? `${title} · NASA · ${year}` : `${title} · NASA`;
        return { imageUrl, caption };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'marsRover',
    label: 'Perseverance Rover',
    weight: 2,
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
    id: 'funQuote',
    label: 'Fun Quotes',
    weight: 4,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://abhi-api.vercel.app/api/fun/quotes', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json() as { result?: { quote?: string; author?: string } };
        const quote = data.result?.quote?.trim() ?? '';
        const author = data.result?.author?.trim();
        if (!ctx.isValidFact(quote)) return null;
        const full = author ? `${quote} — ${author}` : quote;
        return { text: wrapQuotes(full) };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'favqsQotd',
    label: 'Quote of the Day',
    weight: 5,
    fetch: async (ctx) => {
      if (ctx.language !== 'en') return null;
      try {
        const res = await fetch('https://favqs.com/api/qotd', {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json() as { quote?: { body?: string; author?: string; url?: string } };
        const text = data.quote?.body?.trim() ?? '';
        const author = data.quote?.author?.trim();
        const link = data.quote?.url;
        if (!ctx.isValidFact(text)) return null;
        const full = author ? `${text} — ${author}` : text;
        return { text: wrapQuotes(full) };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'clevelandArtwork',
    label: 'Cleveland Museum of Art',
    weight: 4,
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
    weight: 5,
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
    weight: 6,
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
    weight: 5,
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
    id: 'smithsonianNews',
    label: 'Smithsonian Smart News',
    weight: 6,
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
    weight: 6,
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
