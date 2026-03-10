// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import type { AppLanguage, AppSettings, ChatSession, ProviderName, ReadLaterItem } from './types';

function isProviderName(value: string): value is ProviderName {
  return value === 'openai' || value === 'gemini';
}

function isAppLanguage(value: string): value is AppLanguage {
  return value === 'en' || value === 'de';
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const raw = (stored[STORAGE_KEYS.SETTINGS] as Partial<AppSettings> | undefined) ?? {};

  const provider: ProviderName =
    raw.llmProvider && isProviderName(raw.llmProvider) ? raw.llmProvider : DEFAULT_SETTINGS.llmProvider;

  const language: AppLanguage =
    raw.language && isAppLanguage(raw.language) ? raw.language : DEFAULT_SETTINGS.language;

  return {
    llmProvider: provider,
    openaiModel: raw.openaiModel ?? DEFAULT_SETTINGS.openaiModel,
    geminiModel: raw.geminiModel ?? DEFAULT_SETTINGS.geminiModel,
    language,
  };
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: { ...current, ...partial } });
}

export async function getOpenAIKey(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.OPENAI_KEY);
  return (result[STORAGE_KEYS.OPENAI_KEY] as string | undefined) ?? '';
}

export async function saveOpenAIKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.OPENAI_KEY]: key });
}

export async function getGeminiKey(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.GEMINI_KEY);
  return (result[STORAGE_KEYS.GEMINI_KEY] as string | undefined) ?? '';
}

export async function saveGeminiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_KEY]: key });
}

const DISABLED_SOURCES_KEY = 'sonto_disabled_sources';
const DRIP_INTERVAL_KEY = 'sonto_drip_interval_ms';

export async function getDisabledSources(): Promise<string[]> {
  const result = await chrome.storage.local.get(DISABLED_SOURCES_KEY);
  return (result[DISABLED_SOURCES_KEY] as string[] | undefined) ?? [];
}

export async function saveDisabledSources(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [DISABLED_SOURCES_KEY]: ids });
}

export async function getDripInterval(): Promise<number> {
  const result = await chrome.storage.local.get(DRIP_INTERVAL_KEY);
  return (result[DRIP_INTERVAL_KEY] as number | undefined) ?? 15000;
}

export async function saveDripInterval(ms: number): Promise<void> {
  await chrome.storage.local.set({ [DRIP_INTERVAL_KEY]: ms });
}

const CUSTOM_FEEDS_KEY = 'sonto_custom_feeds';

export type CustomFeed = { url: string; label: string };

export async function getCustomFeeds(): Promise<CustomFeed[]> {
  const result = await chrome.storage.local.get(CUSTOM_FEEDS_KEY);
  return (result[CUSTOM_FEEDS_KEY] as CustomFeed[] | undefined) ?? [];
}

export async function saveCustomFeeds(feeds: CustomFeed[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_FEEDS_KEY]: feeds });
}

const HISTORY_ENABLED_KEY = 'sonto_history_enabled';
const ONBOARDING_DONE_KEY = 'sonto_onboarding_done';

export async function isHistoryEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(HISTORY_ENABLED_KEY);
  return (result[HISTORY_ENABLED_KEY] as boolean | undefined) ?? true;
}

export async function setHistoryEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_ENABLED_KEY]: enabled });
}

export async function isOnboardingDone(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_DONE_KEY);
  return (result[ONBOARDING_DONE_KEY] as boolean | undefined) ?? false;
}

export async function setOnboardingDone(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: true });
}

const ZEN_DISPLAY_KEY = 'sonto_zen_display';

export async function getZenDisplay(): Promise<'feed' | 'cosmos'> {
  const result = await chrome.storage.local.get(ZEN_DISPLAY_KEY);
  const val = result[ZEN_DISPLAY_KEY] as string | undefined;
  return val === 'cosmos' ? 'cosmos' : 'feed';
}

export async function saveZenDisplay(mode: 'feed' | 'cosmos'): Promise<void> {
  await chrome.storage.local.set({ [ZEN_DISPLAY_KEY]: mode });
}

export async function getTheme(): Promise<'dark' | 'light'> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.THEME);
  const val = result[STORAGE_KEYS.THEME] as string | undefined;
  return val === 'light' ? 'light' : 'dark';
}

export async function saveTheme(theme: 'dark' | 'light'): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: theme });
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_SESSIONS);
  return (result[STORAGE_KEYS.CHAT_SESSIONS] as ChatSession[] | undefined) ?? [];
}

export async function saveChatSessions(sessions: ChatSession[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CHAT_SESSIONS]: sessions.slice(-50) });
}

export async function getReadLater(): Promise<ReadLaterItem[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.READ_LATER);
  return (result[STORAGE_KEYS.READ_LATER] as ReadLaterItem[] | undefined) ?? [];
}

export async function saveReadLater(items: ReadLaterItem[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.READ_LATER]: items });
}

export async function getStoredDigest(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STORED_DIGEST);
  return (result[STORAGE_KEYS.STORED_DIGEST] as string | undefined) ?? null;
}

export async function saveStoredDigest(digest: string | null): Promise<void> {
  if (digest === null) {
    await chrome.storage.local.remove(STORAGE_KEYS.STORED_DIGEST);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.STORED_DIGEST]: digest });
  }
}

export async function getLastDigestAt(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_DIGEST_AT);
  return (result[STORAGE_KEYS.LAST_DIGEST_AT] as number | undefined) ?? 0;
}

export async function saveLastDigestAt(ts: number): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_DIGEST_AT]: ts });
}

export type CustomJsonSource = { url: string; label: string };

export async function getCustomJsonSources(): Promise<CustomJsonSource[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_JSON_SOURCES);
  return (result[STORAGE_KEYS.CUSTOM_JSON_SOURCES] as CustomJsonSource[] | undefined) ?? [];
}

export async function saveCustomJsonSources(sources: CustomJsonSource[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_JSON_SOURCES]: sources });
}