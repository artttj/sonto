import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBEDDING_MODEL } from '../shared/constants';

env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('offscreen/');
env.allowRemoteModels = true;
env.allowLocalModels = false;

let pipelineInstance: FeatureExtractionPipeline | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelineInstance) {
    pipelineInstance = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: 'fp32',
    });
  }
  return pipelineInstance;
}

async function embed(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

chrome.runtime.onMessage.addListener((message: { type: string; text?: string }, _sender, sendResponse) => {
  if (message.type === 'SONTO_PING') {
    sendResponse({ ok: true });
    return;
  }

  if (message.type !== 'SONTO_EMBED') return;

  embed(message.text ?? '')
    .then((embedding) => sendResponse({ ok: true, embedding }))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Embedding failed';
      console.error('[Sonto offscreen] embed error:', err);
      sendResponse({ ok: false, error: msg });
    });

  return true;
});
