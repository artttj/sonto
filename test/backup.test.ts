// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from 'vitest';
import { exportBackup, importBackup } from '../src/shared/backup';
import { getAllSontoItems, clearAllSontoItems, saveSontoItem } from '../src/shared/storage/items';
import { saveSettings, saveTheme } from '../src/shared/storage';
import type { SontoItem } from '../src/shared/types';

describe('Backup Operations', () => {
  beforeEach(async () => {
    await clearAllSontoItems();
  });

  describe('exportBackup', () => {
    it('should export empty backup when no items', async () => {
      const json = await exportBackup();
      const backup = JSON.parse(json);

      expect(backup.version).toBe(3);
      expect(Array.isArray(backup.items)).toBe(true);
      expect(backup.items).toHaveLength(0);
      expect(Array.isArray(backup.tags)).toBe(true);
      expect(backup.createdAt).toBeTypeOf('number');
      expect(backup.settings).toBeDefined();
    });

    it('should include all items in export', async () => {
      const item1: SontoItem = {
        id: 'test-1',
        type: 'clip',
        content: 'Test content',
        contentType: 'text',
        source: 'clipboard',
        origin: 'test',
        tags: ['tag1', 'tag2'],
        createdAt: Date.now(),
        pinned: false,
        zenified: false,
      };

      const item2: SontoItem = {
        id: 'test-2',
        type: 'prompt',
        content: 'Prompt text',
        contentType: 'text',
        source: 'manual',
        origin: 'test',
        tags: [],
        createdAt: Date.now(),
        pinned: true,
        zenified: true,
        metadata: { color: 'blue' },
      };

      await saveSontoItem(item1);
      await saveSontoItem(item2);

      const json = await exportBackup();
      const backup = JSON.parse(json);

      expect(backup.items).toHaveLength(2);
      expect(backup.items.some((i: SontoItem) => i.id === 'test-1')).toBe(true);
      expect(backup.items.some((i: SontoItem) => i.id === 'test-2')).toBe(true);
    });
  });

  describe('importBackup', () => {
    it('should import valid backup', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'import-1',
            type: 'clip',
            content: 'Imported content',
            contentType: 'code',
            source: 'manual',
            origin: 'import-test',
            tags: ['imported'],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
        tags: ['imported'],
        settings: {
          app: { language: 'de' },
          theme: 'light',
        },
      };

      const result = await importBackup(JSON.stringify(backup), false);

      expect(result.items).toBe(1);
      expect(result.clips).toBe(1);
      expect(result.prompts).toBe(0);
      expect(result.zen).toBe(0);

      const items = await getAllSontoItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('import-1');
    });

    it('should reject invalid JSON', async () => {
      await expect(importBackup('not valid json', false)).rejects.toThrow('Invalid JSON format');
    });

    it('should reject backup without version', async () => {
      const backup = { items: [], createdAt: Date.now() };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('version');
    });

    it('should reject backup with unsupported version', async () => {
      const backup = { version: 999, items: [], createdAt: Date.now() };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('Unsupported');
    });

    it('should reject item without required id', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [{ type: 'clip' }],
      };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('id');
    });

    it('should reject item with invalid type', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'test',
            type: 'invalid',
            content: 'test',
            contentType: 'text',
            source: 'clipboard',
            origin: 'test',
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
      };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('type');
    });

    it('should reject item with invalid contentType', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'test',
            type: 'clip',
            content: 'test',
            contentType: 'invalid-type',
            source: 'clipboard',
            origin: 'test',
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
      };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('contentType');
    });

    it('should reject item with invalid source', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'test',
            type: 'clip',
            content: 'test',
            contentType: 'text',
            source: 'invalid-source',
            origin: 'test',
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
      };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('source');
    });

    it('should replace existing items when merge is false', async () => {
      const existingItem: SontoItem = {
        id: 'existing',
        type: 'clip',
        content: 'Existing',
        contentType: 'text',
        source: 'clipboard',
        origin: 'test',
        tags: [],
        createdAt: Date.now(),
        pinned: false,
        zenified: false,
      };
      await saveSontoItem(existingItem);

      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'new-item',
            type: 'prompt',
            content: 'New',
            contentType: 'text',
            source: 'manual',
            origin: 'import',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
      };

      await importBackup(JSON.stringify(backup), false);

      const items = await getAllSontoItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('new-item');
    });

    it('should merge items when merge is true', async () => {
      const existingItem: SontoItem = {
        id: 'existing',
        type: 'clip',
        content: 'Existing',
        contentType: 'text',
        source: 'clipboard',
        origin: 'test',
        tags: [],
        createdAt: Date.now(),
        pinned: false,
        zenified: false,
      };
      await saveSontoItem(existingItem);

      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'new-item',
            type: 'prompt',
            content: 'New',
            contentType: 'text',
            source: 'manual',
            origin: 'import',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
      };

      await importBackup(JSON.stringify(backup), true);

      const items = await getAllSontoItems();
      expect(items).toHaveLength(2);
    });

    it('should count different item types correctly', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'clip-1',
            type: 'clip',
            content: 'Clip 1',
            contentType: 'text',
            source: 'clipboard',
            origin: 'test',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
          {
            id: 'clip-2',
            type: 'clip',
            content: 'Clip 2',
            contentType: 'text',
            source: 'clipboard',
            origin: 'test',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
          {
            id: 'prompt-1',
            type: 'prompt',
            content: 'Prompt 1',
            contentType: 'text',
            source: 'manual',
            origin: 'test',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
          {
            id: 'zen-1',
            type: 'zen',
            content: 'Zen 1',
            contentType: 'quote',
            source: 'zen-fetcher',
            origin: 'test',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: true,
          },
        ],
      };

      const result = await importBackup(JSON.stringify(backup), false);

      expect(result.items).toBe(4);
      expect(result.clips).toBe(2);
      expect(result.prompts).toBe(1);
      expect(result.zen).toBe(1);
    });

    it('should handle optional fields correctly', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'test',
            type: 'clip',
            content: 'Content',
            contentType: 'text',
            source: 'clipboard',
            origin: 'test',
            tags: [],
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
            url: 'https://example.com',
            title: 'Test Title',
            lastSeenAt: Date.now(),
            metadata: { key: 'value' },
          },
        ],
      };

      const result = await importBackup(JSON.stringify(backup), false);
      expect(result.items).toBe(1);

      const items = await getAllSontoItems();
      expect(items[0].url).toBe('https://example.com');
      expect(items[0].title).toBe('Test Title');
    });

    it('should reject item with invalid tags', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'test',
            type: 'clip',
            content: 'test',
            contentType: 'text',
            source: 'clipboard',
            origin: 'test',
            tags: 'not-an-array',
            createdAt: Date.now(),
            pinned: false,
            zenified: false,
          },
        ],
      };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('tags');
    });

    it('should reject item with invalid pinned value', async () => {
      const backup = {
        version: 3,
        createdAt: Date.now(),
        items: [
          {
            id: 'test',
            type: 'clip',
            content: 'test',
            contentType: 'text',
            source: 'clipboard',
            origin: 'test',
            tags: [],
            createdAt: Date.now(),
            pinned: 'yes',
            zenified: false,
          },
        ],
      };
      await expect(importBackup(JSON.stringify(backup), false)).rejects.toThrow('pinned');
    });
  });

  describe('round-trip', () => {
    it('should export and re-import data correctly', async () => {
      const item1: SontoItem = {
        id: 'roundtrip-1',
        type: 'clip',
        content: 'Roundtrip content',
        contentType: 'code',
        source: 'manual',
        origin: 'test',
        url: 'https://example.com',
        title: 'Test',
        tags: ['tag1', 'tag2'],
        createdAt: Date.now(),
        pinned: true,
        zenified: false,
      };

      const item2: SontoItem = {
        id: 'roundtrip-2',
        type: 'prompt',
        content: 'Prompt content',
        contentType: 'text',
        source: 'manual',
        origin: 'test',
        tags: [],
        createdAt: Date.now(),
        pinned: false,
        zenified: true,
        metadata: { color: 'red' },
      };

      await saveSontoItem(item1);
      await saveSontoItem(item2);
      await saveSettings({ language: 'de' });
      await saveTheme('light');

      const exported = await exportBackup();
      await clearAllSontoItems();
      await importBackup(exported, false);

      const items = await getAllSontoItems();
      expect(items).toHaveLength(2);

      const restoredItem1 = items.find((i) => i.id === 'roundtrip-1');
      expect(restoredItem1).toBeDefined();
      expect(restoredItem1?.content).toBe('Roundtrip content');
      expect(restoredItem1?.pinned).toBe(true);
      expect(restoredItem1?.tags).toEqual(['tag1', 'tag2']);

      const restoredItem2 = items.find((i) => i.id === 'roundtrip-2');
      expect(restoredItem2).toBeDefined();
      expect(restoredItem2?.type).toBe('prompt');
      expect(restoredItem2?.zenified).toBe(true);
    });
  });
});
