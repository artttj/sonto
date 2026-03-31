// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export type AppLanguage = 'en' | 'de';

export interface AppSettings {
  language: AppLanguage;
}

export type SontoItemType = 'clip' | 'prompt' | 'zen';

export type SontoContentType =
  | 'text'
  | 'code'
  | 'quote'
  | 'art'
  | 'link'
  | 'idea'
  | 'haiku'
  | 'proverb'
  | 'strategy'
  | 'email'
  | 'image';

export type SontoSource =
  | 'clipboard'
  | 'manual'
  | 'shortcut'
  | 'context-menu'
  | 'zen-fetcher'
  | 'rss'
  | 'api';

export interface SontoItem {
  id: string;
  type: SontoItemType;
  content: string;
  contentType: SontoContentType;
  source: SontoSource;
  origin: string;
  url?: string;
  title?: string;
  tags: string[];
  createdAt: number;
  lastSeenAt?: number;
  pinned: boolean;
  zenified: boolean;
  metadata?: Record<string, unknown>;
}

export interface SontoItemFilter {
  types?: SontoItemType[];
  contentTypes?: SontoContentType[];
  sources?: SontoSource[];
  tags?: string[];
  pinned?: boolean;
  zenified?: boolean;
  limit?: number;
  offset?: number;
}

// Legacy types for migration compatibility

/** @deprecated Use SontoItem with type='clip' instead */
export type ClipContentType = 'text' | 'link' | 'code' | 'email' | 'image' | 'prompt';

/** @deprecated Use SontoSource instead */
export type ClipSource = 'clipboard' | 'manual' | 'shortcut' | 'context-menu';

/** @deprecated Use SontoItem with type='clip' instead */
export interface ClipItem {
  id: string;
  text: string;
  contentType: ClipContentType;
  source: ClipSource;
  url?: string;
  title?: string;
  timestamp: number;
  pinned?: boolean;
  tags?: string[];
}

/** @deprecated Use SontoItem with type='prompt' instead */
export type PromptColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

/** @deprecated Use SontoItem with type='prompt' instead */
export interface PromptItem {
  id: string;
  text: string;
  label?: string;
  color?: PromptColor;
  createdAt: number;
  pinned?: boolean;
}


export interface ReadLaterItem {
  url: string;
  title?: string;
  addedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  clipIds: string[];
  createdAt: number;
  color?: string;
}
