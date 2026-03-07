export type ProviderName = 'openai' | 'gemini' | 'grok';

export type AppLanguage = 'en' | 'de';

export interface AppSettings {
  llmProvider: ProviderName;
  openaiModel: string;
  geminiModel: string;
  grokModel: string;
  language: AppLanguage;
}

export interface Snippet {
  id: string;
  text: string;
  url: string;
  title: string;
  timestamp: number;
  embedding: number[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
