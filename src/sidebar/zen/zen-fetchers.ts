import {
  AI_PATTERNS,
  AFFIRMATIONS_PREDEFINED,
  CHALLENGES,
  QUOTES_PREDEFINED,
  SVG_AFFIRM,
  SVG_CHALLENGE,
  SVG_HN,
  SVG_QUOTE,
  escapeHtml,
} from './zen-content';

export type ZenTextResult = { text: string; link?: string; icon?: string; html?: string };
export type ZenArtResult = { imageUrl: string; caption: string };
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
let predefinedQueue: Array<{ text: string; icon: string }> = [];

function decodeHtml(str: string): string {
  return new DOMParser().parseFromString(str, 'text/html').body.textContent ?? str;
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
        return ctx.isValidFact(text) ? { text } : null;
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
        return ctx.isValidFact(text) ? { text } : null;
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
        return { text: author ? `${quote} — ${author}` : quote };
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
        return { text: author ? `${raw} — ${author}` : raw };
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
        return { text: author ? `${quote} — ${author}` : quote };
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
        return text ? { text } : null;
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
        if (title.length < 10 || AI_PATTERNS.some((p) => p.test(title))) return null;
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
          .filter((p) => !p.stickied && !p.over_18 && p.score > 50 && p.title.length >= 20)
          .filter((p) => !AI_PATTERNS.some((pat) => pat.test(p.title)));
        if (posts.length === 0) return null;
        const pick = posts[Math.floor(Math.random() * Math.min(posts.length, 10))];
        return {
          text: `r/${sub}: ${pick.title}`,
          link: `https://www.reddit.com${pick.permalink}`,
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
    weight: 6,
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
    label: 'Mars Rover Photos',
    weight: 6,
    fetch: async () => {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const currentYear = today.getFullYear();

      const year = Math.floor(Math.random() * (currentYear - 2014)) + 2014;
      const date = `${year}-${mm}-${dd}`;

      const rovers: string[] = ['curiosity'];
      if (year >= 2022) rovers.push('perseverance');

      try {
        const responses = await Promise.allSettled(
          rovers.map((rover) =>
            fetch(`https://rovers.nebulum.one/api/v1/rovers/${rover}/photos?earth_date=${date}`, {
              signal: AbortSignal.timeout(9000),
            }).then((r) => (r.ok ? r.json() : null)),
          ),
        );

        const photos: Array<{ img_src: string; camera: { full_name: string }; rover: { name: string } }> = [];
        for (const res of responses) {
          if (res.status === 'fulfilled' && res.value) {
            const data = res.value as { photos?: Array<{ img_src: string; camera: { full_name: string }; rover: { name: string } }> };
            photos.push(...(data.photos ?? []));
          }
        }

        if (photos.length === 0) return null;
        const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 20))];
        return {
          imageUrl: photo.img_src,
          caption: `Mars · ${photo.rover.name} · ${photo.camera.full_name} · ${date}`,
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
        return { text: author ? `${quote} — ${author}` : quote };
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
        return { text: author ? `${text} — ${author}` : text, link };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'predefined',
    label: 'Predefined Messages',
    weight: 20,
    fetch: async () => {
      if (predefinedQueue.length === 0) {
        const pool = [
          ...CHALLENGES.map((text) => ({ text, icon: SVG_CHALLENGE })),
          ...AFFIRMATIONS_PREDEFINED.map((text) => ({ text, icon: SVG_AFFIRM })),
          ...QUOTES_PREDEFINED.map((text) => ({ text, icon: SVG_QUOTE })),
        ];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        predefinedQueue = pool;
      }
      const item = predefinedQueue.pop();
      return item ? { text: item.text, icon: item.icon } : null;
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
