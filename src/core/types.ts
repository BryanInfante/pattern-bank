import type { EmbeddingPort } from '../ports/embedding.port.js';

/**
 * Core domain types for the decision layer (REQ-CORE-3, REQ-CORE-6).
 *
 * This module MUST stay delivery-channel-agnostic: it imports only port
 * interfaces, never a concrete adapter, MCP SDK, CLI framework, or HTTP
 * library (REQ-CORE-1).
 */

export type DecisionMode = 'recommend' | 'antipattern';

/**
 * A single curated decision case (REQ-CORE-6). Every field is required —
 * loaders MUST reject a record missing any of them.
 */
export interface DecisionCase {
  /** Stable case identifier. */
  id: string;
  /** The situation being decided; this is the text embedded for retrieval. */
  context: string;
  /** The pattern this case recommends. */
  recommended_pattern: string;
  /** The obvious-but-wrong (or over-engineered) alternative. */
  rejected_alternative: string;
  /** Why the rejected alternative fails/misleads in this context. */
  why_not: string;
  /** Marks this case as an over-engineering/misuse target for `detect_antipattern`. */
  anti_pattern_flag: boolean;
  /** Short illustrative code snippet. */
  example_snippet: string;
  /** Coarse filtering/grouping tags. */
  tags: string[];
}

/** A decision case preloaded with its embedding vector, ready for in-memory retrieval. */
export interface EmbeddedCase {
  record: DecisionCase;
  vector: Float32Array;
}

/**
 * Dependencies injected into `decide()` by the composition root
 * (REQ-CORE-3). `cases` are preloaded/embedded in memory — no I/O happens
 * inside `decide()` itself beyond calling `embedding.embed()`.
 */
export interface DecideDeps {
  embedding: EmbeddingPort;
  cases: EmbeddedCase[];
  /** Minimum cosine score required to accept a match. Defaults to 0.45 (see design.md). */
  threshold?: number;
}

/**
 * The single result DTO returned by `decide()`. Adapters format this DTO;
 * they never reshape retrieval logic (REQ-MCP-3, REQ-CLI-1).
 */
export type DecisionResult =
  | {
      kind: 'recommendation';
      recommended_pattern: string;
      why: string;
      rejected_alternative: string;
      why_not: string;
      score: number;
      example_snippet: string;
      case_id: string;
    }
  | {
      kind: 'antipattern';
      flagged: string;
      why_misuse: string;
      simpler_alternative: string;
      score: number;
      example_snippet: string;
      case_id: string;
    }
  | {
      kind: 'no_match';
      mode: DecisionMode;
      best_score: number;
      threshold: number;
      message: string;
    };
