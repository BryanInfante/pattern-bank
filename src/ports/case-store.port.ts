import type { DecisionCase } from '../core/types.js';

/**
 * CaseStorePort — abstracts case persistence and embedding caching away from
 * the core (REQ-CORE-3). Concrete adapters (SQLite, in-memory) live in
 * `src/adapters/case-store/` and are injected from the composition root.
 */
export interface CaseStorePort {
  /** Load all decision case records (no embeddings). */
  loadCases(): Promise<DecisionCase[]>;
  /**
   * Return cached embedding vectors for the given embedder, or null on cache
   * miss. `expectedDim` is the active embedder's current output dimension —
   * any cached row whose `dim` does not match it is treated as a cache miss
   * (returns null) so the composition root recomputes the full batch instead
   * of reusing vectors from a stale/incompatible embedder dimension.
   */
  getCachedEmbeddings(embedderId: string, expectedDim: number): Promise<Float32Array[] | null>;
  /** Persist freshly computed embedding vectors for the given embedder. */
  saveEmbeddings(embedderId: string, vectors: Float32Array[]): Promise<void>;
  /** Release any underlying resource (e.g. the SQLite file handle) (JD-2). */
  close(): void;
}
