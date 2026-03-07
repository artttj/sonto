import type { QueryResult, Snippet } from './types';

export const MSG = {
  CAPTURE_SNIPPET: 'CAPTURE_SNIPPET',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
  QUERY_SNIPPETS: 'QUERY_SNIPPETS',
  DELETE_SNIPPET: 'DELETE_SNIPPET',
  GET_ALL_SNIPPETS: 'GET_ALL_SNIPPETS',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  SNIPPET_ADDED: 'SNIPPET_ADDED',
  GENERATE_INSIGHT: 'GENERATE_INSIGHT',
} as const;

export interface CaptureSnippetMessage {
  type: typeof MSG.CAPTURE_SNIPPET;
  text: string;
  url: string;
  title: string;
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

export interface GenerateInsightMessage {
  type: typeof MSG.GENERATE_INSIGHT;
  snippetSample: { text: string; title: string; source: string }[];
  previousInsights?: string[];
}

export type RuntimeMessage =
  | CaptureSnippetMessage
  | QuerySnippetsMessage
  | DeleteSnippetMessage
  | GetAllSnippetsMessage
  | OpenSettingsMessage
  | GenerateInsightMessage;

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
