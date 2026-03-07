import type { ProviderName, ProviderStrategy } from '../types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { GrokProvider } from './grok';

const providers: Record<ProviderName, ProviderStrategy> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
  grok: new GrokProvider(),
};

export function getProviderStrategy(provider: ProviderName): ProviderStrategy {
  return providers[provider];
}
