import type { EmbeddingPort } from '../../ports/embedding.port.js';

/**
 * MiniLmEmbeddingPort — transformers.js / ONNX `all-MiniLM-L6-v2` embeddings
 * (UC-6, design.md "Dependencies"). Fully offline after the one-time model
 * download; no API key. Emits L2-normalized 384-dim vectors.
 *
 * NOTE (T9): the exact `0.45` default similarity threshold and this
 * adapter's cold-start behavior are calibrated empirically in a day-1 spike
 * (human task, not scripted here — see tasks.md T9). This file only needs
 * to be structurally correct; it is never exercised by `test/core` (those
 * tests inject a fake `EmbeddingPort` per design.md's testing strategy).
 * If the model fails to load, swap the composition root to
 * `KeywordEmbeddingPort` — zero core/adapter changes required (design.md
 * "Embedding Fallback Design").
 */

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;

// Minimal shape of the transformers.js feature-extraction pipeline output we
// rely on (a Tensor-like with a flat `data` buffer and `dims`). Using a
// narrow local type instead of importing transformers.js' internal types
// keeps this adapter resilient to that package's type surface changes.
interface FeatureExtractionOutput {
  data: Float32Array;
  dims: number[];
}

type FeatureExtractionFn = (
  texts: string | string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<FeatureExtractionOutput>;

export class MiniLmEmbeddingPort implements EmbeddingPort {
  readonly id = 'minilm-L6-v2';
  readonly dim = DIM;

  private extractorPromise: Promise<FeatureExtractionFn> | null = null;

  private async getExtractor(): Promise<FeatureExtractionFn> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        const { pipeline } = await import('@xenova/transformers');
        return pipeline('feature-extraction', MODEL_ID) as unknown as FeatureExtractionFn;
      })();
    }
    return this.extractorPromise;
  }

  async embed(text: string): Promise<Float32Array> {
    const [vector] = await this.embedBatch([text]);
    if (!vector) {
      throw new Error('MiniLmEmbeddingPort: embedding extraction produced no output vector');
    }
    return vector;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });

    const vectors: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      vectors.push(output.data.slice(i * this.dim, (i + 1) * this.dim));
    }
    return vectors;
  }
}
