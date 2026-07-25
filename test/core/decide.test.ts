import { describe, expect, it } from 'vitest';
import { decide, DEFAULT_THRESHOLD } from '../../src/core/decide.js';
import type { DecideDeps, DecisionCase, EmbeddedCase } from '../../src/core/types.js';
import type { EmbeddingPort } from '../../src/ports/embedding.port.js';

/**
 * Fake EmbeddingPort — maps a small fixed set of query strings to
 * deterministic 2D vectors so cosine scores against the fixture cases below
 * are hand-predictable. No MiniLM/SQLite needed to test the core
 * (design.md "Testing Strategy").
 */
class FakeEmbeddingPort implements EmbeddingPort {
  readonly id = 'fake-test-embedder';
  readonly dim = 2;

  private readonly vectors: Record<string, [number, number]> = {
    'strategy-query': [1, 0],
    'ambiguous-query': [0.8, 0.6],
    'off-topic-query': [-1, -1],
  };

  async embed(text: string): Promise<Float32Array> {
    const vector = this.vectors[text];
    if (!vector) {
      throw new Error(`FakeEmbeddingPort: no fixture vector registered for "${text}"`);
    }
    return new Float32Array(vector);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

function makeCase(overrides: Partial<DecisionCase> & Pick<DecisionCase, 'id'>): DecisionCase {
  return {
    context: 'fixture context',
    recommended_pattern: 'fixture pattern',
    rejected_alternative: 'fixture alternative',
    why_not: 'fixture why-not',
    anti_pattern_flag: false,
    example_snippet: 'fixture snippet',
    tags: ['fixture'],
    ...overrides,
  };
}

const strategyCase: EmbeddedCase = {
  record: makeCase({
    id: 'strategy-case',
    context: 'A payment dispatcher has a growing if/else chain, one branch per provider.',
    recommended_pattern: 'Strategy',
    rejected_alternative: 'if/else chain',
    why_not: 'Every new provider requires editing the same shared function.',
    anti_pattern_flag: false,
    example_snippet: 'class CardStrategy implements PaymentStrategy { ... }',
    tags: ['strategy', 'conditional'],
  }),
  vector: new Float32Array([1, 0]),
};

const singletonCase: EmbeddedCase = {
  record: makeCase({
    id: 'singleton-case',
    context: 'A shared config instance is exposed via a Singleton getInstance().',
    recommended_pattern: 'Dependency Injection',
    rejected_alternative: 'Singleton',
    why_not: 'Hidden global state makes isolated unit testing unreliable.',
    anti_pattern_flag: true,
    example_snippet: 'class ConfigSingleton { static instance; static getInstance() {...} }',
    tags: ['singleton', 'di', 'anti-pattern'],
  }),
  vector: new Float32Array([0, 1]),
};

function buildDeps(overrides: Partial<DecideDeps> = {}): DecideDeps {
  return {
    embedding: new FakeEmbeddingPort(),
    cases: [strategyCase, singletonCase],
    ...overrides,
  };
}

describe('decide()', () => {
  it('returns a confident recommendation when a non-flagged case clears the threshold', async () => {
    const result = await decide('strategy-query', 'recommend', buildDeps());

    expect(result.kind).toBe('recommendation');
    if (result.kind !== 'recommendation') throw new Error('unreachable');
    expect(result.recommended_pattern).toBe('Strategy');
    expect(result.rejected_alternative).toBe('if/else chain');
    expect(result.why_not).toBe(strategyCase.record.why_not);
    expect(result.why).toBe(strategyCase.record.context);
    expect(result.case_id).toBe('strategy-case');
    expect(result.score).toBeCloseTo(1, 5);
  });

  it('in antipattern mode, only ever returns an anti_pattern_flag=true case, even when a non-flagged case scores higher', async () => {
    const deps = buildDeps();

    // Sanity check: in 'recommend' mode the SAME query best-matches the
    // non-flagged strategyCase (score 0.8 > 0.6) — proving the hard filter
    // below actually changes the outcome, not just the scores.
    const recommendResult = await decide('ambiguous-query', 'recommend', deps);
    expect(recommendResult.kind).toBe('recommendation');
    if (recommendResult.kind === 'recommendation') {
      expect(recommendResult.case_id).toBe('strategy-case');
    }

    const antipatternResult = await decide('ambiguous-query', 'antipattern', deps);
    expect(antipatternResult.kind).toBe('antipattern');
    if (antipatternResult.kind !== 'antipattern') throw new Error('unreachable');
    expect(antipatternResult.case_id).toBe('singleton-case');
    expect(antipatternResult.flagged).toBe('Singleton');
    expect(antipatternResult.simpler_alternative).toBe('Dependency Injection');
    expect(antipatternResult.why_misuse).toBe(singletonCase.record.why_not);
    expect(antipatternResult.score).toBeCloseTo(0.6, 5);
  });

  it('returns an explicit no_match with no fabricated fields when best score is below threshold', async () => {
    const result = await decide('off-topic-query', 'recommend', buildDeps());

    expect(result.kind).toBe('no_match');
    if (result.kind !== 'no_match') throw new Error('unreachable');
    expect(result.mode).toBe('recommend');
    expect(result.threshold).toBe(DEFAULT_THRESHOLD);
    expect(result.best_score).toBeLessThan(DEFAULT_THRESHOLD);
    expect(typeof result.message).toBe('string');
    // REQ-CORE-5: no invented pattern/rationale fields beyond the no_match shape.
    expect(Object.keys(result).sort()).toEqual(['best_score', 'kind', 'message', 'mode', 'threshold']);
  });

  it('returns no_match in antipattern mode when no flagged case clears the threshold', async () => {
    const result = await decide('off-topic-query', 'antipattern', buildDeps());

    expect(result.kind).toBe('no_match');
    if (result.kind !== 'no_match') throw new Error('unreachable');
    expect(result.mode).toBe('antipattern');
  });

  it('respects a custom threshold override', async () => {
    const deps = buildDeps({ threshold: 0.9 });
    // 'ambiguous-query' vs strategyCase scores 0.8, below a 0.9 threshold.
    const result = await decide('ambiguous-query', 'recommend', deps);
    expect(result.kind).toBe('no_match');
  });
});
