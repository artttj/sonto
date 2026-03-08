import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import type { AppLanguage, AppSettings, ProviderName } from './types';

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
  return (result[DRIP_INTERVAL_KEY] as number | undefined) ?? 10000;
}

export async function saveDripInterval(ms: number): Promise<void> {
  await chrome.storage.local.set({ [DRIP_INTERVAL_KEY]: ms });
}
