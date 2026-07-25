import type { EmbeddingPort } from '../../ports/embedding.port.js';

/**
 * KeywordEmbeddingPort — deterministic, offline, model-free bag-of-words
 * fallback (UC-6, design.md "Embedding Fallback Design"). Implements the
 * SAME EmbeddingPort interface as the MiniLM adapter, so `decide()` and
 * every adapter above it never change when swapped. This is the GUARANTEED
 * path: no model download, no network, no native dependency.
 *
 * Tokens are hashed into a fixed-size vector (a minimal, deterministic
 * "hashing trick" bag-of-words). Because both case context and the query are
 * embedded through the SAME active port, vectors always share one space.
 *
 * Note: the composition root (PR 2) is expected to use a lower similarity
 * threshold (~0.20) for this embedder, since raw keyword-overlap scores
 * occupy a lower range than MiniLM's L2-normalized cosine scores.
 */

const DIM = 256;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on',
  'for', 'with', 'and', 'or', 'but', 'if', 'then', 'else', 'this', 'that', 'it', 'as', 'at', 'by',
  'from', 'into', 'than', 'so', 'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'can',
  'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'you', 'your', 'i', 'we', 'they',
  'he', 'she', 'its', 'about', 'each', 'when',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/** Deterministic FNV-1a-style string hash, folded into `[0, dim)`. */
function hashToken(token: string, dim: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % dim;
}

export class KeywordEmbeddingPort implements EmbeddingPort {
  readonly id = 'keyword-stub';
  readonly dim = DIM;

  async embed(text: string): Promise<Float32Array> {
    const vector = new Float32Array(this.dim);
    for (const token of tokenize(text)) {
      const index = hashToken(token, this.dim);
      vector[index] = (vector[index] as number) + 1;
    }
    return vector;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}
