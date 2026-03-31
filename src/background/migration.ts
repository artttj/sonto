// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { STORAGE_KEYS } from '../shared/constants';
import { migrateFromLegacy } from '../shared/storage/items';

// Migration v1: Migrate from legacy clips DB + chrome.storage prompts to unified sonto_db_v2
const CURRENT_MIGRATION_VERSION = 1;

export async function runMigrationIfNeeded(): Promise<{
  performed: boolean;
  clipsMigrated: number;
  promptsMigrated: number;
}> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MIGRATION_VERSION);
  const currentVersion = (result[STORAGE_KEYS.MIGRATION_VERSION] as number) ?? 0;

  if (currentVersion >= CURRENT_MIGRATION_VERSION) {
    return { performed: false, clipsMigrated: 0, promptsMigrated: 0 };
  }

  console.log('[Sonto] Running data migration to unified schema...');

  try {
    const { clipsMigrated, promptsMigrated } = await migrateFromLegacy();

    await chrome.storage.local.set({
      [STORAGE_KEYS.MIGRATION_VERSION]: CURRENT_MIGRATION_VERSION,
    });

    console.log('[Sonto] Migration complete:', { clipsMigrated, promptsMigrated });

    return { performed: true, clipsMigrated, promptsMigrated };
  } catch (err) {
    console.error('[Sonto] Migration failed:', err);
    throw err;
  }
}

export async function resetMigration(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.MIGRATION_VERSION);
}
