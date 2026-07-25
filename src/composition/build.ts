import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { decide as coreDecide, DEFAULT_THRESHOLD } from '../core/decide.js';
import type { DecideDeps, DecisionMode, DecisionResult, EmbeddedCase } from '../core/types.js';
import type { EmbeddingPort } from '../ports/embedding.port.js';
import type { CaseStorePort } from '../ports/case-store.port.js';
import { SqliteCaseStore } from '../adapters/case-store/sqlite.case-store.js';
import { MiniLmEmbeddingPort } from '../adapters/embedding/minilm.embedding.js';
import { KeywordEmbeddingPort } from '../adapters/embedding/keyword.embedding.js';

/**
 * build.ts — the composition root (design.md "Module / File Layout";
 * REQ-CORE-1, REQ-CORE-3). This is the ONLY place that wires concrete
 * adapters (SQLite, MiniLM/keyword embedders) to the channel-agnostic core
 * and decides runtime configuration (DB path, similarity threshold,
 * embedder choice). No adapter (MCP, CLI) and no core module may perform
 * this wiring themselves.
 */

const DEFAULT_DB_PATH = 'data/patterns-bank.db';

/**
 * design.md "Similarity Threshold": MiniLM's L2-normalized cosine scores and
 * the keyword-stub's raw overlap scores occupy different ranges, so the
 * keyword fallback uses its own lower default (`0.20`) when no explicit
 * override is given.
 */
const KEYWORD_DEFAULT_THRESHOLD = 0.2;

export interface CompositionRoot {
  /** The single entry point every adapter (MCP, CLI) calls (REQ-CORE-2). */
  decide(query: string, mode: DecisionMode): Promise<DecisionResult>;
  /** Exposed for diagnostics/tests — which embedder and threshold ended up active. */
  readonly embedderId: string;
  readonly threshold: number;
  /** Releases the underlying case store's resources (e.g. SQLite handle) (JD-2). */
  close(): void;
}

export interface BuildOptions {
  /** Overrides `PB_DB_PATH` / the default `data/patterns-bank.db` path. */
  dbPath?: string;
}

/**
 * Reads `PB_SIM_THRESHOLD` (read only here, never inside the core — design.md).
 * Falls back to the embedder-appropriate default when unset/invalid.
 */
function resolveThreshold(embedderId: string): number {
  const raw = process.env.PB_SIM_THRESHOLD;
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return embedderId === 'keyword-stub' ? KEYWORD_DEFAULT_THRESHOLD : DEFAULT_THRESHOLD;
}

/**
 * Embedder selection (UC-6, design.md "Embedding Fallback Design"):
 * defaults to MiniLM, but swaps to the deterministic keyword stub when
 * `PB_EMBEDDER=keyword` is set, or automatically when MiniLM fails to load
 * (e.g. offline demo machine with no cached model). The keyword stub is
 * exercised eagerly here (not lazily on first request) so a load failure is
 * caught once, at startup, before the threshold/cache flow below runs.
 */
async function resolveEmbedder(): Promise<EmbeddingPort> {
  if (process.env.PB_EMBEDDER === 'keyword') {
    return new KeywordEmbeddingPort();
  }

  const minilm = new MiniLmEmbeddingPort();
  try {
    await minilm.embed('composition root warmup');
    return minilm;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[composition] MiniLM embedder failed to load; falling back to the keyword-overlap stub:',
      err,
    );
    return new KeywordEmbeddingPort();
  }
}

/**
 * Wires ports + adapters and boots the in-memory case/embedding cache
 * (design.md "Case Storage & Seed/Load Flow"): load cases, then
 * `getCachedEmbeddings(embedder.id, embedder.dim)`; on a cache miss, `embedBatch()` over
 * all case contexts and `saveEmbeddings()`.
 */
export async function build(options: BuildOptions = {}): Promise<CompositionRoot> {
  const dbPath = options.dbPath ?? process.env.PB_DB_PATH ?? DEFAULT_DB_PATH;

  // node:sqlite does NOT create the DB's parent directory — must mkdir -p
  // before opening the store, or the first run crashes (PR1 handoff note).
  if (dbPath !== ':memory:') {
    await mkdir(dirname(dbPath), { recursive: true });
  }

  const caseStore: CaseStorePort = new SqliteCaseStore({ dbPath });
  const embedding = await resolveEmbedder();
  const threshold = resolveThreshold(embedding.id);

  const records = await caseStore.loadCases();

  let vectors = await caseStore.getCachedEmbeddings(embedding.id, embedding.dim);
  if (!vectors) {
    vectors = await embedding.embedBatch(records.map((record) => record.context));
    await caseStore.saveEmbeddings(embedding.id, vectors);
  }

  const cases: EmbeddedCase[] = records.map((record, index) => ({
    record,
    vector: vectors![index] as Float32Array,
  }));

  const deps: DecideDeps = { embedding, cases, threshold };

  return {
    decide: (query: string, mode: DecisionMode) => coreDecide(query, mode, deps),
    embedderId: embedding.id,
    threshold,
    close: () => caseStore.close(),
  };
}
