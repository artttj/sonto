// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export type ProviderName = 'openai' | 'gemini';

export type AppLanguage = 'en' | 'de';

export interface AppSettings {
  llmProvider: ProviderName;
  openaiModel: string;
  geminiModel: string;
  language: AppLanguage;
}

export interface HistoryDomainRules {
  mode: 'all' | 'allowlist';
  blocked: string[];
  allowed: string[];
}

export type SnippetSource = 'manual' | 'history' | 'pinned' | 'bookmark';

export interface Snippet {
  id: string;
  text: string;
  url: string;
  title: string;
  timestamp: number;
  embedding: number[];
  source?: SnippetSource;
  context?: string;
  tags?: string[];
  pinned?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface ReadLaterItem {
  url: string;
  title?: string;
  addedAt: number;
}

export interface QueryResult {
  snippet: Snippet;
  score: number;
}

export interface ProviderStrategy {
  chat(input: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    signal: AbortSignal;
  }): Promise<string>;
}
