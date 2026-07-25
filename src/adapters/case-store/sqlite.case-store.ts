import { DatabaseSync } from 'node:sqlite';
import type { CaseStorePort } from '../../ports/case-store.port.js';
import type { DecisionCase } from '../../core/types.js';

/**
 * SqliteCaseStore — SQLite-backed CaseStorePort (REQ-CORE-6, REQ-CORE-7).
 *
 * Driver note (deviation from design.md's primary choice): design.md names
 * `better-sqlite3` as the primary driver with `node:sqlite` (Node 22+) as
 * the documented fallback ("Alt: `node:sqlite`... avoids native build").
 * This environment (Node 24) ships `node:sqlite` with no native build step,
 * so it was used directly to avoid a node-gyp/prebuild-install risk on the
 * demo machine — exactly the swap the design's port isolation anticipated.
 * `better-sqlite3` can be swapped back later behind this same
 * `CaseStorePort` with zero core/adapter changes elsewhere.
 *
 * Schema (design.md "Case Storage & Seed/Load Flow"):
 *   cases(id TEXT PK, context, recommended_pattern, rejected_alternative,
 *         why_not, anti_pattern_flag INTEGER, example_snippet, tags TEXT[json])
 *   embeddings(case_id, embedder_id, dim, vec BLOB, PK(case_id, embedder_id))
 */

export const CASES_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    context TEXT NOT NULL,
    recommended_pattern TEXT NOT NULL,
    rejected_alternative TEXT NOT NULL,
    why_not TEXT NOT NULL,
    anti_pattern_flag INTEGER NOT NULL DEFAULT 0,
    example_snippet TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS embeddings (
    case_id TEXT NOT NULL,
    embedder_id TEXT NOT NULL,
    dim INTEGER NOT NULL,
    vec BLOB NOT NULL,
    PRIMARY KEY (case_id, embedder_id)
  );
`;

/** Shared schema creation, reused by `SqliteCaseStore` and `src/cases/seed.ts`. */
export function ensureCasesSchema(db: DatabaseSync): void {
  db.exec(CASES_SCHEMA_SQL);
}

const REQUIRED_STRING_FIELDS = [
  'id',
  'context',
  'recommended_pattern',
  'rejected_alternative',
  'why_not',
  'example_snippet',
] as const;

interface CaseRow {
  id: string;
  context: string;
  recommended_pattern: string;
  rejected_alternative: string;
  why_not: string;
  anti_pattern_flag: number;
  example_snippet: string;
  tags: string;
}

interface IdRow {
  id: string;
}

interface EmbeddingRow {
  dim: number;
  vec: Uint8Array;
}

export interface SqliteCaseStoreOptions {
  /** Path to the SQLite database file, or ':memory:'. */
  dbPath: string;
}

export class SqliteCaseStore implements CaseStorePort {
  private readonly db: DatabaseSync;

  constructor(options: SqliteCaseStoreOptions) {
    this.db = new DatabaseSync(options.dbPath);
    ensureCasesSchema(this.db);
  }

  async loadCases(): Promise<DecisionCase[]> {
    const rows = this.db.prepare('SELECT * FROM cases ORDER BY id').all() as unknown as CaseRow[];

    return rows.map((row) => {
      const record = row as unknown as Record<string, unknown>;
      const missing = REQUIRED_STRING_FIELDS.filter(
        (field) => record[field] === null || record[field] === undefined || record[field] === '',
      );
      if (missing.length > 0) {
        throw new Error(
          `SqliteCaseStore.loadCases: case "${String(record.id ?? '<unknown>')}" is missing required field(s): ${missing.join(', ')}`,
        );
      }

      return {
        id: row.id,
        context: row.context,
        recommended_pattern: row.recommended_pattern,
        rejected_alternative: row.rejected_alternative,
        why_not: row.why_not,
        anti_pattern_flag: Boolean(row.anti_pattern_flag),
        example_snippet: row.example_snippet,
        tags: JSON.parse(row.tags ?? '[]') as string[],
      };
    });
  }

  async getCachedEmbeddings(embedderId: string, expectedDim: number): Promise<Float32Array[] | null> {
    const caseRows = this.db.prepare('SELECT id FROM cases ORDER BY id').all() as unknown as IdRow[];
    if (caseRows.length === 0) {
      return null;
    }

    const vectors: Float32Array[] = [];
    for (const { id } of caseRows) {
      const row = this.db
        .prepare('SELECT dim, vec FROM embeddings WHERE case_id = ? AND embedder_id = ?')
        .get(id, embedderId) as unknown as EmbeddingRow | undefined;

      if (!row) {
        // Any single missing embedding invalidates the cache for this
        // embedder — the composition root recomputes the full batch.
        return null;
      }

      if (row.dim !== expectedDim || row.vec.byteLength !== row.dim * Float32Array.BYTES_PER_ELEMENT) {
        // Cached row's dimension doesn't match the active embedder (or the
        // stored bytes are internally inconsistent) — treat as a cache miss
        // rather than reusing a mismatched/corrupt vector (JD-1).
        return null;
      }

      vectors.push(new Float32Array(row.vec.buffer, row.vec.byteOffset, row.dim));
    }

    return vectors;
  }

  async saveEmbeddings(embedderId: string, vectors: Float32Array[]): Promise<void> {
    const caseRows = this.db.prepare('SELECT id FROM cases ORDER BY id').all() as unknown as IdRow[];
    if (caseRows.length !== vectors.length) {
      throw new Error(
        `SqliteCaseStore.saveEmbeddings: vector count (${vectors.length}) does not match case count (${caseRows.length})`,
      );
    }

    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO embeddings (case_id, embedder_id, dim, vec) VALUES (?, ?, ?, ?)',
    );

    // Single transaction (JD-1): a partial write (e.g. crash mid-batch) must
    // never leave mixed-dim rows behind for a later getCachedEmbeddings call
    // to read back.
    this.db.exec('BEGIN');
    try {
      caseRows.forEach(({ id }, index) => {
        const vector = vectors[index] as Float32Array;
        const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
        insert.run(id, embedderId, vector.length, buffer);
      });
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Release the underlying SQLite handle (JD-2). */
  close(): void {
    this.db.close();
  }
}
