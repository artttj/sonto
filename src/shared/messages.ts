// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { QueryResult, ReadLaterItem, Snippet } from './types';

export const MSG = {
  CAPTURE_SNIPPET: 'CAPTURE_SNIPPET',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
  QUERY_SNIPPETS: 'QUERY_SNIPPETS',
  DELETE_SNIPPET: 'DELETE_SNIPPET',
  GET_ALL_SNIPPETS: 'GET_ALL_SNIPPETS',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  SNIPPET_ADDED: 'SNIPPET_ADDED',
  EXTRACT_CATEGORIES: 'EXTRACT_CATEGORIES',
  GENERATE_ZEN_FACT: 'GENERATE_ZEN_FACT',
  GENERATE_ZEN_STAT: 'GENERATE_ZEN_STAT',
  SYNC_HISTORY: 'SYNC_HISTORY',
  GET_RELATED_SNIPPETS: 'GET_RELATED_SNIPPETS',
  UPDATE_SNIPPET: 'UPDATE_SNIPPET',
  GET_SNIPPETS_FOR_TAB: 'GET_SNIPPETS_FOR_TAB',
  ADD_READ_LATER: 'ADD_READ_LATER',
  REMOVE_READ_LATER: 'REMOVE_READ_LATER',
  GET_READ_LATER: 'GET_READ_LATER',
  GENERATE_DIGEST: 'GENERATE_DIGEST',
} as const;

export interface CaptureSnippetMessage {
  type: typeof MSG.CAPTURE_SNIPPET;
  text: string;
  url: string;
  title: string;
  context?: string;
  tags?: string[];
  pinned?: boolean;
}

export interface QuerySnippetsMessage {
  type: typeof MSG.QUERY_SNIPPETS;
  query: string;
}

export interface DeleteSnippetMessage {
  type: typeof MSG.DELETE_SNIPPET;
  id: string;
}

export interface GetAllSnippetsMessage {
  type: typeof MSG.GET_ALL_SNIPPETS;
}

export interface OpenSettingsMessage {
  type: typeof MSG.OPEN_SETTINGS;
}

export interface ExtractCategoriesMessage {
  type: typeof MSG.EXTRACT_CATEGORIES;
  snippets: { text: string; title: string; source: string }[];
}

export interface GenerateZenFactMessage {
  type: typeof MSG.GENERATE_ZEN_FACT;
  category: string;
  previousFacts: string[];
  language: string;
}

export interface GenerateZenStatMessage {
  type: typeof MSG.GENERATE_ZEN_STAT;
  category: string;
  previousFacts: string[];
  language: string;
}

export interface GetRelatedSnippetsMessage {
  type: typeof MSG.GET_RELATED_SNIPPETS;
  snippetId: string;
  topK?: number;
}

export interface UpdateSnippetMessage {
  type: typeof MSG.UPDATE_SNIPPET;
  snippet: Snippet;
}

export interface GetSnippetsForTabMessage {
  type: typeof MSG.GET_SNIPPETS_FOR_TAB;
  url: string;
  title: string;
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

export interface GenerateDigestMessage {
  type: typeof MSG.GENERATE_DIGEST;
  language: string;
}

export interface SyncHistoryMessage {
  type: typeof MSG.SYNC_HISTORY;
}

export type RuntimeMessage =
  | CaptureSnippetMessage
  | QuerySnippetsMessage
  | DeleteSnippetMessage
  | GetAllSnippetsMessage
  | OpenSettingsMessage
  | ExtractCategoriesMessage
  | GenerateZenFactMessage
  | GenerateZenStatMessage
  | GetRelatedSnippetsMessage
  | UpdateSnippetMessage
  | GetSnippetsForTabMessage
  | AddReadLaterMessage
  | RemoveReadLaterMessage
  | GetReadLaterMessage
  | GenerateDigestMessage
  | SyncHistoryMessage;

export interface CaptureSuccessResult {
  ok: true;
  type: typeof MSG.CAPTURE_SUCCESS;
}

export interface CaptureErrorResult {
  ok: false;
  type: typeof MSG.CAPTURE_ERROR;
  message: string;
}

export interface QueryResult2 {
  ok: true;
  results: QueryResult[];
}

export interface AllSnippetsResult {
  ok: true;
  snippets: Snippet[];
}

export interface ReadLaterResult {
  ok: true;
  items: ReadLaterItem[];
}