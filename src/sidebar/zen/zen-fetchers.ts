import {
  AI_PATTERNS,
  AFFIRMATIONS_PREDEFINED,
  CHALLENGES,
  QUOTES_PREDEFINED,
  SVG_AFFIRM,
  SVG_CHALLENGE,
  SVG_QUOTE,
} from './zen-content';

export type ZenTextResult = { text: string; link?: string; icon?: string };
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
  436535, 437329, 436121, 11417, 45734, 437984, 436527, 436532, 437980, 436528,
  10481, 459055, 436524, 437331, 436533, 452658, 436529, 436534, 436530, 436526,
];

let triviaCache: Array<{ question: string; answer: string }> = [];
let predefinedQueue: Array<{ text: string; icon: string }> = [];

function decodeHtml(str: string): string {
  return new DOMParser().parseFromString(str, 'text/html').body.textContent ?? str;
}

function getGeolocation(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    const timer = setTimeout(() => reject(new Error('timeout')), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve(pos.coords); },
      (err) => { clearTimeout(timer); reject(err); },
      { timeout: 6000, maximumAge: 300000 },
    );
  });
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
        return { text: `HN: ${title}`, link };
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
          const res = await fetch(
            `https://opentdb.com/api.php?amount=10&category=${cat}&difficulty=hard&type=multiple`,
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
      const text = `${item.question} ${item.answer}.`;
      if (text.length < 30) return null;
      const query = encodeURIComponent(`${item.question} ${item.answer}`);
      return { text, link: `https://www.google.com/search?q=${query}` };
    },
  },
  {
    id: 'weather',
    label: 'Weather',
    weight: 4,
    fetch: async (ctx) => {
      const WMO_EN: Record<number, string> = {
        0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
        45: 'foggy', 48: 'icy fog',
        51: 'light drizzle', 53: 'moderate drizzle', 55: 'heavy drizzle',
        61: 'light rain', 63: 'moderate rain', 65: 'heavy rain',
        71: 'light snow', 73: 'moderate snow', 75: 'heavy snow',
        80: 'rain showers', 81: 'moderate showers', 82: 'heavy showers',
        95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm',
      };
      const WMO_DE: Record<number, string> = {
        0: 'klarer Himmel', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt',
        45: 'Nebel', 48: 'Eisnebel',
        51: 'leichter Nieselregen', 53: 'mäßiger Nieselregen', 55: 'starker Nieselregen',
        61: 'leichter Regen', 63: 'mäßiger Regen', 65: 'starker Regen',
        71: 'leichter Schnee', 73: 'mäßiger Schnee', 75: 'starker Schnee',
        80: 'Regenschauer', 81: 'mäßige Schauer', 82: 'starke Schauer',
        95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter',
      };
      try {
        const coords = await getGeolocation();
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weathercode,wind_speed_10m&timezone=auto`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json() as {
          current?: { temperature_2m?: number; weathercode?: number; wind_speed_10m?: number };
        };
        const c = data.current;
        if (!c) return null;
        const temp = Math.round(c.temperature_2m ?? 0);
        const wind = Math.round(c.wind_speed_10m ?? 0);
        const code = c.weathercode ?? 0;
        const wmo = ctx.language === 'de' ? WMO_DE : WMO_EN;
        const condition = wmo[code] ?? (ctx.language === 'de' ? 'wechselhaft' : 'mixed conditions');
        const text = ctx.language === 'de'
          ? `Aktuell ${temp}°C, ${condition}, Wind ${wind} km/h.`
          : `Currently ${temp}°C with ${condition} and ${wind} km/h winds.`;
        return { text };
      } catch {
        return null;
      }
    },
  },
  {
    id: 'metArtwork',
    label: 'Met Artwork',
    weight: 12,
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
