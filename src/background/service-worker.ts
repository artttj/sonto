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

const GENERATE_PROMPT =
  `You receive browsing data. Pick ONE topic from it and share ONE actionable tip, shortcut, or technique that helps the user work better or faster with that topic. 1-2 sentences max.\n\n` +
  `## RULES\n` +
  `- The tip must be practical and specific. Something the user can apply right now.\n` +
  `- Focus on: keyboard shortcuts, hidden features, workflow tricks, performance tips, config tweaks, CLI flags, lesser-known settings, or efficiency techniques.\n` +
  `- ONLY write about things you are 100% certain about. If unsure, pick a different topic.\n` +
  `- NEVER describe or define what something is. NEVER say "X is a tool/platform that does Y." The user already knows.\n` +
  `- NEVER make claims about people unless globally famous.\n` +
  `- NEVER invent features, shortcuts, or commands. Everything must be real.\n` +
  `- NEVER reference the user's browsing, history, or data. Just state the tip.\n` +
  `- No proverbs, no quotes, no fun facts. Only useful information.\n\n` +
  `## STYLE\n` +
  `- Write like a short text from a friend. No labels, no "Pro tip:", no "Did you know".\n` +
  `- Period or comma only. No em dashes.\n` +
  `- No AI words: "delve," "tapestry," "vibrant," "pivotal," "underscore," "testament," "nestled," "landscape," "renowned," "notable."\n` +
  `- No puffery: "fascinating," "remarkable," "extraordinary," "stunning."\n` +
  `- Just state the tip. Nothing else.`;

const VALIDATE_PROMPT =
  `You are a strict fact-checker. You will receive a short tip or technique.\n\n` +
  `Check ALL of these:\n` +
  `1. Is it factually accurate? Does the feature, shortcut, or technique actually exist and work as described?\n` +
  `2. Is it practical and actionable? Can someone use this right now?\n` +
  `3. Is it a definition or description instead of a tip? ("X is a tool that does Y" is NOT a tip.)\n` +
  `4. Does it reference the user's browsing or history? This is NOT allowed.\n` +
  `5. Is it a proverb, quote, or general life advice? This is NOT allowed. Only practical tips.\n` +
  `6. Does it start with "Here's a", "Pro tip:", "Fun fact:", or "Did you know"? NOT allowed.\n\n` +
  `Respond with EXACTLY one of these:\n` +
  `- PASS (only if all checks pass)\n` +
  `- FAIL: <a replacement 1-2 sentence actionable tip about the same or similar topic>\n\n` +
  `Be strict. Any doubt means FAIL.`;

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

  const doNotRepeat = previousInsights.length > 0
    ? `\n\n## DO NOT REPEAT\n${previousInsights.map((p) => `- ${p}`).join('\n')}`
    : '';

  const controller1 = new AbortController();
  const timer1 = setTimeout(() => controller1.abort(), 15000);

  let draft: string;
  try {
    draft = await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: GENERATE_PROMPT + doNotRepeat },
        { role: 'user', content: `My saved data:\n${context}` },
      ],
      signal: controller1.signal,
    });
  } finally {
    clearTimeout(timer1);
  }

  const controller2 = new AbortController();
  const timer2 = setTimeout(() => controller2.abort(), 15000);

  let verdict: string;
  try {
    verdict = await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: VALIDATE_PROMPT },
        { role: 'user', content: draft },
      ],
      signal: controller2.signal,
    });
  } finally {
    clearTimeout(timer2);
  }

  const trimmed = verdict.trim();
  if (trimmed === 'PASS') return draft;

  const failMatch = /^FAIL:\s*(.+)/s.exec(trimmed);
  if (failMatch) return failMatch[1].trim();

  return draft;
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
