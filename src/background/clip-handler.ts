// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import type { CaptureClipMessage, DeleteClipMessage, GetAllClipsMessage, SearchClipsMessage, UpdateClipMessage, ClearClipsMessage } from '../shared/messages';
import {
  addClip,
  deleteClip,
  getAllClips,
  updateClip,
  clearAllClips,
  searchClips,
} from '../shared/embeddings/vector-store';
import { getMaxHistorySize, getClipboardMonitoring } from '../shared/storage';
import { buildTags } from '../shared/utils';
import type { ClipItem, ClipContentType, ClipSource } from '../shared/types';
import { sontoItemHandler } from './sonto-item-handler';

const CHECK_RECENT_COUNT = 5;
const MAX_CAPTURE_CHARS = 10000;

export class ClipHandler {
  async capture(
    text: string,
    source: ClipSource,
    url?: string,
    title?: string,
    explicitContentType?: ClipContentType,
  ): Promise<void> {
    const trimmed = text.slice(0, MAX_CAPTURE_CHARS);
    if (!trimmed.trim()) throw new Error('Nothing to save.');

    const monitoring = await getClipboardMonitoring();
    if (!monitoring && source === 'clipboard') throw new Error('Clipboard monitoring is off.');

    if (await this.isRepeatOfRecentClip(trimmed)) throw new Error('Already in clipboard history.');

    const contentType = explicitContentType ?? this.detectContentType(trimmed);
    const tags = buildTags(url);

    const clip: ClipItem = {
      id: this.generateId(),
      text: trimmed,
      contentType,
      source,
      timestamp: Date.now(),
      ...(url ? { url } : {}),
      ...(title ? { title } : {}),
      ...(tags.length ? { tags } : {}),
    };

    await addClip(clip);

    // Also save to unified storage for sidebar v2
    await sontoItemHandler.create(trimmed, 'clip', source, {
      contentType: contentType === 'prompt' ? 'text' : contentType,
      url,
      title,
      tags: tags.length ? tags : [],
    });

    await this.enforceHistoryLimit();
    void chrome.runtime.sendMessage({ type: MSG.CLIP_ADDED }).catch(() => {});
  }

  async delete(id: string): Promise<void> {
    await deleteClip(id);
  }

  async getAll(): Promise<ClipItem[]> {
    return getAllClips();
  }

  async search(query: string): Promise<ClipItem[]> {
    return searchClips(query);
  }

  async update(clip: ClipItem): Promise<void> {
    await updateClip(clip);
  }

  async clear(): Promise<void> {
    await clearAllClips();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private detectContentType(text: string): ClipContentType {
    const trimmed = text.trim();
    if (/^https?:\/\/\S+$/.test(trimmed)) return 'link';
    if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(trimmed)) return 'email';
    if (/^```[\s\S]*```$/.test(trimmed) || /^\s{4}/.test(trimmed) || /[{}()[\];]/.test(trimmed.slice(0, 80))) return 'code';
    return 'text';
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private async isRepeatOfRecentClip(text: string): Promise<boolean> {
    const normalized = this.normalizeText(text);
    const all = await getAllClips();
    if (all.length === 0) return false;

    const recent = all.slice(0, CHECK_RECENT_COUNT);
    return recent.some(clip => this.normalizeText(clip.text) === normalized);
  }

  private async enforceHistoryLimit(): Promise<void> {
    const [maxSize, all] = await Promise.all([getMaxHistorySize(), getAllClips()]);
    if (all.length <= maxSize) return;

    const nonPinned = all.filter((c) => !c.pinned);
    const toRemove = nonPinned.slice(-(all.length - maxSize));
    await Promise.all(toRemove.map((c) => deleteClip(c.id)));
  }
}

export const clipHandler = new ClipHandler();

export function registerClipHandlers(register: (type: string, handler: import('./message-router').MessageHandler) => void): void {
  register(MSG.CAPTURE_CLIP, async (msg) => {
    const { text, url, title, source, contentType } = msg as CaptureClipMessage;
    await clipHandler.capture(text, source, url, title, contentType);
    return { type: MSG.CAPTURE_SUCCESS };
  });

  register(MSG.DELETE_CLIP, async (msg) => {
    await clipHandler.delete((msg as DeleteClipMessage).id);
    return {};
  });

  register(MSG.GET_ALL_CLIPS, async () => {
    const clips = await clipHandler.getAll();
    return { clips };
  });

  register(MSG.SEARCH_CLIPS, async (msg) => {
    const clips = await clipHandler.search((msg as SearchClipsMessage).query);
    return { clips };
  });

  register(MSG.UPDATE_CLIP, async (msg) => {
    await clipHandler.update((msg as UpdateClipMessage).clip);
    return {};
  });

  register(MSG.CLEAR_CLIPS, async () => {
    await clipHandler.clear();
    return {};
  });
}
