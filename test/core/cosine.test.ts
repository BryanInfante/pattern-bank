import { describe, expect, it } from 'vitest';
import { cosineSimilarity } from '../../src/core/cosine.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('matches a known hand-computed value for non-trivial vectors', () => {
    // a=[1,2,3], b=[4,5,6] => dot=32, |a|=sqrt(14), |b|=sqrt(77)
    // cos = 32 / (sqrt(14)*sqrt(77)) = 0.9746318461970762...
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.9746318461970762, 5);
  });

  it('is symmetric: cos(a,b) === cos(b,a)', () => {
    const a = new Float32Array([0.8, 0.6]);
    const b = new Float32Array([0.1, 0.9]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 8);
  });

  it('returns 0 when either vector is the zero vector (no NaN)', () => {
    const zero = new Float32Array([0, 0, 0]);
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(v, zero)).toBe(0);
  });

  it('throws on dimension mismatch', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow(/dimension mismatch/);
  });
});
