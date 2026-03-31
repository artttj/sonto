// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { AppSettings } from './types';

export const STORAGE_KEYS = {
  SETTINGS: 'sonto_settings',
  THEME: 'sonto_theme',
  READ_LATER: 'sonto_read_later',
  CLIPBOARD_MONITORING: 'sonto_clipboard_monitoring',
  MAX_HISTORY_SIZE: 'sonto_max_history_size',
  CUSTOM_JSON_SOURCES: 'sonto_custom_json_sources',
  BADGE_COUNTER_ENABLED: 'sonto_badge_counter_enabled',
  READING_COMPANION_ENABLED: 'sonto_reading_companion_enabled',
  COLLECTIONS: 'sonto_collections',
  MIGRATION_VERSION: 'sonto_migration_version',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  language: navigator.language.startsWith('de') ? 'de' : 'en',
};

export const MAX_CAPTURE_CHARS = 10000;
export const DEFAULT_MAX_HISTORY_SIZE = 500;

// Legacy constants (for migration)
export const LEGACY_DB_NAME = 'sonto_db';
export const LEGACY_DB_VERSION = 3;
export const LEGACY_STORE_NAME = 'clips';

// New unified storage constants
export const DB_NAME = 'sonto_db_v2';
export const DB_VERSION = 3; // Bumped to force schema upgrade and create missing indexes
export const STORE_NAME = 'sonto_items';
