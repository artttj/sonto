// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { DEFAULT_SETTINGS, STORAGE_KEYS, DEFAULT_MAX_HISTORY_SIZE, PROMPT_LOCK_UNLOCKED_AT } from './constants';
import type { AppLanguage, AppSettings, LockDuration, PromptLockSettings } from './types';

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

export async function isOnboardingDone(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_DONE_KEY);
  return (result[ONBOARDING_DONE_KEY] as boolean | undefined) ?? false;
}

export async function setOnboardingDone(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: true });
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

export async function getCollections(): Promise<import('./types').Collection[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.COLLECTIONS);
  return (result[STORAGE_KEYS.COLLECTIONS] as import('./types').Collection[] | undefined) ?? [];
}

export async function saveCollections(collections: import('./types').Collection[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
}

const PROMPTS_KEY = 'sonto_prompts';

export type PromptColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export interface PromptItem {
  id: string;
  text: string;
  label?: string;
  color?: PromptColor;
  createdAt: number;
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

export async function updatePrompt(id: string, updates: Partial<Pick<PromptItem, 'text' | 'label' | 'color'>>): Promise<void> {
  const prompts = await getAllPrompts();
  const updatedPrompts = prompts.map(p => p.id === id ? { ...p, ...updates } : p);
  await chrome.storage.local.set({ [PROMPTS_KEY]: updatedPrompts });
}

export async function deletePrompt(id: string): Promise<void> {
  const prompts = await getAllPrompts();
  const updatedPrompts = prompts.filter((p) => p.id !== id);
  await chrome.storage.local.set({ [PROMPTS_KEY]: updatedPrompts });
}

// ============================================================================
// PROMPT LOCK
// ============================================================================

const PIN_SALT = 'sonto-pin-salt-v1';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(PIN_SALT + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getPromptLockSettings(): Promise<PromptLockSettings> {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.PROMPT_LOCK_ENABLED,
      STORAGE_KEYS.PROMPT_LOCK_PIN,
      STORAGE_KEYS.PROMPT_LOCK_DURATION,
    ]);
    return {
      enabled: (result[STORAGE_KEYS.PROMPT_LOCK_ENABLED] as boolean | undefined) ?? false,
      pinHash: (result[STORAGE_KEYS.PROMPT_LOCK_PIN] as string | undefined) ?? null,
      duration: (result[STORAGE_KEYS.PROMPT_LOCK_DURATION] as LockDuration | undefined) ?? 'sidebar',
    };
  } catch {
    return { enabled: false, pinHash: null, duration: 'sidebar' };
  }
}

export async function setPromptLockPin(pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_LOCK_PIN]: pinHash });
}

export async function setPromptLockEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_LOCK_ENABLED]: enabled });
}

export async function setPromptLockDuration(duration: LockDuration): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_LOCK_DURATION]: duration });
}

export async function setPromptUnlocked(): Promise<void> {
  await chrome.storage.session.set({ [PROMPT_LOCK_UNLOCKED_AT]: Date.now() });
}

export async function isPromptLocked(): Promise<boolean> {
  try {
    const settings = await getPromptLockSettings();

    if (!settings.enabled || !settings.pinHash) {
      return false;
    }

    const result = await chrome.storage.session.get(PROMPT_LOCK_UNLOCKED_AT);
    const unlockedAt = result[PROMPT_LOCK_UNLOCKED_AT] as number | undefined;

    if (unlockedAt === undefined) {
      return true;
    }

    const now = Date.now();
    const elapsed = now - unlockedAt;

    switch (settings.duration) {
      case 'sidebar':
        return false;
      case '5min':
        return elapsed >= 5 * 60 * 1000;
      case '15min':
        return elapsed >= 15 * 60 * 1000;
      case 'browser':
        return false;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

export async function verifyPromptPin(pin: string): Promise<boolean> {
  try {
    const settings = await getPromptLockSettings();
    if (!settings.pinHash) return false;

    const inputHash = await hashPin(pin);
    return inputHash === settings.pinHash;
  } catch {
    return false;
  }
}

export async function clearPromptLock(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROMPT_LOCK_ENABLED]: false,
    [STORAGE_KEYS.PROMPT_LOCK_PIN]: null,
  });
  await chrome.storage.session.remove(PROMPT_LOCK_UNLOCKED_AT);
}
