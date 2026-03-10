// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG, type RuntimeMessage } from '../shared/messages';
import { embed, embedBatch } from '../shared/embeddings/engine';
import {
  addSnippet,
  deleteSnippet,
  getAllSnippets,
  getRelatedSnippets,
  getSnippetsForDomain,
  getSnippetById,
  search,
  hasSnippetForUrl,
  updateSnippet,
} from '../shared/embeddings/vector-store';
import { MAX_CAPTURE_CHARS, SEARCH_TOP_K } from '../shared/constants';
import {
  getSettings,
  getOpenAIKey,
  getGeminiKey,
  isHistoryEnabled,
  isOnboardingDone,
  getReadLater,
  saveReadLater,
  getStoredDigest,
  saveStoredDigest,
  saveLastDigestAt,
  getLastDigestAt,
} from '../shared/storage';
import { getProviderStrategy } from '../shared/providers';
import type { Snippet } from '../shared/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function captureSnippet(
  text: string,
  url: string,
  title: string,
  source: Snippet['source'] = 'manual',
  context?: string,
  tags?: string[],
  pinned?: boolean,
): Promise<void> {
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
    ...(context ? { context: context.slice(0, 500) } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(pinned ? { pinned } : {}),
  };
  await addSnippet(snippet);
  void chrome.runtime.sendMessage({ type: MSG.SNIPPET_ADDED }).catch(() => {});
}

const EXTRACT_CATEGORIES_PROMPT =
  `You receive titles and content from a user's browsing history and saved snippets.\n` +
  `Extract 15-20 specific interest categories that describe what this person genuinely reads about.\n\n` +
  `Be specific and detailed:\n` +
  `- NOT "programming" → YES "TypeScript type inference" or "Rust memory management"\n` +
  `- NOT "health" → YES "intermittent fasting" or "VO2 max training"\n` +
  `- NOT "finance" → YES "index fund investing" or "options pricing"\n\n` +
  `Exclude:\n` +
  `- Anything involving AI, machine learning, LLMs, prompt engineering, chatbots, or AI-driven automation — no exceptions\n` +
  `- Adult content, pornography, drugs, substances, or anything explicit\n` +
  `- Social media, streaming platforms, video platforms, content creation\n` +
  `- Food delivery, ride hailing, banking apps, or mundane everyday services\n` +
  `- Local businesses, restaurants, or city-specific services\n\n` +
  `Return a JSON array of strings only. No explanation, no markdown. Example:\n` +
  `["TypeScript generics", "espresso extraction", "sleep optimization"]`;

const GENERATE_ZEN_FACT_PROMPT =
  `ONE surprising, counterintuitive fact about the given topic. 1-2 sentences.\n` +
  `Return [NULL] if uncertain. No numbers. No advice. No labels. No em dashes. Just say the thing.`;

const GENERATE_ZEN_STAT_PROMPT =
  `ONE well-established numerical fact about the given topic. 1-2 sentences.\n` +
  `Use only widely cited, verifiable figures. Return [NULL] if uncertain. No advice. No labels. No em dashes. Just say the thing.`;

const DIGEST_PROMPT =
  `You are summarizing what a user has saved and browsed this week.\n` +
  `Write a brief weekly reflection in 2-4 short sentences:\n` +
  `1. What main themes came up\n` +
  `2. One interesting connection between two topics\n` +
  `3. One item worth revisiting\n\n` +
  `Be specific, use the actual topics. Write in plain, conversational English. No bullet points. No headers. No AI-speak.`;

async function generateZenStat(category: string, previousFacts: string[], language: string): Promise<string> {
  const settings = await getSettings();
  const key = settings.llmProvider === 'gemini' ? await getGeminiKey() : await getOpenAIKey();
  if (!key.trim()) throw new Error('No API key');

  const doNotRepeat = previousFacts.length > 0
    ? `\n\n## DO NOT REPEAT\n${previousFacts.map((p) => `- ${p}`).join('\n')}`
    : '';

  const strategy = getProviderStrategy(settings.llmProvider);
  const model = settings.llmProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    return await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: `Respond in ${language === 'de' ? 'German' : 'English'}.\n\n` + GENERATE_ZEN_STAT_PROMPT + doNotRepeat },
        { role: 'user', content: `Topic: ${category}` },
      ],
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function extractCategories(snippets: { text: string; title: string; source: string }[]): Promise<string[]> {
  const settings = await getSettings();
  const key = settings.llmProvider === 'gemini' ? await getGeminiKey() : await getOpenAIKey();
  if (!key.trim()) throw new Error('No API key');

  const context = snippets
    .map((s) => s.source === 'history' ? s.title : `${s.title ? s.title + ': ' : ''}${s.text.slice(0, 200)}`)
    .join('\n');

  const strategy = getProviderStrategy(settings.llmProvider);
  const model = settings.llmProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const raw = await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: EXTRACT_CATEGORIES_PROMPT },
        { role: 'user', content: `Snippets:\n${context}` },
      ],
      signal: controller.signal,
    });
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function generateZenFact(category: string, previousFacts: string[], language: string): Promise<string> {
  const settings = await getSettings();
  const key = settings.llmProvider === 'gemini' ? await getGeminiKey() : await getOpenAIKey();
  if (!key.trim()) throw new Error('No API key');

  const doNotRepeat = previousFacts.length > 0
    ? `\n\n## DO NOT REPEAT\n${previousFacts.map((p) => `- ${p}`).join('\n')}`
    : '';

  const strategy = getProviderStrategy(settings.llmProvider);
  const model = settings.llmProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    return await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: `Respond in ${language === 'de' ? 'German' : 'English'}.\n\n` + GENERATE_ZEN_FACT_PROMPT + doNotRepeat },
        { role: 'user', content: `Topic: ${category}` },
      ],
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function generateWeeklyDigest(language: string): Promise<string | null> {
  const settings = await getSettings();
  const key = settings.llmProvider === 'gemini' ? await getGeminiKey() : await getOpenAIKey();
  if (!key.trim()) return null;

  const snippets = await getAllSnippets();
  const oneWeekAgo = Date.now() - 7 * 86400000;
  const recent = snippets.filter((s) => s.timestamp > oneWeekAgo);
  if (recent.length < 3) return null;

  const sample = recent.slice(0, 30).map((s) => {
    const base = s.source === 'history' ? s.title : `${s.title ? s.title + ': ' : ''}${s.text.slice(0, 200)}`;
    return base;
  }).join('\n');

  const strategy = getProviderStrategy(settings.llmProvider);
  const model = settings.llmProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    return await strategy.chat({
      apiKey: key,
      model,
      messages: [
        { role: 'system', content: `Respond in ${language === 'de' ? 'German' : 'English'}.\n\n` + DIGEST_PROMPT },
        { role: 'user', content: `Recent saves and browsing:\n${sample}` },
      ],
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const HISTORY_ALARM = 'sonto-history-sync';
const DIGEST_ALARM = 'sonto-weekly-digest';
const HISTORY_SYNC_INTERVAL_MINUTES = 30;
const DIGEST_INTERVAL_MINUTES = 60 * 24 * 7;
const HISTORY_INITIAL_DAYS = 30;
const HISTORY_MAX_RESULTS = 500;
const BATCH_SIZE = 100;

async function hasApiKey(): Promise<boolean> {
  const settings = await getSettings();
  const key = settings.llmProvider === 'gemini' ? await getGeminiKey() : await getOpenAIKey();
  return !!key.trim();
}

async function syncHistory(startTime?: number): Promise<void> {
  const [onboardingDone, historyEnabled] = await Promise.all([isOnboardingDone(), isHistoryEnabled()]);
  if (!onboardingDone || !historyEnabled) return;
  if (!await hasApiKey()) return;

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

async function scheduleAlarms(): Promise<void> {
  const existing = await chrome.alarms.get(HISTORY_ALARM);
  if (!existing) {
    chrome.alarms.create(HISTORY_ALARM, { periodInMinutes: HISTORY_SYNC_INTERVAL_MINUTES });
  }
  const digestAlarm = await chrome.alarms.get(DIGEST_ALARM);
  if (!digestAlarm) {
    chrome.alarms.create(DIGEST_ALARM, { periodInMinutes: DIGEST_INTERVAL_MINUTES });
  }
}

async function maybeGenerateDigest(): Promise<void> {
  const lastAt = await getLastDigestAt();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastAt < oneWeek) return;

  const settings = await getSettings();
  const digest = await generateWeeklyDigest(settings.language);
  if (digest) {
    await saveStoredDigest(digest);
    await saveLastDigestAt(Date.now());
  }
}


async function checkReadLaterForTab(url: string): Promise<void> {
  const items = await getReadLater();
  const idx = items.findIndex((i) => i.url === url);
  if (idx === -1) return;

  const item = items[idx];
  items.splice(idx, 1);
  await saveReadLater(items);

  try {
    const embedText = `${item.title ? item.title + ' — ' : ''}${url}`;
    await captureSnippet(embedText, url, item.title ?? url, 'manual');
  } catch (err) {
    console.error('[Sonto] read-later capture failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sonto-save',
    title: 'Save to Sonto',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'sonto-read-later',
    title: 'Read Later in Sonto',
    contexts: ['page', 'link'],
  });

  void scheduleAlarms();
  void syncHistory();
});

void scheduleAlarms();
void syncHistory();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HISTORY_ALARM) {
    const startTime = Date.now() - HISTORY_SYNC_INTERVAL_MINUTES * 60 * 1000;
    void syncHistory(startTime);
  }
  if (alarm.name === DIGEST_ALARM) {
    void maybeGenerateDigest();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sonto-save') {
    const text = info.selectionText ?? '';
    const url = tab?.url ?? '';
    const title = tab?.title ?? '';
    if (!text.trim()) return;
    void (async () => {
      try {
        await captureSnippet(text, url, title);
        if (tab?.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: 'Saved to Sonto.' }).catch(() => {});
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Save failed.';
        if (tab?.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'SONTO_TOAST', message: msg, isError: true }).catch(() => {});
        }
      }
    })();
    return;
  }

  if (info.menuItemId === 'sonto-read-later') {
    const url = info.linkUrl ?? tab?.url ?? '';
    const title = info.linkUrl ? undefined : tab?.title;
    if (!url) return;
    void (async () => {
      const items = await getReadLater();
      if (!items.some((i) => i.url === url)) {
        items.push({ url, title, addedAt: Date.now() });
        await saveReadLater(items);
      }
    })();
    return;
  }
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

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    void checkReadLaterForTab(tab.url);
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === MSG.OPEN_SETTINGS) {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === MSG.SYNC_HISTORY) {
    void syncHistory();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === MSG.CAPTURE_SNIPPET) {
    const { text, url, title, context, tags, pinned } = message;
    void captureSnippet(text, url, title, 'manual', context, tags, pinned)
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

  if (message.type === MSG.EXTRACT_CATEGORIES) {
    void extractCategories(message.snippets)
      .then((categories) => sendResponse({ ok: true, categories }))
      .catch(() => sendResponse({ ok: false, categories: [] }));
    return true;
  }

  if (message.type === MSG.GENERATE_ZEN_FACT) {
    void generateZenFact(message.category, message.previousFacts, message.language)
      .then((fact) => sendResponse({ ok: true, fact }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === MSG.GENERATE_ZEN_STAT) {
    void generateZenStat(message.category, message.previousFacts, message.language)
      .then((fact) => sendResponse({ ok: true, fact }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === MSG.GET_RELATED_SNIPPETS) {
    const topK = message.topK ?? 5;
    void getRelatedSnippets(message.snippetId, topK)
      .then((results) => sendResponse({ ok: true, results }))
      .catch(() => sendResponse({ ok: false, results: [] }));
    return true;
  }

  if (message.type === MSG.UPDATE_SNIPPET) {
    void updateSnippet(message.snippet)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === MSG.GET_SNIPPETS_FOR_TAB) {
    void (async () => {
      try {
        const domain = new URL(message.url).hostname;
        const byDomain = await getSnippetsForDomain(domain, 5);
        if (byDomain.length > 0) {
          sendResponse({ ok: true, snippets: byDomain });
          return;
        }
        const embedding = await embed(message.title || message.url);
        const results = await search(embedding, 3);
        const relevant = results.filter((r) => r.score > 0.6);
        sendResponse({ ok: true, snippets: relevant.map((r) => r.snippet) });
      } catch {
        sendResponse({ ok: true, snippets: [] });
      }
    })();
    return true;
  }

  if (message.type === MSG.ADD_READ_LATER) {
    void (async () => {
      const items = await getReadLater();
      if (!items.some((i) => i.url === message.url)) {
        items.push({ url: message.url, title: message.title, addedAt: Date.now() });
        await saveReadLater(items);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === MSG.REMOVE_READ_LATER) {
    void (async () => {
      const items = await getReadLater();
      await saveReadLater(items.filter((i) => i.url !== message.url));
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === MSG.GET_READ_LATER) {
    void getReadLater()
      .then((items) => sendResponse({ ok: true, items }))
      .catch(() => sendResponse({ ok: true, items: [] }));
    return true;
  }

  if (message.type === MSG.GENERATE_DIGEST) {
    void generateWeeklyDigest(message.language)
      .then((digest) => {
        if (digest) void saveStoredDigest(digest);
        sendResponse({ ok: true, digest });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});