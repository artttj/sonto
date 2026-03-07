import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBEDDING_MODEL } from '../constants';

let pipelineInstance: FeatureExtractionPipeline | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelineInstance) {
    pipelineInstance = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      device: 'wasm',
    });
  }
  return pipelineInstance;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
