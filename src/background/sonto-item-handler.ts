// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MAX_CAPTURE_CHARS } from '../shared/constants';
import { MSG } from '../shared/messages';
import type {
  SaveSontoItemMessage,
  GetSontoItemsMessage,
  SearchSontoItemsMessage,
  UpdateSontoItemMessage,
  DeleteSontoItemMessage,
  ToggleZenifiedMessage,
  GetZenifiedItemsMessage,
  MarkItemSeenInZenMessage,
  AddTagMessage,
  RemoveTagMessage,
  GetAllTagsMessage,
} from '../shared/messages';
import {
  saveSontoItem,
  getAllSontoItems,
  searchSontoItems,
  updateSontoItem,
  deleteSontoItem,
  toggleZenified,
  getZenifiedItems,
  markItemAsSeenInZen,
  addTagToItem,
  removeTagFromItem,
  getAllTags,
} from '../shared/storage/items';
import type { SontoItem, SontoItemType, SontoContentType, SontoSource } from '../shared/types';

export class SontoItemHandler {
  async create(
    content: string,
    type: SontoItemType,
    source: SontoSource,
    options: {
      contentType?: SontoContentType;
      origin?: string;
      url?: string;
      title?: string;
      tags?: string[];
      pinned?: boolean;
      zenified?: boolean;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<SontoItem> {
    const now = Date.now();
    const item: SontoItem = {
      id: `${now}-${crypto.randomUUID()}`,
      type,
      content: content.slice(0, MAX_CAPTURE_CHARS),
      contentType: options.contentType ?? this.detectContentType(content),
      source,
      origin: options.origin ?? source,
      url: options.url,
      title: options.title,
      tags: options.tags ?? [],
      createdAt: now,
      pinned: options.pinned ?? false,
      zenified: options.zenified ?? false,
      metadata: options.metadata,
    };

    await saveSontoItem(item);
    return item;
  }

  async getAll(filter?: import('../shared/types').SontoItemFilter): Promise<SontoItem[]> {
    return getAllSontoItems(filter);
  }

  async search(query: string, filter?: import('../shared/types').SontoItemFilter): Promise<SontoItem[]> {
    return searchSontoItems(query, filter);
  }

  async update(id: string, updates: Partial<SontoItem>): Promise<void> {
    await updateSontoItem(id, updates);
  }

  async delete(id: string): Promise<void> {
    await deleteSontoItem(id);
  }

  async toggleZenified(id: string): Promise<boolean> {
    return toggleZenified(id);
  }

  async getZenified(options?: { limit?: number; excludeRecentMs?: number }): Promise<SontoItem[]> {
    return getZenifiedItems(options);
  }

  async markSeenInZen(id: string): Promise<void> {
    await markItemAsSeenInZen(id);
  }

  async addTag(id: string, tag: string): Promise<void> {
    await addTagToItem(id, tag);
  }

  async removeTag(id: string, tag: string): Promise<void> {
    await removeTagFromItem(id, tag);
  }

  async getAllTags(): Promise<string[]> {
    const tags = await getAllTags();
    return Array.from(tags).sort();
  }

  private detectContentType(text: string): SontoContentType {
    const trimmed = text.trim();
    if (/^https?:\/\/\S+$/.test(trimmed)) return 'link';
    if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(trimmed)) return 'email';
    if (/^```[\s\S]*```$/.test(trimmed) || /^\s{4}/.test(trimmed) || /[{}()[\];]/.test(trimmed.slice(0, 80))) {
      return 'code';
    }
    return 'text';
  }
}

export const sontoItemHandler = new SontoItemHandler();

export function registerSontoItemHandlers(
  register: (type: string, handler: import('./message-router').MessageHandler) => void,
): void {
  register(MSG.SAVE_SONTO_ITEM, async (msg) => {
    const { item } = msg as SaveSontoItemMessage;
    const created = await sontoItemHandler.create(
      item.content,
      item.type,
      item.source,
      {
        contentType: item.contentType,
        origin: item.origin,
        url: item.url,
        title: item.title,
        tags: item.tags,
        pinned: item.pinned,
        zenified: item.zenified,
        metadata: item.metadata,
      },
    );
    return { ok: true, item: created };
  });

  register(MSG.GET_SONTO_ITEMS, async (msg) => {
    const { filter } = msg as GetSontoItemsMessage;
    const items = await sontoItemHandler.getAll(filter);
    return { ok: true, items };
  });

  register(MSG.SEARCH_SONTO_ITEMS, async (msg) => {
    const { query, filter } = msg as SearchSontoItemsMessage;
    const items = await sontoItemHandler.search(query, filter);
    return { ok: true, items };
  });

  register(MSG.UPDATE_SONTO_ITEM, async (msg) => {
    const { id, updates } = msg as UpdateSontoItemMessage;
    await sontoItemHandler.update(id, updates);
    return { ok: true };
  });

  register(MSG.DELETE_SONTO_ITEM, async (msg) => {
    const { id } = msg as DeleteSontoItemMessage;
    await sontoItemHandler.delete(id);
    return { ok: true };
  });

  register(MSG.TOGGLE_ZENIFIED, async (msg) => {
    const { id } = msg as ToggleZenifiedMessage;
    const zenified = await sontoItemHandler.toggleZenified(id);
    return { ok: true, zenified };
  });

  register(MSG.GET_ZENIFIED_ITEMS, async (msg) => {
    const { limit, excludeRecentMs } = msg as GetZenifiedItemsMessage;
    const items = await sontoItemHandler.getZenified({ limit, excludeRecentMs });
    return { ok: true, items };
  });

  register(MSG.MARK_ITEM_SEEN_IN_ZEN, async (msg) => {
    const { id } = msg as MarkItemSeenInZenMessage;
    await sontoItemHandler.markSeenInZen(id);
    return { ok: true };
  });

  register(MSG.ADD_TAG, async (msg) => {
    const { id, tag } = msg as AddTagMessage;
    await sontoItemHandler.addTag(id, tag);
    return { ok: true };
  });

  register(MSG.REMOVE_TAG, async (msg) => {
    const { id, tag } = msg as RemoveTagMessage;
    await sontoItemHandler.removeTag(id, tag);
    return { ok: true };
  });

  register(MSG.GET_ALL_TAGS, async () => {
    const tags = await sontoItemHandler.getAllTags();
    return { ok: true, tags };
  });
}
