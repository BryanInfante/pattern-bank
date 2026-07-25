# Spec: Pattern-Recommendation (Decision-Layer MVP)

> Capability: `pattern-recommendation` · Part of: `decision-layer-mvp` change
> Curated pattern recommendation with explicit rejection of obvious-but-wrong alternatives

## Overview

The pattern-recommendation tool (`recommend_pattern`) accepts a free-text problem description,
code snippet, or requirement and returns:
1. A recommended design/architecture pattern that best fits the context
2. A "why" explanation grounded in a curated decision case
3. A "why-not" explanation for the obvious-but-wrong alternative

This tool exists to close a gap: LLMs already recall GoF/architecture pattern *definitions*
fluently, but lack *judgment* — picking the right pattern for a specific context and
recognizing when applying a pattern is itself over-engineering. This tool adds that curated
judgment layer, not a definition lookup.

## Related Use Cases

- **UC-1: Recommend a pattern from a described problem** — Agent sends problem text; core retrieves and shapes the best-fit pattern.
- **UC-2: Recommend a pattern from a code snippet** — Agent sends code snippet; same retrieval path as UC-1.
- **UC-7: Recommend a pattern from a requirement (design-time)** — Requirement text is the embeddable query; reuses UC-1 path unchanged.
- **UC-8: Recommend a structural fix from a bug description (diagnostic)** — Bug description is the query; diagnostic framing reveals structural weakness.

## Requirements

### REQ-REC-1 — Recommendation output shape (Must)

`recommend_pattern` MUST return the recommended pattern, a why (grounded in the matched
case's context), and a why-not for the rejected/obvious alternative.

**Given** a query that retrieves a confident case match  
**When** `recommend_pattern` is invoked  
**Then** the response includes `recommended_pattern`, a why explanation, and a why-not
explanation referencing `rejected_alternative`

### REQ-REC-2 — Accepts prose or snippet input (Must)

`recommend_pattern` MUST accept either a free-text problem description or a code snippet
as the query, treating both as embeddable text (Given/When/Then per UC-1/UC-2).

**Given** a prose problem description  
**When** `recommend_pattern` is invoked  
**Then** retrieval proceeds identically to a snippet query, with no snippet-specific
parsing branch

### REQ-REC-3 — No-match degrades gracefully (Must)

`recommend_pattern` MUST surface the core's no-match result (REQ-CORE-5) as a normal
(non-error) tool response the calling agent can reason about.

**Given** a query with no confident case match  
**When** `recommend_pattern` is invoked  
**Then** the response is a valid (non-error) result explicitly stating no confident match
was found

## Non-Functional Requirements

- **Input agnosticism:** Problem descriptions, code snippets, requirements, and bug
  descriptions are all treated identically as embeddable text — no snippet-specific
  parsing or AST analysis.
- **Grounded judgment:** Every recommendation is grounded in a curated decision case;
  no generic LLM-style pattern definitions or invented rationales.
- **Honest no-match:** When retrieval confidence is insufficient, the tool explicitly
  reports this (UC-4), allowing the user to fall back to their own reasoning.

## Delivery

This capability is exposed via:
- **MCP adapter** (PRIMARY) — `recommend_pattern` tool on the MCP stdio server
- **CLI adapter** (STRETCH) — shell-invokable `patterns-bank recommend <query>` command

Both adapters call the same core `decide(query, 'recommend')` service and format the
result for their respective output channels (text over MCP, plain text to stdout via CLI).

## Traceability

| Use Case | Requirements |
|----------|--------------|
| UC-1 (recommend from problem text) | REQ-REC-1, REQ-REC-2, REQ-REC-3 |
| UC-2 (recommend from snippet) | REQ-REC-1, REQ-REC-2, REQ-REC-3 |
| UC-7 (recommend from requirement) | REQ-REC-1, REQ-REC-2, REQ-REC-3 |
| UC-8 (structural fix from bug) | REQ-REC-1, REQ-REC-2, REQ-REC-3 |
