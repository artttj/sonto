// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { ProviderName, ProviderStrategy } from '../types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

const providers: Record<ProviderName, ProviderStrategy> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
};

export function getProviderStrategy(provider: ProviderName): ProviderStrategy {
  return providers[provider];
}