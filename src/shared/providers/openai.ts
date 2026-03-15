// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { ChatMessage, ProviderStrategy } from '../types';
import { ProviderBadResponseError, ProviderHttpError } from './errors';

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function parseResponse(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as CompletionResponse;

  if (!res.ok) {
    throw new ProviderHttpError(res.status, body.error?.message ?? `HTTP ${res.status}`);
  }

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ProviderBadResponseError('Provider returned an empty response.');

  return text;
}

export class OpenAIProvider implements ProviderStrategy {
  async chat(input: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    signal: AbortSignal;
  }): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({ model: input.model, messages: input.messages, temperature: 0.4 }),
      signal: input.signal,
    });

    return parseResponse(res);
  }

  async *chatStream(input: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    signal: AbortSignal;
  }): AsyncIterable<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0.4,
        stream: true,
      }),
      signal: input.signal,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as CompletionResponse;
      throw new ProviderHttpError(res.status, body.error?.message ?? `HTTP ${res.status}`);
    }

    if (!res.body) throw new ProviderBadResponseError('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) yield delta;
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
