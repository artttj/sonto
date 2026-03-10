// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { DB_NAME, DB_VERSION, STORE_NAME } from '../constants';
import type { QueryResult, Snippet } from '../types';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      } else {
        store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_NAME);
      }
      if (!store.indexNames.contains('url')) {
        store.createIndex('url', 'url', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function addSnippet(snippet: Snippet): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(snippet);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateSnippet(snippet: Snippet): Promise<void> {
  return addSnippet(snippet);
}

export async function deleteSnippet(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSnippets(): Promise<Snippet[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as Snippet[]).sort((a, b) => b.timestamp - a.timestamp));
    req.onerror = () => reject(req.error);
  });
}

export async function getSnippetById(id: string): Promise<Snippet | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Snippet | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function search(queryEmbedding: number[], topK: number): Promise<QueryResult[]> {
  const snippets = await getAllSnippets();
  return snippets
    .map((snippet) => ({ snippet, score: cosineSimilarity(queryEmbedding, snippet.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function getRelatedSnippets(snippetId: string, topK = 5): Promise<QueryResult[]> {
  const snippets = await getAllSnippets();
  const source = snippets.find((s) => s.id === snippetId);
  if (!source) return [];
  return snippets
    .filter((s) => s.id !== snippetId)
    .map((snippet) => ({ snippet, score: cosineSimilarity(source.embedding, snippet.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function getSnippetsForDomain(domain: string, topK = 5): Promise<Snippet[]> {
  const snippets = await getAllSnippets();
  return snippets
    .filter((s) => {
      try {
        return new URL(s.url).hostname === domain;
      } catch {
        return false;
      }
    })
    .slice(0, topK);
}

export async function hasSnippetForUrl(url: string): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('url').count(IDBKeyRange.only(url));
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllSnippets(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getSnippetCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}