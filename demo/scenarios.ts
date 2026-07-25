import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/composition/build.js';
import type { CompositionRoot } from '../src/composition/build.js';
import { seed } from '../src/cases/seed.js';
import type { DecisionMode, DecisionResult } from '../src/core/types.js';

/**
 * demo/scenarios.ts — T20/T21: the scripted "plain-LLM-vs-tool" demo.
 *
 * This IS the demo contrast device from proposal.md's "Intent": a flat
 * pattern catalog does not beat asking the LLM directly — the differentiator
 * is curated JUDGMENT (the why-not, the anti-pattern warning), not
 * definitions. Each scenario below prints:
 *   1) the query an agent/developer would send,
 *   2) a short, hardcoded "BEFORE" line — what a plain LLM asked cold
 *      typically says (generic, no explicit why-not, no grounded flag),
 *   3) the "AFTER" line — this tool's REAL `decide()` output, run through
 *      the real composition root (no mocked retrieval).
 *
 * Scenarios cover: one confident `recommend_pattern` match, one confident
 * `detect_antipattern` match, and one deliberately off-topic query that
 * demonstrates the graceful UC-4 no-match path (REQ-CORE-5) instead of a
 * fabricated answer.
 *
 * --- Rehearsal notes (T21) ---
 * - This script forces `PB_EMBEDDER=keyword` by default so it is
 *   deterministic, offline, and re-runnable with no model download
 *   (matches the `node:sqlite`/keyword pattern already used by
 *   `test/mcp/smoke.ts`). Set `PB_EMBEDDER=minilm` before running to
 *   rehearse against the real embedder instead.
 * - Live rehearsal against the FINAL embedder (and a final re-check of the
 *   `0.45` MiniLM threshold — see design.md "Similarity Threshold" and
 *   tasks.md T9) is a human, day-of task on the actual demo machine. This
 *   script only guarantees the scripted path is reproducible; it does not
 *   replace that rehearsal.
 * - Run with: `npm run demo` (`tsx demo/scenarios.ts`).
 *
 * Run directly via `tsx`, NOT vitest: importing the real SQLite case-store
 * adapter (`node:sqlite`) fails under vitest's Vite-based module graph
 * (PR1/PR2 handoff note) — the same reason `test/mcp/smoke.ts` is a `tsx`
 * script rather than a vitest test.
 */

interface Scenario {
  title: string;
  mode: DecisionMode;
  query: string;
  plainLlmBefore: string;
}

const SCENARIOS: Scenario[] = [
  {
    title: 'Scenario 1 — recommend_pattern (confident match)',
    mode: 'recommend',
    query:
      'Our checkout function decides how to charge a customer with a giant switch statement ' +
      'keyed on payment method, and we keep adding new payment providers over time.',
    plainLlmBefore:
      'A plain LLM asked cold usually suggests adding another else-if branch or wrapping the ' +
      'branches in a small helper function. It rarely names the Strategy pattern explicitly, and ' +
      'almost never explains WHY the growing conditional chain becomes a maintenance risk as more ' +
      'providers are added — no explicit why-not.',
  },
  {
    title: 'Scenario 2 — detect_antipattern (confident match)',
    mode: 'antipattern',
    query:
      'We have a ConfigSingleton class with a static getInstance() method that every module calls ' +
      'directly to get the shared config instance.',
    plainLlmBefore:
      'A plain LLM asked to review this snippet often praises the Singleton for giving "one shared ' +
      'instance app-wide" and suggests only minor cleanup. It rarely flags that the static ' +
      'getInstance() call hides a real dependency, leaks state across tests, and hurts testability.',
  },
  {
    title: 'Scenario 3 — off-topic query (graceful no-match, UC-4)',
    mode: 'recommend',
    query: "What's the best topping combination for a Margherita pizza on a Friday night?",
    plainLlmBefore:
      'A plain LLM tends to stay "helpful" anyway and improvises SOME architecture-flavored answer ' +
      'even when nothing relevant applies — sometimes inventing a pattern name and rationale with ' +
      'nothing real behind it, rather than admitting it has no grounded match.',
  },
];

/** Compact rendering of a `DecisionResult` — formatting only, no reshaping (mirrors the MCP adapter). */
function renderAfter(result: DecisionResult): string {
  switch (result.kind) {
    case 'recommendation':
      return (
        `Recommended pattern: ${result.recommended_pattern} (score ${result.score.toFixed(3)})\n` +
        `Why: ${result.why}\n` +
        `Rejected alternative: ${result.rejected_alternative}\n` +
        `Why not: ${result.why_not}\n` +
        `[case: ${result.case_id}]`
      );
    case 'antipattern':
      return (
        `Flagged as over-engineered/misapplied: ${result.flagged} (score ${result.score.toFixed(3)})\n` +
        `Why this is a misuse here: ${result.why_misuse}\n` +
        `Simpler alternative: ${result.simpler_alternative}\n` +
        `[case: ${result.case_id}]`
      );
    case 'no_match':
      return result.message;
  }
}

async function main(): Promise<void> {
  const dbDir = await mkdtemp(join(tmpdir(), 'patterns-bank-demo-'));
  const dbPath = join(dbDir, 'nested', 'demo.db');

  const previousEmbedder = process.env.PB_EMBEDDER;
  const previousDbPath = process.env.PB_DB_PATH;

  let root: CompositionRoot | undefined;

  try {
    await mkdir(join(dbDir, 'nested'), { recursive: true });
    const seedResult = seed(dbPath);

    // Deterministic-by-default (T21): keyword-stub unless the caller
    // explicitly asked for another embedder (e.g. `PB_EMBEDDER=minilm` for a
    // real rehearsal against the final embedder — see Rehearsal notes above).
    if (!process.env.PB_EMBEDDER) {
      process.env.PB_EMBEDDER = 'keyword';
    }
    process.env.PB_DB_PATH = dbPath;

    root = await build();

    console.log('='.repeat(72));
    console.log('patterns-bank demo — plain LLM vs. this tool (curated judgment)');
    console.log(`seeded ${seedResult.inserted} decision case(s); embedder=${root.embedderId}, threshold=${root.threshold}`);
    console.log('='.repeat(72));

    for (const scenario of SCENARIOS) {
      const result = await root.decide(scenario.query, scenario.mode);

      console.log(`\n--- ${scenario.title} ---`);
      console.log(`Query: "${scenario.query}"`);
      console.log(`\n[BEFORE — plain LLM, no tool]\n${scenario.plainLlmBefore}`);
      console.log(`\n[AFTER — patterns-bank ${scenario.mode === 'recommend' ? 'recommend_pattern' : 'detect_antipattern'}]\n${renderAfter(result)}`);
    }

    console.log(`\n${'='.repeat(72)}`);
    console.log('demo complete — 3/3 scenarios rendered (1 recommend, 1 antipattern, 1 graceful no-match)');
  } finally {
    if (previousEmbedder === undefined) delete process.env.PB_EMBEDDER;
    else process.env.PB_EMBEDDER = previousEmbedder;
    if (previousDbPath === undefined) delete process.env.PB_DB_PATH;
    else process.env.PB_DB_PATH = previousDbPath;
    // Close the case store's SQLite handle before the temp-dir rm() below,
    // so the Windows EBUSY cleanup race no longer applies (JD-2).
    root?.close();
    try {
      await rm(dbDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      // Best-effort OS temp-dir cleanup only — must never flip a passing
      // demo run to a failure.
      console.warn('[demo] temp dir cleanup skipped (non-fatal):', (cleanupErr as Error).message);
    }
  }
}

main().catch((err) => {
  console.error('[demo] FAILED:', err);
  process.exitCode = 1;
});
