# Spec: Decision-Core (Decision-Layer MVP)

> Capability: `decision-core` · Part of: `decision-layer-mvp` change
> Pure decision service (no I/O, no delivery channels)

## Overview

The decision-core is the pure retrieval and decision-shaping engine. It is completely
delivery-channel-agnostic (no MCP, no CLI, no HTTP). It exposes a single application service
`decide(query, mode)` that performs similarity-based retrieval over curated decision cases,
ranks candidates via cosine similarity, applies a threshold, and shapes the result into one
of three discriminated-union types: `recommendation`, `antipattern`, or `no_match`.

Both `recommend_pattern` and `detect_antipattern` tools use the same underlying retrieval path
— the only difference is filtering (antipattern mode restricts to `anti_pattern_flag=true`
cases) and result shaping.

## Related Use Cases

- **UC-1: Recommend a pattern from a described problem** — Core embeds query, ranks via cosine, returns pattern + why + why-not.
- **UC-2: Recommend a pattern from a code snippet** — Snippet treated as opaque text; same retrieval path as UC-1.
- **UC-3: Detect over-engineering / misapplied pattern in a snippet** — Antipattern mode restricts candidate set to flagged cases only.
- **UC-4: No sufficiently-close decision case found** — Graceful no-match when best score is below threshold; never fabricates.
- **UC-6: Offline embedding setup / first-run model load** — Embedding port loads offline; cached embeddings by embedder ID.
- **UC-7: Recommend a pattern from a requirement** — Input variant of UC-1; no new engine code.
- **UC-8: Recommend a structural fix from a bug description** — Input variant of UC-1/UC-3; no new engine code.

## Requirements

### REQ-CORE-1 — Pure decision service (Must)

The core `decide(query, mode)` service MUST have zero imports from any delivery channel
(no MCP SDK, no CLI/stdio parsing, no HTTP).

**Given** the core module's dependency graph  
**When** it is inspected  
**Then** no delivery-channel package (MCP SDK, CLI framework) appears anywhere in `src/core/`

### REQ-CORE-2 — Shared retrieval path for both tools (Must)

`recommend_pattern` and `detect_antipattern` MUST both call the same underlying retrieval
function in the core; the only difference MAY be the case subset/ranking bias
(anti-pattern-flagged) and the result-shaping step.

**Given** a query in `recommend` mode and the same query in `antipattern` mode  
**When** both are executed  
**Then** both call the identical `decide()` retrieval implementation, differing only in
mode-specific filtering/shaping — never in a separate retrieval algorithm

### REQ-CORE-3 — Ports for embedding and case storage (Must)

The core MUST depend only on an embedding port interface and a case-store port interface,
never on a concrete embedding library or database driver directly.

**Given** the core's `decide()` implementation  
**When** it needs an embedding or a case record  
**Then** it calls the port interface, and a concrete adapter (ONNX/MiniLM, SQLite) is
injected from outside the core

### REQ-CORE-4 — Brute-force cosine retrieval, no vector index (Must)

The core MUST compute similarity via brute-force in-memory cosine over all case embeddings
(8-12 rows); it MUST NOT depend on a vector index or `sqlite-vec`.

**Given** 8-12 loaded decision cases with precomputed embeddings  
**When** a query embedding is compared  
**Then** cosine similarity is computed against every case in memory and ranked, with no
ANN/vector-index dependency

### REQ-CORE-5 — Graceful no-match (Must)

The core MUST return an explicit "no confident match" result when the best score is below
the configured threshold, rather than returning a low-confidence match as if it were
confident, and MUST NOT fabricate a pattern name or rationale not grounded in a retrieved
case.

**Given** a query whose best cosine score is below threshold  
**When** `decide()` is called  
**Then** the result explicitly signals no confident match, with no invented pattern or
rationale

### REQ-CORE-6 — Decision-case schema (Must)

Each decision case MUST conform to the schema: `id`, `context`, `recommended_pattern`,
`rejected_alternative`, `why_not`, `anti_pattern_flag`, `example_snippet`, `tags`.

**Given** the case-store loader  
**When** it validates a case record  
**Then** a record missing any required field is rejected/fails loading

### REQ-CORE-7 — Case-set size (Must)

The system MUST ship with 8-12 original, human-authored decision cases (no copied
refactoring.guru text).

**Given** the loaded case store at startup  
**When** its row count is checked  
**Then** it contains between 8 and 12 case records

## Non-Functional Requirements

- **Agnosticism (Must):** The core MUST remain 100% delivery-channel-agnostic; only
  adapters (`src/adapters/*`) may import protocol/channel-specific packages.
- **Offline operation (Must):** Embedding and retrieval MUST work fully offline after
  initial model acquisition — no runtime network calls required to serve a request.
- **No API key (Must):** No cloud LLM/embedding API key is required anywhere in the
  retrieval path (local ONNX model or keyword-overlap fallback only).
- **Graceful no-match (Must):** See REQ-CORE-5 — the system MUST NEVER fabricate a
  recommendation when retrieval confidence is insufficient.

## Architecture Notes

### Core Service Contract

```typescript
export type DecisionMode = 'recommend' | 'antipattern';

export interface DecideDeps {
  embedding: EmbeddingPort;
  cases: { record: DecisionCase; vector: Float32Array }[];
  threshold?: number;  // default 0.45
}

export type DecisionResult =
  | { kind: 'recommendation'; recommended_pattern: string; why: string;
      rejected_alternative: string; why_not: string; score: number;
      example_snippet: string; case_id: string; }
  | { kind: 'antipattern'; flagged: string; why_misuse: string;
      simpler_alternative: string; score: number; example_snippet: string; case_id: string; }
  | { kind: 'no_match'; mode: DecisionMode; best_score: number; threshold: number;
      message: string; };

export async function decide(
  query: string, mode: DecisionMode, deps: DecideDeps
): Promise<DecisionResult>;
```

### Antipattern Biasing

In `mode='antipattern'`, the candidate set is restricted to cases where
`anti_pattern_flag === true` BEFORE running cosine ranking. This hard pre-filter
(not a soft score boost) ensures any antipattern result is grounded in a real case
and cleanly yields UC-4 no-match when none match.

### Similarity Threshold

Default cosine threshold = `0.45` (tunable via `PB_SIM_THRESHOLD` env). For the
all-MiniLM-L6-v2 model, this value sits in the separating band between related and
unrelated text pairs empirically observed during day-1 demo calibration.

## Traceability

| Use Case | Requirements |
|----------|--------------|
| UC-1 (recommend from problem text) | REQ-CORE-1..7 |
| UC-2 (recommend from snippet) | REQ-CORE-1..4 |
| UC-3 (detect anti-pattern) | REQ-CORE-1..4 |
| UC-4 (no-match) | REQ-CORE-5 |
| UC-6 (offline setup / fallback) | REQ-CORE-3; Non-Functional: offline operation, no API key |
| UC-7 (recommend from requirement) | *Input variant of UC-1* — no new requirements |
| UC-8 (structural fix from bug) | *Input variant of UC-1/UC-3* — no new requirements |
