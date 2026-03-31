// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { DEFAULT_SETTINGS, STORAGE_KEYS, DEFAULT_MAX_HISTORY_SIZE } from './constants';
import type { AppLanguage, AppSettings, ReadLaterItem } from './types';

function isAppLanguage(value: string): value is AppLanguage {
  return value === 'en' || value === 'de';
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const raw = (stored[STORAGE_KEYS.SETTINGS] as Partial<AppSettings> | undefined) ?? {};

  const language: AppLanguage =
    raw.language && isAppLanguage(raw.language) ? raw.language : DEFAULT_SETTINGS.language;

  return { language };
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: { ...current, ...partial } });
}

export async function getTheme(): Promise<'dark' | 'light'> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.THEME);
  const val = result[STORAGE_KEYS.THEME] as string | undefined;
  return val === 'light' ? 'light' : 'dark';
}

export async function saveTheme(theme: 'dark' | 'light'): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: theme });
}

export async function getReadLater(): Promise<ReadLaterItem[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.READ_LATER);
  return (result[STORAGE_KEYS.READ_LATER] as ReadLaterItem[] | undefined) ?? [];
}

export async function saveReadLater(items: ReadLaterItem[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.READ_LATER]: items });
}

export async function getClipboardMonitoring(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_MONITORING);
  return (result[STORAGE_KEYS.CLIPBOARD_MONITORING] as boolean | undefined) ?? true;
}

export async function setClipboardMonitoring(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_MONITORING]: enabled });
}

export async function getMaxHistorySize(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MAX_HISTORY_SIZE);
  return (result[STORAGE_KEYS.MAX_HISTORY_SIZE] as number | undefined) ?? DEFAULT_MAX_HISTORY_SIZE;
}

export async function setMaxHistorySize(size: number): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.MAX_HISTORY_SIZE]: size });
}

export async function getBadgeCounterEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BADGE_COUNTER_ENABLED);
  return (result[STORAGE_KEYS.BADGE_COUNTER_ENABLED] as boolean | undefined) ?? true;
}

export async function setBadgeCounterEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.BADGE_COUNTER_ENABLED]: enabled });
}

export async function getReadingCompanionEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.READING_COMPANION_ENABLED);
  return (result[STORAGE_KEYS.READING_COMPANION_ENABLED] as boolean | undefined) ?? true;
}

export async function setReadingCompanionEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.READING_COMPANION_ENABLED]: enabled });
}

const ONBOARDING_DONE_KEY = 'sonto_onboarding_done';
const DEFAULT_VIEW_KEY = 'sonto_default_view';

export async function isOnboardingDone(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_DONE_KEY);
  return (result[ONBOARDING_DONE_KEY] as boolean | undefined) ?? false;
}

export async function setOnboardingDone(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: true });
}

export async function getDefaultView(): Promise<'zen' | 'clipboard'> {
  const result = await chrome.storage.local.get(DEFAULT_VIEW_KEY);
  const val = result[DEFAULT_VIEW_KEY] as string | undefined;
  return val === 'zen' ? 'zen' : 'clipboard';
}

export async function saveDefaultView(mode: 'zen' | 'clipboard'): Promise<void> {
  await chrome.storage.local.set({ [DEFAULT_VIEW_KEY]: mode });
}

const DEFAULT_CLIPBOARD_TAB_KEY = 'sonto_default_clipboard_tab';

export async function getDefaultClipboardTab(): Promise<'browse' | 'prompts'> {
  const result = await chrome.storage.local.get(DEFAULT_CLIPBOARD_TAB_KEY);
  const val = result[DEFAULT_CLIPBOARD_TAB_KEY] as string | undefined;
  return val === 'prompts' ? 'prompts' : 'browse';
}

export async function saveDefaultClipboardTab(tab: 'browse' | 'prompts'): Promise<void> {
  await chrome.storage.local.set({ [DEFAULT_CLIPBOARD_TAB_KEY]: tab });
}

const DISABLED_SOURCES_KEY = 'sonto_disabled_sources';
const DRIP_INTERVAL_KEY = 'sonto_drip_interval_ms';
const CUSTOM_FEEDS_KEY = 'sonto_custom_feeds';
const ZEN_SOURCE_SIGNALS_KEY = 'sonto_zen_source_signals';
const ZEN_DISPLAY_KEY = 'sonto_zen_display';

export async function getDisabledSources(): Promise<string[]> {
  const result = await chrome.storage.local.get(DISABLED_SOURCES_KEY);
  return (result[DISABLED_SOURCES_KEY] as string[] | undefined) ?? [];
}

export async function saveDisabledSources(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [DISABLED_SOURCES_KEY]: ids });
}

export async function getDripInterval(): Promise<number> {
  const result = await chrome.storage.local.get(DRIP_INTERVAL_KEY);
  return (result[DRIP_INTERVAL_KEY] as number | undefined) ?? 30000;
}

export async function saveDripInterval(ms: number): Promise<void> {
  await chrome.storage.local.set({ [DRIP_INTERVAL_KEY]: ms });
}

export type CustomFeed = { url: string; label: string };

export async function getCustomFeeds(): Promise<CustomFeed[]> {
  const result = await chrome.storage.local.get(CUSTOM_FEEDS_KEY);
  return (result[CUSTOM_FEEDS_KEY] as CustomFeed[] | undefined) ?? [];
}

export async function saveCustomFeeds(feeds: CustomFeed[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_FEEDS_KEY]: feeds });
}

export async function getZenSourceSignals(): Promise<Record<string, number>> {
  const result = await chrome.storage.local.get(ZEN_SOURCE_SIGNALS_KEY);
  const raw = result[ZEN_SOURCE_SIGNALS_KEY] as Record<string, unknown> | undefined;
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

export async function bumpZenSourceSignal(sourceId: string, amount: number): Promise<void> {
  if (!sourceId || !Number.isFinite(amount) || amount === 0) return;
  const current = await getZenSourceSignals();
  current[sourceId] = Math.max(0, Math.min(50, (current[sourceId] ?? 0) + amount));
  await chrome.storage.local.set({ [ZEN_SOURCE_SIGNALS_KEY]: current });
}

export async function getZenDisplay(): Promise<'feed' | 'cosmos'> {
  const result = await chrome.storage.local.get(ZEN_DISPLAY_KEY);
  const val = result[ZEN_DISPLAY_KEY] as string | undefined;
  return val === 'feed' ? 'feed' : 'cosmos';
}

export async function saveZenDisplay(mode: 'feed' | 'cosmos'): Promise<void> {
  await chrome.storage.local.set({ [ZEN_DISPLAY_KEY]: mode });
}

export type CustomJsonSource = { url: string; label: string };

export async function getCustomJsonSources(): Promise<CustomJsonSource[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_JSON_SOURCES);
  return (result[STORAGE_KEYS.CUSTOM_JSON_SOURCES] as CustomJsonSource[] | undefined) ?? [];
}

export async function saveCustomJsonSources(sources: CustomJsonSource[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_JSON_SOURCES]: sources });
}

export async function getCollections(): Promise<import('./types').Collection[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.COLLECTIONS);
  return (result[STORAGE_KEYS.COLLECTIONS] as import('./types').Collection[] | undefined) ?? [];
}

export async function saveCollections(collections: import('./types').Collection[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
}

const SEEN_ITEMS_KEY = 'sonto_seen_items';
const DAY_MS = 86_400_000;

type SeenItemEntry = {
  id: string;
  seenAt: number;
  source: string;
};

export async function getSeenItems(): Promise<Record<string, SeenItemEntry>> {
  const result = await chrome.storage.local.get(SEEN_ITEMS_KEY);
  const entries = result[SEEN_ITEMS_KEY] as SeenItemEntry[] | undefined;
  const now = Date.now();
  const map: Record<string, SeenItemEntry> = {};

  if (!entries) return map;

  for (const entry of entries) {
    if (now - entry.seenAt < 30 * DAY_MS) {
      map[entry.id] = entry;
    }
  }

  return map;
}

export async function markItemSeen(id: string, source: string): Promise<void> {
  const entries = await getSeenItemsList();
  entries.push({ id, seenAt: Date.now(), source });

  const now = Date.now();
  const filtered = entries.filter((e) => now - e.seenAt < 30 * DAY_MS);

  await chrome.storage.local.set({ [SEEN_ITEMS_KEY]: filtered });
}

export async function getSeenItemsList(): Promise<SeenItemEntry[]> {
  const result = await chrome.storage.local.get(SEEN_ITEMS_KEY);
  return (result[SEEN_ITEMS_KEY] as SeenItemEntry[] | undefined) ?? [];
}

export async function isItemSeen(id: string, source: string, allowAfterMs?: number): Promise<boolean> {
  const entries = await getSeenItemsList();
  const entry = entries.find((e) => e.id === id && e.source === source);
  if (!entry) return false;

  if (allowAfterMs !== undefined) {
    return Date.now() - entry.seenAt < allowAfterMs;
  }
  return true;
}

export async function getRecentlySeenBySource(source: string, withinMs: number): Promise<Set<string>> {
  const entries = await getSeenItemsList();
  const now = Date.now();
  const result = new Set<string>();

  for (const entry of entries) {
    if (entry.source === source && now - entry.seenAt < withinMs) {
      result.add(entry.id);
    }
  }

  return result;
}

const PROMPTS_KEY = 'sonto_prompts';

export type PromptColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export interface PromptItem {
  id: string;
  text: string;
  label?: string;
  color?: PromptColor;
  createdAt: number;
  pinned?: boolean;
}

export async function getAllPrompts(): Promise<PromptItem[]> {
  const result = await chrome.storage.local.get(PROMPTS_KEY);
  const prompts = result[PROMPTS_KEY] as PromptItem[] | undefined;
  return prompts?.sort((a, b) => b.createdAt - a.createdAt) ?? [];
}

export async function savePrompt(text: string, color?: PromptColor, label?: string): Promise<PromptItem> {
  const prompts = await getAllPrompts();
  const newPrompt: PromptItem = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    text,
    color,
    label,
    createdAt: Date.now(),
  };
  const updatedPrompts = [...prompts, newPrompt];
  await chrome.storage.local.set({ [PROMPTS_KEY]: updatedPrompts });
  return newPrompt;
}

export async function updatePrompt(id: string, updates: Partial<Pick<PromptItem, 'text' | 'label' | 'color' | 'pinned'>>): Promise<void> {
  const prompts = await getAllPrompts();
  const updatedPrompts = prompts.map(p => p.id === id ? { ...p, ...updates } : p);
  await chrome.storage.local.set({ [PROMPTS_KEY]: updatedPrompts });
}

export async function deletePrompt(id: string): Promise<void> {
  const prompts = await getAllPrompts();
  const updatedPrompts = prompts.filter((p) => p.id !== id);
  await chrome.storage.local.set({ [PROMPTS_KEY]: updatedPrompts });
}
