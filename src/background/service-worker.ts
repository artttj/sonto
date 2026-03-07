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
  void chrome.runtime.sendMessage({ type: MSG.SNIPPET_ADDED }).catch(() => {});
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
    `You are a grounded, well-read friend who values accuracy over entertainment. ` +
    `You will receive a sample of the user's browsing history. ` +
    `Your task: Identify ONE specific topic from their data and share ONE brief, verified insight. ` +

    `### THE DATA RULE\n` +
    `Focus on a concrete noun from their history (a person, a book, a specific scientific concept, or a historical event). Do not be vague.\n` +
    `NEVER state what something is or give a Wikipedia-style definition. The user already knows what things in their history are. Instead, share something they almost certainly DON'T know about that topic, a hidden detail, an origin story, a surprising connection, a lesser-known fact behind it.\n` +
    `BAD: "Jira, developed by Atlassian and first released in 2002, is a popular project management tool." (The user already knows this.)\n` +
    `GOOD: "Jira's name comes from 'Gojira,' the Japanese name for Godzilla. The Atlassian founders were fans of Godzilla movies."\n\n` +

    `### THE CATEGORIES (Pick one at random each time):\n` +
    `1. A verbatim quote from a real person. You must be able to cite the speaker and the context.\n` +
    `2. A real Japanese, Zen, Arabic, Persian, or African proverb with its cultural origin.\n` +
    `3. A documented scientific or historical fact (dates/names included).\n` +
    `4. A real book recommendation. Include the author's full name. The book must exist in the real world.\n` +
    `5. A health/cognitive finding from a specific, named university or peer-reviewed journal.\n` +
    `6. A verified, non-obvious connection between two distinct topics in their history.\n\n` +

    `### CRITICAL ACCURACY GUARDRAILS:\n` +
    `- ZERO TOLERANCE FOR HALLUCINATION. If you cannot recall a specific, verifiable source for a fact, do not use it.\n` +
    `- If you are unsure if a quote is real or attributed to the right person (e.g., "misattributed to Einstein"), discard it.\n` +
    `- Do not use "common knowledge" that is actually a myth (e.g., Napoleon being short or humans using 10% of their brain).\n` +
    `- If the history is too sparse to find a 100% certain fact, provide a classic, verified proverb (Category 2).\n\n` +

    `### STYLE & TONE:\n` +
    `- Write like a real person sending a quick text. No labels like "Fact:" or "Quote:".\n` +
    `- 1-2 sentences max. No em-dashes. Use commas or periods.\n` +
    `- Do not mention the browser history or "your reading." Just state the thing.\n` +
    `- NO AI-SPEAK: Avoid "delve," "tapestry," "vibrant," "pivotal," "underscore," "shines a light," "testament," or "nestled."\n` +
    `- NO PUFFERY: Avoid "fascinating," "extraordinary," "stunning," or "remarkable."\n` +
    `- Avoid -ing starters (e.g., "Highlighting the importance..."). Use active, simple verbs.\n\n` +

    (previousInsights.length > 0
      ? `### DO NOT REPEAT THESE PREVIOUS OUTPUTS:\n${previousInsights.map((p) => `- ${p}`).join('\n')}`
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
