import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCasesSchema } from '../adapters/case-store/sqlite.case-store.js';
import { decisionCases } from './cases.data.js';
import type { DecisionCase } from '../core/types.js';

/**
 * seed.ts — creates the SQLite schema and inserts the authored decision
 * cases (design.md "Case Storage & Seed/Load Flow"; REQ-CORE-6). Rejects
 * (throws on) any record missing a required field instead of silently
 * inserting a partial row.
 *
 * This does NOT compute embeddings — embedding cache population happens at
 * composition-root startup (PR 2), keyed by the active embedder id, per
 * design.md.
 */

const REQUIRED_STRING_FIELDS = [
  'id',
  'context',
  'recommended_pattern',
  'rejected_alternative',
  'why_not',
  'example_snippet',
] as const;

function validateCase(record: DecisionCase): void {
  const missing = REQUIRED_STRING_FIELDS.filter((field) => {
    const value = record[field];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `seed: case "${record.id ?? '<unknown>'}" is missing required field(s): ${missing.join(', ')}`,
    );
  }
  if (typeof record.anti_pattern_flag !== 'boolean') {
    throw new Error(`seed: case "${record.id}" has an invalid anti_pattern_flag (must be boolean)`);
  }
  if (!Array.isArray(record.tags)) {
    throw new Error(`seed: case "${record.id}" has invalid tags (must be a string[])`);
  }
}

export interface SeedResult {
  inserted: number;
}

/**
 * Create the schema (if missing) and insert/replace the given decision
 * cases. Defaults to the authored `decisionCases` set.
 */
export function seed(dbPath: string, cases: DecisionCase[] = decisionCases): SeedResult {
  // node:sqlite does NOT create the DB's parent directory — must mkdir -p
  // before opening, mirroring what build.ts already does for its DB path
  // (JD-3: otherwise `npm run seed` crashes on a fresh clone with no data/ dir).
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    ensureCasesSchema(db);

    const insert = db.prepare(
      `INSERT OR REPLACE INTO cases
        (id, context, recommended_pattern, rejected_alternative, why_not, anti_pattern_flag, example_snippet, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let inserted = 0;
    for (const record of cases) {
      validateCase(record);
      insert.run(
        record.id,
        record.context,
        record.recommended_pattern,
        record.rejected_alternative,
        record.why_not,
        record.anti_pattern_flag ? 1 : 0,
        record.example_snippet,
        JSON.stringify(record.tags),
      );
      inserted += 1;
    }

    return { inserted };
  } finally {
    db.close();
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const dbPath = process.argv[2] ?? 'data/patterns-bank.db';
  const result = seed(dbPath);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${result.inserted} decision case(s) into ${dbPath}`);
}
