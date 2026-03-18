// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { DB_NAME, DB_VERSION, STORE_NAME } from '../constants';
import type { ClipItem } from '../types';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (db.objectStoreNames.contains('snippets')) {
        db.deleteObjectStore('snippets');
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('contentType', 'contentType', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addClip(clip: ClipItem): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(clip);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateClip(clip: ClipItem): Promise<void> {
  return addClip(clip);
}

export async function deleteClip(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllClips(): Promise<ClipItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () =>
      resolve((req.result as ClipItem[]).sort((a, b) => b.timestamp - a.timestamp));
    req.onerror = () => reject(req.error);
  });
}

export async function getClipById(id: string): Promise<ClipItem | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as ClipItem | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function searchClips(query: string): Promise<ClipItem[]> {
  const all = await getAllClips();
  const lower = query.toLowerCase();
  return all.filter(
    (clip) =>
      clip.text.toLowerCase().includes(lower) ||
      clip.title?.toLowerCase().includes(lower) ||
      clip.url?.toLowerCase().includes(lower) ||
      clip.tags?.some((tag) => tag.toLowerCase().includes(lower)),
  );
}

export async function clearAllClips(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getClipCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOldestNonPinnedClip(): Promise<ClipItem | null> {
  const all = await getAllClips();
  const nonPinned = all.filter((c) => !c.pinned);
  if (nonPinned.length === 0) return null;
  return nonPinned.reduce((oldest, c) => (c.timestamp < oldest.timestamp ? c : oldest));
}
