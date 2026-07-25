import type { DecideDeps, DecisionMode, DecisionResult, EmbeddedCase } from './types.js';
import { cosineSimilarity } from './cosine.js';
import { buildAntipattern, buildNoMatch, buildRecommendation } from './shape.js';

/** Default similarity threshold; overridable via `DecideDeps.threshold` (see design.md). */
export const DEFAULT_THRESHOLD = 0.45;

/**
 * `decide()` — the ONE application service both `recommend_pattern` and
 * `detect_antipattern` call (REQ-CORE-2, REQ-ANTI-3). Pure, delivery-channel
 * agnostic (REQ-CORE-1): it only calls the injected `EmbeddingPort` and
 * ranks preloaded in-memory cases via brute-force cosine (REQ-CORE-4).
 *
 * `mode === 'antipattern'` restricts the candidate set to
 * `anti_pattern_flag === true` cases BEFORE ranking (a hard pre-filter, not
 * a score boost — see design.md "detect_antipattern Biasing"). Both modes
 * share this identical retrieval body; the only deltas are the candidate
 * predicate and the final shaping branch.
 */
export async function decide(query: string, mode: DecisionMode, deps: DecideDeps): Promise<DecisionResult> {
  const threshold = deps.threshold ?? DEFAULT_THRESHOLD;

  const candidates: EmbeddedCase[] =
    mode === 'antipattern' ? deps.cases.filter((c) => c.record.anti_pattern_flag) : deps.cases;

  const queryVector = await deps.embedding.embed(query);

  let best: (EmbeddedCase & { score: number }) | null = null;
  for (const candidate of candidates) {
    const score = cosineSimilarity(queryVector, candidate.vector);
    if (best === null || score > best.score) {
      best = { ...candidate, score };
    }
  }

  if (best === null || best.score < threshold) {
    return buildNoMatch(mode, best?.score ?? 0, threshold);
  }

  return mode === 'antipattern' ? buildAntipattern(best.record, best.score) : buildRecommendation(best.record, best.score);
}
