import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * schemas.ts — shared MCP tool input schema and the two tool `description`
 * strings (REQ-MCP-2). Per design.md, tool descriptions are a first-class
 * design artifact: specific enough (purpose, input expectations, triggering
 * intent) that a calling LLM reliably chooses to invoke the right tool —
 * not a one-line generic stub.
 */

/**
 * Shared by both `recommend_pattern` and `detect_antipattern` (design.md
 * "MCP Adapter Design"). Both tools accept the same shape: a single
 * free-text `query` (problem description, requirement, bug description, or
 * code snippet — REQ-REC-2).
 */
export const DECISION_QUERY_INPUT_SCHEMA: Tool['inputSchema'] = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'A problem description, requirement, bug description, or code snippet.',
    },
  },
  required: ['query'],
};

/** design.md "MCP Adapter Design" — verbatim. */
export const RECOMMEND_PATTERN_DESCRIPTION =
  'Recommend the design/architecture pattern that best fits a described problem, requirement, or ' +
  'code snippet — AND explicitly name the obvious-but-wrong alternative and why it fails here. Call ' +
  "this when you are choosing HOW to structure code (e.g. 'how should I handle these payment " +
  "methods', 'refactor this growing if/else', a requirement before code exists, or a snippet you're " +
  'unsure about). Returns a curated judgment (pattern + why + why-not) grounded in a human-authored ' +
  "decision case, or an explicit 'no confident match' so you can fall back to your own reasoning. " +
  'This is judgment, not a definition lookup.';

/** design.md "MCP Adapter Design" — verbatim. */
export const DETECT_ANTIPATTERN_DESCRIPTION =
  'Check whether a code snippet or design is OVER-engineered or misapplies a pattern, and get a ' +
  'simpler alternative. Call this when code feels too abstract for its job (e.g. a Singleton where ' +
  'DI would do, a Strategy for two static branches, premature microservices, a Factory wrapping a ' +
  'plain constructor) or when a recurring bug smells structural. Returns the flagged misuse, why ' +
  "it's wrong in this context, and the simpler thing to do instead — grounded in a curated " +
  "anti-pattern case, or an explicit 'no confident match'. It is retrieval-based judgment, NOT a " +
  'static analyzer or linter.';
