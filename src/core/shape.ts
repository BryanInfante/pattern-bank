import type { DecisionCase, DecisionMode, DecisionResult } from './types.js';

/**
 * DecisionResult builders (REQ-REC-1, REQ-ANTI-2, REQ-CORE-5). Each builder
 * maps a matched `DecisionCase` (or the absence of one) onto the shared
 * `DecisionResult` DTO. No retrieval logic lives here — only shaping.
 */

/** REQ-REC-1: recommended pattern + why (grounded in the case's context) + why-not. */
export function buildRecommendation(record: DecisionCase, score: number): DecisionResult {
  return {
    kind: 'recommendation',
    recommended_pattern: record.recommended_pattern,
    why: record.context,
    rejected_alternative: record.rejected_alternative,
    why_not: record.why_not,
    score,
    example_snippet: record.example_snippet,
    case_id: record.id,
  };
}

/**
 * REQ-ANTI-2: flags the misuse (the case's `rejected_alternative`), explains
 * why it is a misuse here (`why_not`), and names the simpler alternative
 * (`recommended_pattern`). Only ever called on `anti_pattern_flag === true`
 * cases (enforced by the hard pre-filter in `decide()`).
 */
export function buildAntipattern(record: DecisionCase, score: number): DecisionResult {
  return {
    kind: 'antipattern',
    flagged: record.rejected_alternative,
    why_misuse: record.why_not,
    simpler_alternative: record.recommended_pattern,
    score,
    example_snippet: record.example_snippet,
    case_id: record.id,
  };
}

/**
 * REQ-CORE-5: explicit, non-error, never-fabricated no-match result. Only
 * the raw score/threshold/mode are surfaced — no invented pattern name or
 * rationale.
 */
export function buildNoMatch(mode: DecisionMode, bestScore: number, threshold: number): DecisionResult {
  return {
    kind: 'no_match',
    mode,
    best_score: bestScore,
    threshold,
    message: `No decision case cleared the confidence threshold for mode "${mode}" ` +
      `(best score ${bestScore.toFixed(3)} < ${threshold}). Falling back to your own reasoning is safer here.`,
  };
}
