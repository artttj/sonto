// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { ClipItem, ReadLaterItem, SontoItem, SontoItemFilter, SontoItemType, SontoContentType, SontoSource } from './types';

export const MSG = {
  CAPTURE_CLIP: 'CAPTURE_CLIP',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
  SAVE_PROMPT: 'SAVE_PROMPT',
  GET_ALL_PROMPTS: 'GET_ALL_PROMPTS',
  DELETE_PROMPT: 'DELETE_PROMPT',
  DELETE_CLIP: 'DELETE_CLIP',
  GET_ALL_CLIPS: 'GET_ALL_CLIPS',
  SEARCH_CLIPS: 'SEARCH_CLIPS',
  UPDATE_CLIP: 'UPDATE_CLIP',
  CLEAR_CLIPS: 'CLEAR_CLIPS',
  CLIP_ADDED: 'CLIP_ADDED',
  PROMPT_ADDED: 'PROMPT_ADDED',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  ADD_READ_LATER: 'ADD_READ_LATER',
  REMOVE_READ_LATER: 'REMOVE_READ_LATER',
  GET_READ_LATER: 'GET_READ_LATER',
  CAPTURE_SNIPPET: 'CAPTURE_SNIPPET',
  EXTRACT_CATEGORIES: 'EXTRACT_CATEGORIES',
  GENERATE_ZEN_FACT: 'GENERATE_ZEN_FACT',
  GENERATE_ZEN_STAT: 'GENERATE_ZEN_STAT',
  QUICK_SEARCH: 'SONTO_QUICK_SEARCH',
  GET_RELATED_CLIPS: 'GET_RELATED_CLIPS',
  INSERT_TEXT: 'INSERT_TEXT',
  SAVE_SONTO_ITEM: 'SAVE_SONTO_ITEM',
  GET_SONTO_ITEMS: 'GET_SONTO_ITEMS',
  SEARCH_SONTO_ITEMS: 'SEARCH_SONTO_ITEMS',
  UPDATE_SONTO_ITEM: 'UPDATE_SONTO_ITEM',
  DELETE_SONTO_ITEM: 'DELETE_SONTO_ITEM',
  TOGGLE_ZENIFIED: 'TOGGLE_ZENIFIED',
  GET_ZENIFIED_ITEMS: 'GET_ZENIFIED_ITEMS',
  MARK_ITEM_SEEN_IN_ZEN: 'MARK_ITEM_SEEN_IN_ZEN',
  ADD_TAG: 'ADD_TAG',
  REMOVE_TAG: 'REMOVE_TAG',
  GET_ALL_TAGS: 'GET_ALL_TAGS',
} as const;

export interface CaptureClipMessage {
  type: typeof MSG.CAPTURE_CLIP;
  text: string;
  url?: string;
  title?: string;
  source: ClipItem['source'];
  contentType?: ClipItem['contentType'];
}

export interface DeleteClipMessage {
  type: typeof MSG.DELETE_CLIP;
  id: string;
}

export interface GetAllClipsMessage {
  type: typeof MSG.GET_ALL_CLIPS;
}

export interface SearchClipsMessage {
  type: typeof MSG.SEARCH_CLIPS;
  query: string;
}

export interface UpdateClipMessage {
  type: typeof MSG.UPDATE_CLIP;
  clip: ClipItem;
}

export interface ClearClipsMessage {
  type: typeof MSG.CLEAR_CLIPS;
}

export interface OpenSettingsMessage {
  type: typeof MSG.OPEN_SETTINGS;
}

export interface AddReadLaterMessage {
  type: typeof MSG.ADD_READ_LATER;
  url: string;
  title?: string;
}

export interface RemoveReadLaterMessage {
  type: typeof MSG.REMOVE_READ_LATER;
  url: string;
}

export interface GetReadLaterMessage {
  type: typeof MSG.GET_READ_LATER;
}

export interface GetRelatedClipsMessage {
  type: typeof MSG.GET_RELATED_CLIPS;
  domain: string;
}

export interface SavePromptMessage {
  type: typeof MSG.SAVE_PROMPT;
  text: string;
}

export interface GetAllPromptsMessage {
  type: typeof MSG.GET_ALL_PROMPTS;
}

export interface DeletePromptMessage {
  type: typeof MSG.DELETE_PROMPT;
  id: string;
}

export interface InsertTextMessage {
  type: typeof MSG.INSERT_TEXT;
  text: string;
}

export interface SaveSontoItemMessage {
  type: typeof MSG.SAVE_SONTO_ITEM;
  item: Omit<SontoItem, 'id' | 'createdAt'>;
}

export interface GetSontoItemsMessage {
  type: typeof MSG.GET_SONTO_ITEMS;
  filter?: SontoItemFilter;
}

export interface SearchSontoItemsMessage {
  type: typeof MSG.SEARCH_SONTO_ITEMS;
  query: string;
  filter?: SontoItemFilter;
}

export interface UpdateSontoItemMessage {
  type: typeof MSG.UPDATE_SONTO_ITEM;
  id: string;
  updates: Partial<SontoItem>;
}

export interface DeleteSontoItemMessage {
  type: typeof MSG.DELETE_SONTO_ITEM;
  id: string;
}

export interface ToggleZenifiedMessage {
  type: typeof MSG.TOGGLE_ZENIFIED;
  id: string;
}

export interface GetZenifiedItemsMessage {
  type: typeof MSG.GET_ZENIFIED_ITEMS;
  limit?: number;
  excludeRecentMs?: number;
}

export interface MarkItemSeenInZenMessage {
  type: typeof MSG.MARK_ITEM_SEEN_IN_ZEN;
  id: string;
}

export interface AddTagMessage {
  type: typeof MSG.ADD_TAG;
  id: string;
  tag: string;
}

export interface RemoveTagMessage {
  type: typeof MSG.REMOVE_TAG;
  id: string;
  tag: string;
}

export interface GetAllTagsMessage {
  type: typeof MSG.GET_ALL_TAGS;
}

export type RuntimeMessage =
  | CaptureClipMessage
  | DeleteClipMessage
  | GetAllClipsMessage
  | SearchClipsMessage
  | UpdateClipMessage
  | ClearClipsMessage
  | OpenSettingsMessage
  | AddReadLaterMessage
  | RemoveReadLaterMessage
  | GetReadLaterMessage
  | GetRelatedClipsMessage
  | SavePromptMessage
  | GetAllPromptsMessage
  | DeletePromptMessage
  | InsertTextMessage
  | SaveSontoItemMessage
  | GetSontoItemsMessage
  | SearchSontoItemsMessage
  | UpdateSontoItemMessage
  | DeleteSontoItemMessage
  | ToggleZenifiedMessage
  | GetZenifiedItemsMessage
  | MarkItemSeenInZenMessage
  | AddTagMessage
  | RemoveTagMessage
  | GetAllTagsMessage;

export interface CaptureSuccessResult {
  ok: true;
  type: typeof MSG.CAPTURE_SUCCESS;
}

export interface CaptureErrorResult {
  ok: false;
  type: typeof MSG.CAPTURE_ERROR;
  message: string;
}

export interface AllClipsResult {
  ok: true;
  clips: ClipItem[];
}

export interface SearchClipsResult {
  ok: true;
  clips: ClipItem[];
}

export interface ReadLaterResult {
  ok: true;
  items: ReadLaterItem[];
}

export interface SontoItemsResult {
  ok: true;
  items: SontoItem[];
}

export interface SontoItemResult {
  ok: true;
  item: SontoItem;
}

export interface ToggleZenifiedResult {
  ok: true;
  zenified: boolean;
}

export interface TagsResult {
  ok: true;
  tags: string[];
}
