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

const ONBOARDING_DONE_KEY = 'sonto_onboarding_done';

export async function isOnboardingDone(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_DONE_KEY);
  return (result[ONBOARDING_DONE_KEY] as boolean | undefined) ?? false;
}

export async function setOnboardingDone(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: true });
}
