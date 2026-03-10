// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { getOpenAIKey, getGeminiKey } from '../storage';

async function embedViaOpenAI(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings: ${res.status}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

async function batchEmbedViaOpenAI(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings: ${res.status}`);
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embedViaGemini(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });
  if (!res.ok) throw new Error(`Gemini embeddings: ${res.status}`);
  const json = (await res.json()) as { embedding: { values: number[] } };
  return json.embedding.values;
}

async function batchEmbedViaGemini(texts: string[], apiKey: string): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      })),
    }),
  });
  if (!res.ok) throw new Error(`Gemini batch embeddings: ${res.status}`);
  const json = (await res.json()) as { embeddings: { values: number[] }[] };
  return json.embeddings.map((e) => e.values);
}

export async function embed(text: string): Promise<number[]> {
  const openaiKey = await getOpenAIKey();
  if (openaiKey) return embedViaOpenAI(text, openaiKey);

  const geminiKey = await getGeminiKey();
  if (geminiKey) return embedViaGemini(text, geminiKey);

  return [];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openaiKey = await getOpenAIKey();
  if (openaiKey) return batchEmbedViaOpenAI(texts, openaiKey);

  const geminiKey = await getGeminiKey();
  if (geminiKey) return batchEmbedViaGemini(texts, geminiKey);

  throw new Error('No API key configured. Add an OpenAI or Gemini key in Settings.');
}