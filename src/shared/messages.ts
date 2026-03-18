// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { ClipItem, ReadLaterItem, Flashcard } from './types';

export const MSG = {
  CAPTURE_CLIP: 'CAPTURE_CLIP',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
  DELETE_CLIP: 'DELETE_CLIP',
  GET_ALL_CLIPS: 'GET_ALL_CLIPS',
  SEARCH_CLIPS: 'SEARCH_CLIPS',
  UPDATE_CLIP: 'UPDATE_CLIP',
  CLEAR_CLIPS: 'CLEAR_CLIPS',
  CLIP_ADDED: 'CLIP_ADDED',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  ADD_READ_LATER: 'ADD_READ_LATER',
  REMOVE_READ_LATER: 'REMOVE_READ_LATER',
  GET_READ_LATER: 'GET_READ_LATER',
  CAPTURE_SNIPPET: 'CAPTURE_SNIPPET',
  EXTRACT_CATEGORIES: 'EXTRACT_CATEGORIES',
  GENERATE_ZEN_FACT: 'GENERATE_ZEN_FACT',
  GENERATE_ZEN_STAT: 'GENERATE_ZEN_STAT',
  UPDATE_DAILY_ALARM: 'UPDATE_DAILY_ALARM',
  QUICK_SEARCH: 'SONTO_QUICK_SEARCH',
  GET_RELATED_CLIPS: 'GET_RELATED_CLIPS',
  SAVE_FLASHCARD: 'SAVE_FLASHCARD',
  GET_FLASHCARDS: 'GET_FLASHCARDS',
} as const;

export interface CaptureClipMessage {
  type: typeof MSG.CAPTURE_CLIP;
  text: string;
  url?: string;
  title?: string;
  source: ClipItem['source'];
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

export interface UpdateDailyAlarmMessage {
  type: typeof MSG.UPDATE_DAILY_ALARM;
}

export interface GetRelatedClipsMessage {
  type: typeof MSG.GET_RELATED_CLIPS;
  domain: string;
}

export interface SaveFlashcardMessage {
  type: typeof MSG.SAVE_FLASHCARD;
  flashcard: import('./types').Flashcard;
}

export interface GetFlashcardsMessage {
  type: typeof MSG.GET_FLASHCARDS;
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
  | UpdateDailyAlarmMessage
  | GetRelatedClipsMessage
  | SaveFlashcardMessage
  | GetFlashcardsMessage;

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
