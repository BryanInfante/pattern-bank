# Spec: Antipattern-Detection (Decision-Layer MVP)

> Capability: `antipattern-detection` · Part of: `decision-layer-mvp` change
> Flag over-engineering and misapplied patterns; recommend simpler alternatives

## Overview

The antipattern-detection tool (`detect_antipattern`) accepts a code snippet or design
description and flags cases of over-engineering or misapplied patterns. It returns:
1. The flagged misuse (e.g., "Singleton where Dependency Injection would suffice")
2. A "why it's wrong" explanation for this context (grounded in a curated decision case)
3. A simpler suggested alternative

**Critical design constraint:** This tool is implemented as retrieval+reasoning over
curated anti-pattern cases — NOT a static analyzer or linter. No AST parsing, no
linting rules, no code execution. The retrieval path is identical to `recommend_pattern`;
the only difference is a hard candidate pre-filter (restrict to `anti_pattern_flag=true`
cases) and the result-shaping frame.

## Related Use Cases

- **UC-3: Detect over-engineering / misapplied pattern in a snippet** — Core embeds snippet,
  restricts to anti-pattern-flagged cases, returns flagged issue + simpler suggestion.
- **UC-4: No sufficiently-close decision case found** — Even anti-pattern detection can fail
  to match confidently and degrades gracefully to a no-match result.
- **UC-8: Recommend a structural fix from a bug description** — Bug snippets may trigger
  anti-pattern matches; diagnostic framing reveals structural weakness.

## Requirements

### REQ-ANTI-1 — Retrieval+reasoning, not a static analyzer (Must, non-functional constraint)

`detect_antipattern` MUST be implemented as retrieval over anti-pattern-flagged decision
cases plus result shaping; it MUST NOT include AST parsing, linting rules, or any
static-analysis engine.

**Given** the `detect_antipattern` implementation  
**When** its dependencies are inspected  
**Then** no AST/linter/static-analysis library is present; only the shared `decide()`
retrieval path is used

### REQ-ANTI-2 — Detection output shape (Must)

`detect_antipattern` MUST return the flagged anti-pattern/misuse, why it is a misuse in
this context, and a simpler suggested alternative.

**Given** a snippet matching an anti-pattern-flagged case  
**When** `detect_antipattern` is invoked  
**Then** the response includes the flagged issue, a why-misuse explanation, and a
simpler-alternative suggestion

### REQ-ANTI-3 — Shares core retrieval path (Must)

`detect_antipattern` MUST call the same `decide()` core function as `recommend_pattern`
(REQ-CORE-2), scoped/biased toward `anti_pattern_flag = true` cases.

**Given** a call to `detect_antipattern`  
**When** traced  
**Then** it invokes `decide(query, 'antipattern')` and not a separate implementation

### REQ-ANTI-4 — No-match degrades gracefully (Must)

Same as REQ-REC-3, for `detect_antipattern`: when no confident anti-pattern case matches,
the result explicitly states this as a normal (non-error) response.

**Given** a snippet with no confident anti-pattern case match  
**When** `detect_antipattern` is invoked  
**Then** the response explicitly states no confident anti-pattern match, as a normal
(non-error) result

## Non-Functional Requirements

- **`detect_antipattern` is not a linter (Must):** Explicit constraint against static-analysis
  scope creep. No AST, no code execution, no static rules. Retrieval+reasoning only.
- **Shared retrieval path:** REQ-ANTI-3 ensures both tools (recommend and antipattern) use
  the identical `decide()` core, differing only by mode and candidate filtering.
- **Grounded judgment:** Every anti-pattern flag is grounded in a curated decision case with
  a `anti_pattern_flag=true` marker; no invented misuse claims.
- **Graceful no-match:** REQ-ANTI-4 ensures the tool never returns a fabricated flag when
  retrieval confidence is insufficient.

## Delivery

This capability is exposed via:
- **MCP adapter** (PRIMARY) — `detect_antipattern` tool on the MCP stdio server
- **CLI adapter** (STRETCH) — shell-invokable `patterns-bank antipattern <query>` command

Both adapters call the same core `decide(query, 'antipattern')` service and format the
result for their respective output channels.

## Traceability

| Use Case | Requirements |
|----------|--------------|
| UC-3 (detect anti-pattern) | REQ-ANTI-1, REQ-ANTI-2, REQ-ANTI-3 |
| UC-4 (no-match) | REQ-ANTI-4 |
| UC-8 (structural fix from bug) | REQ-ANTI-1, REQ-ANTI-2, REQ-ANTI-3, REQ-ANTI-4 |
