import { MSG, type RuntimeMessage } from '../shared/messages';
import { embed, embedBatch } from '../shared/embeddings/engine';
import { addSnippet, deleteSnippet, getAllSnippets, search, hasSnippetForUrl } from '../shared/embeddings/vector-store';
import { MAX_CAPTURE_CHARS, SEARCH_TOP_K } from '../shared/constants';
import { getSettings, getOpenAIKey, getGeminiKey } from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import type { Snippet } from '../shared/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function captureSnippet(text: string, url: string, title: string, source: Snippet['source'] = 'manual'): Promise<void> {
  const trimmed = text.slice(0, MAX_CAPTURE_CHARS);
  const embedding = await embed(trimmed);
  const snippet: Snippet = {
    id: generateId(),
    text: trimmed,
    url,
    title,
    timestamp: Date.now(),
    embedding,
    source,
  };
  await addSnippet(snippet);
}

async function generateInsight(
  snippetSample: { text: string; title: string; source: string }[],
  previousInsights: string[] = [],
): Promise<string> {
  const settings = await getSettings();
  const key = settings.llmProvider === 'gemini' ? await getGeminiKey() : await getOpenAIKey();
  if (!key.trim()) throw new Error('No API key');

  const context = snippetSample
    .map((s, i) => `[${i + 1}] ${s.title || s.text.slice(0, 80)}`)
    .join('\n');

  const strategy = getProviderStrategy(settings.llmProvider);
  const model = settings.llmProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  const systemPrompt =
    `You are a well-read friend who reads a lot and remembers odd things. ` +
    `You are given a sample of the user's saved snippets and browsing history. ` +
    `Based on the ACTUAL TOPICS in their data, share ONE short interesting thing. ` +
    `You MUST randomly pick a DIFFERENT category each time. The categories are:\n` +
    `1. An evidence-based health or cognitive performance insight from peer-reviewed research\n` +
    `2. A surprising scientific or historical fact connected to one of their topics\n` +
    `3. A book or paper recommendation from an acclaimed author or researcher — never recommend apps, products, or commercial tools\n` +
    `4. A quote from a great thinker, scientist, or writer with attribution (e.g. "— Seneca")\n` +
    `5. A Japanese, Zen, Arabic, Persian, or African proverb with origin\n` +
    `6. An unexpected intellectual connection between two of their topics\n` +
    `7. A thought experiment or research question inspired by their interests\n` +
    `8. A lesser-known fact about something they've been exploring\n` +
    `9. A mental model or reasoning framework used by experts in a relevant field\n` +
    `10. A counterintuitive finding from research that challenges common assumptions about their topics\n\n` +
    `RULES:\n` +
    `- NEVER recommend commercial products, apps, services, or brands. Only recommend books, papers, ideas, or techniques.\n` +
    `- Speak as a knowledgeable academic, not a marketer. No promotional language.\n` +
    `- The content MUST be grounded in their actual data — pick a specific topic and build from it.\n` +
    `- Do NOT say "based on your history" or "I noticed you were reading about". Just present it directly.\n` +
    `- To pick a category: assign each a number 1-10, think of a random 5-digit number, add its digits, pick the remainder mod 10.\n` +
    `- Keep it to 1-2 sentences. No labels, no prefixes like "Tip:", "Fact:", "Quote:".\n` +
    `- WRITING STYLE: Write like a real person, not an AI. Avoid these patterns:\n` +
    `  * No words like: crucial, delve, vibrant, tapestry, landscape, pivotal, foster, underscore, showcase, enhance, leverage, streamline, groundbreaking, nestled, testament, enduring\n` +
    `  * No em dashes. Use commas or periods instead.\n` +
    `  * No rule-of-three lists. Don't force ideas into groups of three.\n` +
    `  * No -ing phrases tacked on for fake depth (highlighting, emphasizing, reflecting, showcasing, underscoring)\n` +
    `  * No "serves as", "stands as" — just use "is"\n` +
    `  * No promotional puffery: "breathtaking", "stunning", "remarkable", "extraordinary"\n` +
    `  * No hedging: "it could potentially be argued that"\n` +
    `  * No generic conclusions: "the future looks bright"\n` +
    `  * Vary sentence length. Mix short and long. Don't make every sentence the same structure.\n` +
    `  * Be specific, not vague. Name the researcher, the year, the page number.\n` +
    `  * Sound like a person sharing something interesting over coffee, not a press release.` +
    (previousInsights.length > 0
      ? `\n\nIMPORTANT: Do NOT repeat, rephrase, or use the same category as any of these previous outputs:\n${previousInsights.map((p) => `- ${p}`).join('\n')}`
      : '');

  try {
    return await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `My saved data:\n${context}` },
      ],
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const HISTORY_ALARM = 'sonto-history-sync';
const HISTORY_SYNC_INTERVAL_MINUTES = 30;
const HISTORY_INITIAL_DAYS = 30;
const HISTORY_MAX_RESULTS = 500;

const BATCH_SIZE = 100;

async function syncHistory(startTime?: number): Promise<void> {
  const msPerDay = 86400000;
  const defaultStart = Date.now() - HISTORY_INITIAL_DAYS * msPerDay;
  const items = await chrome.history.search({
    text: '',
    startTime: startTime ?? defaultStart,
    maxResults: HISTORY_MAX_RESULTS,
  });

  const pending: { text: string; url: string; title: string }[] = [];
  for (const item of items) {
    const url = item.url ?? '';
    const title = item.title ?? '';
    if (!url || !title.trim()) continue;
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
    if (await hasSnippetForUrl(url)) continue;
    const embedText = `${title.trim()} — ${url}`;
    pending.push({ text: embedText, url, title });
  }

  if (pending.length === 0) return;
  console.log(`[Sonto] syncing ${pending.length} history items`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await embedBatch(batch.map((b) => b.text));
      for (let j = 0; j < batch.length; j++) {
        const { text, url, title } = batch[j];
        const snippet: Snippet = {
          id: generateId(),
          text: text.slice(0, MAX_CAPTURE_CHARS),
          url,
          title,
          timestamp: Date.now(),
          embedding: embeddings[j],
          source: 'history',
        };
        await addSnippet(snippet);
      }
      console.log(`[Sonto] embedded batch ${i + 1}-${i + batch.length}`);
    } catch (err) {
      console.error('[Sonto] history batch failed:', err);
      break;
    }
  }
}

async function scheduleHistorySync(): Promise<void> {
  const existing = await chrome.alarms.get(HISTORY_ALARM);
  if (!existing) {
    chrome.alarms.create(HISTORY_ALARM, { periodInMinutes: HISTORY_SYNC_INTERVAL_MINUTES });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sonto-save',
    title: 'Save to Sonto',
    contexts: ['selection'],
  });

  void scheduleHistorySync();
  void syncHistory();
});

void scheduleHistorySync();
void syncHistory();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HISTORY_ALARM) return;
  const startTime = Date.now() - HISTORY_SYNC_INTERVAL_MINUTES * 60 * 1000;
  void syncHistory(startTime);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'sonto-save') return;
  const text = info.selectionText ?? '';
  const url = tab?.url ?? '';
  const title = tab?.title ?? '';
  if (!text.trim()) return;

  void captureSnippet(text, url, title).catch((err: unknown) => {
    console.error('[Sonto] context menu capture failed', err);
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'capture_selection') return;

  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'SONTO_CAPTURE_SHORTCUT' });
  })();
});

chrome.action.onClicked.addListener((tab) => {
  void chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === MSG.OPEN_SETTINGS) {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === MSG.CAPTURE_SNIPPET) {
    const { text, url, title } = message;
    void captureSnippet(text, url, title)
      .then(() => {
        void chrome.runtime.sendMessage({ type: MSG.SNIPPET_ADDED }).catch(() => {});
        sendResponse({ ok: true, type: MSG.CAPTURE_SUCCESS });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, type: MSG.CAPTURE_ERROR, message: msg });
      });
    return true;
  }

  if (message.type === MSG.QUERY_SNIPPETS) {
    void embed(message.query)
      .then((queryEmbedding) => search(queryEmbedding, SEARCH_TOP_K))
      .then((results) => sendResponse({ ok: true, results }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, message: msg });
      });
    return true;
  }

  if (message.type === MSG.DELETE_SNIPPET) {
    void deleteSnippet(message.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, message: msg });
      });
    return true;
  }

  if (message.type === MSG.GET_ALL_SNIPPETS) {
    void getAllSnippets()
      .then((snippets) => sendResponse({ ok: true, snippets }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ ok: false, message: msg });
      });
    return true;
  }

  if (message.type === MSG.GENERATE_INSIGHT) {
    console.log('[Sonto] generating insight for', message.snippetSample.length, 'snippets');
    void generateInsight(message.snippetSample, message.previousInsights ?? [])
      .then((insight) => {
        console.log('[Sonto] insight generated:', insight.slice(0, 60));
        sendResponse({ ok: true, insight });
      })
      .catch((err) => {
        console.error('[Sonto] insight generation failed:', err);
        sendResponse({ ok: false });
      });
    return true;
  }
});
