// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export type AppLanguage = 'en' | 'de';

export interface AppSettings {
  language: AppLanguage;
}

export type ClipContentType = 'text' | 'link' | 'code' | 'email' | 'image';

export type ClipSource = 'clipboard' | 'manual' | 'shortcut' | 'context-menu';

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
