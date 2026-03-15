// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import type { ChatMessage, ProviderStrategy } from '../types';
import { ProviderBadResponseError, ProviderHttpError } from './errors';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; code?: number };
}

function buildContents(messages: ChatMessage[]): unknown[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

function buildSystemInstruction(messages: ChatMessage[]): string | undefined {
  const sys = messages.find((m) => m.role === 'system');
  return sys?.content;
}

export class GeminiProvider implements ProviderStrategy {
  async chat(input: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    signal: AbortSignal;
  }): Promise<string> {
    const systemInstruction = buildSystemInstruction(input.messages);
    const body: Record<string, unknown> = {
      contents: buildContents(input.messages),
      generationConfig: { temperature: 0.4 },
    };
    if (systemInstruction) {
      body['systemInstruction'] = { parts: [{ text: systemInstruction }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: input.signal,
    });

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) {
      throw new ProviderHttpError(res.status, data.error?.message ?? `HTTP ${res.status}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new ProviderBadResponseError('Provider returned an empty response.');

    return text;
  }

  async *chatStream(input: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    signal: AbortSignal;
  }): AsyncIterable<string> {
    const systemInstruction = buildSystemInstruction(input.messages);
    const body: Record<string, unknown> = {
      contents: buildContents(input.messages),
      generationConfig: { temperature: 0.4 },
    };
    if (systemInstruction) {
      body['systemInstruction'] = { parts: [{ text: systemInstruction }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:streamGenerateContent?alt=sse&key=${input.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      throw new ProviderHttpError(res.status, data.error?.message ?? `HTTP ${res.status}`);
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
            try {
              const json = JSON.parse(line.slice(6));
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) yield text;
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}