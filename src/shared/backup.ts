// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import {
  getAllSontoItems,
  saveSontoItem,
  clearAllSontoItems,
  getAllTags,
} from './storage/items';
import { getSettings, saveSettings, getTheme, saveTheme } from './storage';
import type { SontoItem, SontoItemType, SontoContentType, SontoSource } from './types';

const CURRENT_BACKUP_VERSION = 3;

const VALID_ITEM_TYPES: SontoItemType[] = ['clip', 'prompt', 'zen'];
const VALID_CONTENT_TYPES: SontoContentType[] = [
  'text', 'code', 'quote', 'art', 'link', 'idea', 'haiku', 'proverb', 'strategy', 'email', 'image'
];
const VALID_SOURCES: SontoSource[] = [
  'clipboard', 'manual', 'shortcut', 'context-menu', 'zen-fetcher', 'rss', 'api'
];

interface BackupPayload {
  version: number;
  createdAt: number;
  items: SontoItem[];
  tags: string[];
  settings: {
    app: Awaited<ReturnType<typeof getSettings>>;
    theme: string;
  };
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

function isValidBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isValidStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function validateSontoItem(item: unknown): ValidationResult {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Item must be an object' };
  }

  const i = item as Record<string, unknown>;

  // Required fields
  if (!isValidString(i.id)) {
    return { valid: false, error: 'Item must have a valid id' };
  }

  if (!isValidString(i.type) || !VALID_ITEM_TYPES.includes(i.type as SontoItemType)) {
    return { valid: false, error: `Item ${i.id} has invalid type: ${i.type}` };
  }

  if (!isValidString(i.content)) {
    return { valid: false, error: `Item ${i.id} must have valid content` };
  }

  if (!isValidString(i.contentType) || !VALID_CONTENT_TYPES.includes(i.contentType as SontoContentType)) {
    return { valid: false, error: `Item ${i.id} has invalid contentType: ${i.contentType}` };
  }

  if (!isValidString(i.source) || !VALID_SOURCES.includes(i.source as SontoSource)) {
    return { valid: false, error: `Item ${i.id} has invalid source: ${i.source}` };
  }

  if (!isValidString(i.origin)) {
    return { valid: false, error: `Item ${i.id} must have valid origin` };
  }

  if (!isValidNumber(i.createdAt)) {
    return { valid: false, error: `Item ${i.id} must have valid createdAt` };
  }

  if (!isValidBoolean(i.pinned)) {
    return { valid: false, error: `Item ${i.id} must have valid pinned boolean` };
  }

  if (!isValidBoolean(i.zenified)) {
    return { valid: false, error: `Item ${i.id} must have valid zenified boolean` };
  }

  // Optional fields validation
  if (i.tags !== undefined && !isValidStringArray(i.tags)) {
    return { valid: false, error: `Item ${i.id} has invalid tags` };
  }

  if (i.url !== undefined && i.url !== null && typeof i.url !== 'string') {
    return { valid: false, error: `Item ${i.id} has invalid url` };
  }

  if (i.title !== undefined && i.title !== null && typeof i.title !== 'string') {
    return { valid: false, error: `Item ${i.id} has invalid title` };
  }

  if (i.lastSeenAt !== undefined && !isValidNumber(i.lastSeenAt)) {
    return { valid: false, error: `Item ${i.id} has invalid lastSeenAt` };
  }

  return { valid: true };
}

function validateBackupPayload(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Backup must be a valid JSON object' };
  }

  const payload = data as Record<string, unknown>;

  // Check version
  if (!isValidNumber(payload.version)) {
    return { valid: false, error: 'Backup must have a version number' };
  }

  if (payload.version < 1 || payload.version > CURRENT_BACKUP_VERSION) {
    return { valid: false, error: `Unsupported backup version: ${payload.version}` };
  }

  // Check createdAt
  if (!isValidNumber(payload.createdAt)) {
    return { valid: false, error: 'Backup must have a valid createdAt timestamp' };
  }

  // Check items array
  if (!Array.isArray(payload.items)) {
    return { valid: false, error: 'Backup must have an items array' };
  }

  // Validate each item
  for (const item of payload.items) {
    const result = validateSontoItem(item);
    if (!result.valid) {
      return result;
    }
  }

  // Check tags (optional but must be array of strings if present)
  if (payload.tags !== undefined && !isValidStringArray(payload.tags)) {
    return { valid: false, error: 'Tags must be an array of strings' };
  }

  // Check settings (optional but must be object if present)
  if (payload.settings !== undefined) {
    if (typeof payload.settings !== 'object' || payload.settings === null) {
      return { valid: false, error: 'Settings must be an object' };
    }
    const settings = payload.settings as Record<string, unknown>;
    if (settings.theme !== undefined && typeof settings.theme !== 'string') {
      return { valid: false, error: 'Settings.theme must be a string' };
    }
  }

  return { valid: true };
}

export async function exportBackup(): Promise<string> {
  const [items, tags, app, theme] = await Promise.all([
    getAllSontoItems(),
    getAllTags(),
    getSettings(),
    getTheme(),
  ]);

  const payload: BackupPayload = {
    version: CURRENT_BACKUP_VERSION,
    createdAt: Date.now(),
    items,
    tags: Array.from(tags),
    settings: { app, theme },
  };

  return JSON.stringify(payload);
}

export async function importBackup(
  json: string,
  merge: boolean,
): Promise<{ items: number; clips: number; prompts: number; zen: number }> {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON format');
  }

  const validation = validateBackupPayload(data);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const payload = data as BackupPayload;

  if (!merge) {
    await clearAllSontoItems();
  }

  let itemsImported = 0;
  let clipsImported = 0;
  let promptsImported = 0;
  let zenImported = 0;

  for (const item of payload.items) {
    await saveSontoItem(item);
    itemsImported++;

    switch (item.type) {
      case 'clip':
        clipsImported++;
        break;
      case 'prompt':
        promptsImported++;
        break;
      case 'zen':
        zenImported++;
        break;
    }
  }

  if (payload.settings) {
    if (payload.settings.app) await saveSettings(payload.settings.app);
    if (payload.settings.theme) {
      await saveTheme(payload.settings.theme as 'dark' | 'light');
    }
  }

  return {
    items: itemsImported,
    clips: clipsImported,
    prompts: promptsImported,
    zen: zenImported,
  };
}

export function downloadBackup(json: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sonto-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
