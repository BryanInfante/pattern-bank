/**
 * EmbeddingPort — abstracts the concrete embedding model/library away from the
 * core. Concrete adapters (MiniLM/ONNX, keyword-overlap stub) live in
 * `src/adapters/embedding/` and are injected from the composition root.
 *
 * REQ-CORE-3: the core MUST depend only on this interface, never on a
 * concrete embedding library directly.
 */
export interface EmbeddingPort {
  /** Identifies the embedder (e.g. "minilm-L6-v2" | "keyword-stub"); tags the embedding cache. */
  readonly id: string;
  /** Dimensionality of vectors produced by this port. */
  readonly dim: number;
  /** Embed a single piece of text. */
  embed(text: string): Promise<Float32Array>;
  /** Embed multiple texts, preserving input order. */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}
