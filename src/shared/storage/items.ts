// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { DB_NAME, DB_VERSION, STORE_NAME, LEGACY_DB_NAME, LEGACY_DB_VERSION, LEGACY_STORE_NAME } from '../constants';
import type { SontoItem, SontoItemFilter, ClipItem, PromptItem } from '../types';

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

let dbCache: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = openDb().then((db) => {
    dbCache = db;
    db.onversionchange = () => {
      dbCache?.close();
      dbCache = null;
      dbOpenPromise = null;
    };
    return db;
  });

  return dbOpenPromise;
}

// Clear cache when DB version changes to force reopen
export function clearDbCache(): void {
  dbCache?.close();
  dbCache = null;
  dbOpenPromise = null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

        // Create indexes for efficient querying
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('contentType', 'contentType', { unique: false });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
        store.createIndex('zenified', 'zenified', { unique: false });
        store.createIndex('lastSeenAt', 'lastSeenAt', { unique: false });
        store.createIndex('origin', 'origin', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export async function saveSontoItem(item: SontoItem): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateSontoItem(id: string, updates: Partial<SontoItem>): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as SontoItem | undefined;
      if (!existing) {
        reject(new Error(`Item with id ${id} not found`));
        return;
      }
      const updated = { ...existing, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteSontoItem(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getSontoItemById(id: string): Promise<SontoItem | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as SontoItem | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSontoItems(filter?: SontoItemFilter): Promise<SontoItem[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    let request: IDBRequest;

    if (filter?.types && filter.types.length > 0) {
      // Use type index
      const index = store.index('type');
      if (filter.types.length === 1) {
        request = index.getAll(filter.types[0]);
      } else {
        // Multiple types - get all and filter
        request = store.getAll();
      }
    } else if (filter?.zenified !== undefined) {
      const index = store.index('zenified');
      request = index.getAll(filter.zenified ? 1 : 0);
    } else if (filter?.pinned !== undefined) {
      const index = store.index('pinned');
      request = index.getAll(filter.pinned ? 1 : 0);
    } else if (filter?.tags && filter.tags.length > 0) {
      // Use tags index (multiEntry)
      const index = store.index('tags');
      request = index.getAll(filter.tags[0]);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      let results = request.result as SontoItem[];

      // Apply additional filters in memory
      if (filter?.types && filter.types.length > 1) {
        results = results.filter(item => filter.types?.includes(item.type));
      }
      if (filter?.contentTypes) {
        results = results.filter(item => filter.contentTypes?.includes(item.contentType));
      }
      if (filter?.sources) {
        results = results.filter(item => filter.sources?.includes(item.source));
      }
      if (filter?.tags && filter.tags.length > 1) {
        results = results.filter(item => filter.tags?.every(tag => item.tags.includes(tag)));
      }

      // Sort by createdAt descending
      results.sort((a, b) => b.createdAt - a.createdAt);

      // Apply limit and offset
      if (filter?.offset) {
        results = results.slice(filter.offset);
      }
      if (filter?.limit) {
        results = results.slice(0, filter.limit);
      }

      resolve(results);
    };

    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// SEARCH
// ============================================================================

export async function searchSontoItems(
  query: string,
  filter?: SontoItemFilter,
): Promise<SontoItem[]> {
  const all = await getAllSontoItems(filter);
  if (!query.trim()) return all;

  const lower = query.toLowerCase();
  return all.filter(
    (item) =>
      item.content.toLowerCase().includes(lower) ||
      item.title?.toLowerCase().includes(lower) ||
      item.url?.toLowerCase().includes(lower) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
      item.origin.toLowerCase().includes(lower),
  );
}

// ============================================================================
// ZENIFIED ITEMS
// ============================================================================

export async function getZenifiedItems(options?: { limit?: number; excludeRecentMs?: number }): Promise<SontoItem[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('zenified');
    const request = index.getAll(1); // zenified = true

    request.onsuccess = () => {
      let results = request.result as SontoItem[];

      // Filter out recently seen items
      if (options?.excludeRecentMs) {
        const cutoff = Date.now() - options.excludeRecentMs;
        results = results.filter((item) => !item.lastSeenAt || item.lastSeenAt < cutoff);
      }

      // Sort by lastSeenAt (nulls first, then oldest)
      results.sort((a, b) => {
        if (!a.lastSeenAt && !b.lastSeenAt) return b.createdAt - a.createdAt;
        if (!a.lastSeenAt) return -1;
        if (!b.lastSeenAt) return 1;
        return a.lastSeenAt - b.lastSeenAt;
      });

      if (options?.limit) {
        results = results.slice(0, options.limit);
      }

      resolve(results);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function markItemAsSeenInZen(id: string): Promise<void> {
  await updateSontoItem(id, { lastSeenAt: Date.now() });
}

export async function toggleZenified(id: string): Promise<boolean> {
  const item = await getSontoItemById(id);
  if (!item) throw new Error(`Item ${id} not found`);
  const newZenified = !item.zenified;
  await updateSontoItem(id, { zenified: newZenified });
  return newZenified;
}

// ============================================================================
// TAG MANAGEMENT
// ============================================================================

export async function addTagToItem(id: string, tag: string): Promise<void> {
  const item = await getSontoItemById(id);
  if (!item) throw new Error(`Item ${id} not found`);
  if (!item.tags.includes(tag)) {
    await updateSontoItem(id, { tags: [...item.tags, tag] });
  }
}

export async function removeTagFromItem(id: string, tag: string): Promise<void> {
  const item = await getSontoItemById(id);
  if (!item) throw new Error(`Item ${id} not found`);
  await updateSontoItem(id, { tags: item.tags.filter((t) => t !== tag) });
}

export async function getAllTags(): Promise<Set<string>> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('tags');
    const req = index.openCursor(null, 'nextunique');
    const tags = new Set<string>();

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        tags.add(cursor.key as string);
        cursor.continue();
      } else {
        resolve(tags);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// MIGRATION
// ============================================================================

export async function migrateFromLegacy(): Promise<{ clipsMigrated: number; promptsMigrated: number }> {
  let clipsMigrated = 0;
  let promptsMigrated = 0;

  // Migrate clips from legacy IndexedDB
  try {
    const legacyClips = await getLegacyClips();
    for (const clip of legacyClips) {
      const sontoItem: SontoItem = {
        id: clip.id,
        type: 'clip',
        content: clip.text,
        contentType: mapClipContentType(clip.contentType),
        source: clip.source,
        origin: clip.source,
        url: clip.url,
        title: clip.title,
        tags: clip.tags ?? [],
        createdAt: clip.timestamp,
        pinned: clip.pinned ?? false,
        zenified: false,
      };
      await saveSontoItem(sontoItem);
      clipsMigrated++;
    }
  } catch (err) {
    console.error('Failed to migrate clips:', err);
  }

  // Migrate prompts from chrome.storage.local
  try {
    const legacyPrompts = await getLegacyPrompts();
    for (const prompt of legacyPrompts) {
      const sontoItem: SontoItem = {
        id: prompt.id,
        type: 'prompt',
        content: prompt.text,
        contentType: 'text',
        source: 'manual',
        origin: 'user',
        title: prompt.label,
        tags: [],
        createdAt: prompt.createdAt,
        pinned: prompt.pinned ?? false,
        zenified: false,
        metadata: {
          color: prompt.color,
        },
      };
      await saveSontoItem(sontoItem);
      promptsMigrated++;
    }
  } catch (err) {
    console.error('Failed to migrate prompts:', err);
  }

  return { clipsMigrated, promptsMigrated };
}

async function getLegacyClips(): Promise<ClipItem[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);

    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        resolve([]);
        return;
      }

      const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
      const getReq = tx.objectStore(LEGACY_STORE_NAME).getAll();

      getReq.onsuccess = () => {
        const clips = (getReq.result as ClipItem[]).sort((a, b) => b.timestamp - a.timestamp);
        resolve(clips);
      };
      getReq.onerror = () => reject(getReq.error);
    };

    req.onerror = () => reject(req.error);
  });
}

async function getLegacyPrompts(): Promise<PromptItem[]> {
  const result = await chrome.storage.local.get('sonto_prompts');
  const prompts = result['sonto_prompts'] as PromptItem[] | undefined;
  return prompts?.sort((a, b) => b.createdAt - a.createdAt) ?? [];
}

function mapClipContentType(type: ClipItem['contentType']): SontoItem['contentType'] {
  switch (type) {
    case 'code':
      return 'code';
    case 'email':
      return 'email';
    case 'image':
      return 'image';
    case 'link':
      return 'link';
    case 'prompt':
      return 'text';
    default:
      return 'text';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export async function getSontoItemCount(filter?: SontoItemFilter): Promise<number> {
  const items = await getAllSontoItems(filter);
  return items.length;
}

export async function clearAllSontoItems(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
