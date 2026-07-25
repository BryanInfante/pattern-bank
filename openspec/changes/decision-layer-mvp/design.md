# Design: Decision-Layer MVP (Agent-Agnostic Pattern Judgment)

> Change: `decision-layer-mvp` · Phase: `sdd-design` · Store: openspec
> Greenfield · TS/Node · MCP stdio (PRIMARY) · CLI (STRETCH) · SQLite + local embeddings · vitest · `strict_tdd=false`

## Technical Approach

Pure hexagonal core exposing one application service `decide(query, mode)`. Both MCP tools
(`recommend_pattern`, `detect_antipattern`) and the stretch CLI are thin adapters that call
the SAME `decide()` (REQ-CORE-2, REQ-ANTI-3). The core depends only on two port interfaces —
`EmbeddingPort` and `CaseStorePort` (REQ-CORE-3) — injected from a composition root; the core
imports zero delivery-channel or driver packages (REQ-CORE-1, Agnosticism). Retrieval is
brute-force in-memory cosine over 8-12 rows (REQ-CORE-4). `mode='antipattern'` pre-filters the
candidate set to `anti_pattern_flag=true` cases before the identical cosine ranking. UC-7 and
UC-8 add zero engine code — they are input variants of the existing `decide()` call.

## Module / File Layout

```
patterns-bank/
├── src/
│   ├── core/
│   │   ├── decide.ts             # decide(query, mode) service — pure, the only entry
│   │   ├── cosine.ts             # dot/normalized cosine over Float32Array
│   │   ├── shape.ts              # DecisionResult builders (recommend | antipattern | no-match)
│   │   └── types.ts              # DecisionMode, DecisionResult union, DecisionCase, DecideDeps
│   ├── ports/
│   │   ├── embedding.port.ts     # EmbeddingPort interface
│   │   └── case-store.port.ts    # CaseStorePort interface
│   ├── adapters/
│   │   ├── embedding/
│   │   │   ├── minilm.embedding.ts    # transformers.js / ONNX all-MiniLM-L6-v2
│   │   │   └── keyword.embedding.ts   # deterministic keyword-overlap fallback stub
│   │   ├── case-store/
│   │   │   └── sqlite.case-store.ts   # better-sqlite3 load + embedding cache
│   │   ├── mcp/
│   │   │   ├── server.ts         # stdio server + tool registration
│   │   │   └── schemas.ts        # input/output JSON schemas + description strings
│   │   └── cli/
│   │       └── main.ts           # (STRETCH) argv → decide() → stdout
│   ├── cases/
│   │   ├── cases.data.ts         # 8-12 authored DecisionCase records
│   │   └── seed.ts               # create schema + insert cases + (re)compute embeddings
│   └── composition/
│       └── build.ts              # wires ports+adapters, returns { decide }
├── test/core/
│   ├── decide.test.ts           # confident recommend, antipattern bias, no-match
│   └── cosine.test.ts           # numeric correctness
```

## Port Interfaces (REQ-CORE-3)

```ts
// ports/embedding.port.ts
export interface EmbeddingPort {
  readonly id: string;          // e.g. "minilm-L6-v2" | "keyword-stub" — tags the cache
  readonly dim: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// ports/case-store.port.ts
export interface CaseStorePort {
  loadCases(): Promise<DecisionCase[]>;                 // records only
  getCachedEmbeddings(embedderId: string): Promise<Float32Array[] | null>;
  saveEmbeddings(embedderId: string, vectors: Float32Array[]): Promise<void>;
}
```

## Core Service Contract (REQ-CORE-2/5, REQ-REC-1, REQ-ANTI-2)

```ts
export type DecisionMode = 'recommend' | 'antipattern';

export interface DecideDeps {           // injected by composition root
  embedding: EmbeddingPort;
  cases: { record: DecisionCase; vector: Float32Array }[];  // preloaded in memory
  threshold?: number;                    // default 0.45
}

export type DecisionResult =
  | { kind: 'recommendation'; recommended_pattern: string; why: string;
      rejected_alternative: string; why_not: string; score: number;
      example_snippet: string; case_id: string; }
  | { kind: 'antipattern'; flagged: string; why_misuse: string;
      simpler_alternative: string; score: number; example_snippet: string; case_id: string; }
  | { kind: 'no_match'; mode: DecisionMode; best_score: number; threshold: number;
      message: string; };   // explicit, non-error, never fabricated (REQ-CORE-5)

export async function decide(
  query: string, mode: DecisionMode, deps: DecideDeps
): Promise<DecisionResult>;
```

`decide()` is channel-agnostic: adapters FORMAT this DTO, never reshape retrieval logic
(REQ-MCP-3, REQ-CLI-1). `recommendation` maps from a case's `recommended_pattern/why_not`;
`antipattern` maps the same matched case's fields to misuse framing.

## Similarity Threshold (resolves the spec's open question)

**Default cosine threshold = `0.45`**, config-tunable via `PB_SIM_THRESHOLD` env (read only at
the composition root, never in the core). Reasoning: all-MiniLM-L6-v2 emits L2-normalized
384-dim vectors; for this model, semantically related short texts typically score ~0.4-0.65 and
unrelated pairs ~0.1-0.25. `0.45` sits in the separating band — high enough to reject vague
queries into the honest UC-4 no-match path, low enough that a genuinely on-topic query clears it
against a sparse 12-case store. Calibrate empirically during the day-1 embedding spike using the
scripted demo scenarios; the keyword-stub fallback uses its own threshold (`0.20`) since overlap
scores occupy a lower range.

## detect_antipattern Biasing (REQ-ANTI-1/2/3)

**Recommendation: hard candidate pre-filter, not a score boost.** In `mode='antipattern'`,
`decide()` restricts the candidate set to cases where `anti_pattern_flag === true` BEFORE running
the identical cosine ranking, then applies the same threshold. Same retrieval algorithm, same
`decide()` body — the only delta is a candidate predicate + the shaping branch (satisfies
REQ-CORE-2 / REQ-ANTI-3). Chosen over a soft score boost because a boost can surface a
non-flagged recommend-case as an "antipattern", muddying semantics and risking a fabricated
misuse framing; a hard filter guarantees any `antipattern` result is grounded in a real
anti-pattern case, and cleanly yields UC-4 no-match when none match (REQ-ANTI-4). It is pure
retrieval+reasoning — no AST, no linter (REQ-ANTI-1).

## Embedding Fallback Design (UC-6, REQ-CORE-3)

`keyword.embedding.ts` implements the SAME `EmbeddingPort` interface as MiniLM, so core and
adapters never change when swapped (Rollback Plan). The stub tokenizes text (lowercase, split on
non-word, drop stopwords) into a fixed hashed bag-of-words vector (deterministic, offline, no
model). Because both cases and queries are embedded through the ACTIVE port, query and case
vectors always share one space. Swap is a one-line composition-root choice
(`PB_EMBEDDER=keyword`) or automatic on MiniLM load failure.

## Case Storage & Seed/Load Flow (REQ-CORE-6/7, UC-6)

SQLite via `better-sqlite3`. Table `cases(id TEXT PK, context TEXT, recommended_pattern TEXT,
rejected_alternative TEXT, why_not TEXT, anti_pattern_flag INTEGER, example_snippet TEXT, tags
TEXT)` (tags as JSON string). Table `embeddings(case_id TEXT, embedder_id TEXT, dim INTEGER, vec
BLOB, PRIMARY KEY(case_id, embedder_id))` storing Float32Array bytes.

Flow: `seed.ts` creates schema and inserts the authored cases (rejecting any record missing a
required field — REQ-CORE-6). Embeddings are computed **at startup, cached in SQLite** keyed by
`embedder_id`: on boot the composition root loads cases, then `getCachedEmbeddings(port.id)`; on
cache miss (first run, or after an embedder swap) it calls `embedBatch()` over all case
`context` fields and `saveEmbeddings()`. This makes the MiniLM↔keyword swap correct-by-
construction (no stale-dimension bug) while keeping warm restarts instant. All in-memory
thereafter (REQ-CORE-4).

## MCP Adapter Design (REQ-MCP-1/2/3)

`server.ts` uses `@modelcontextprotocol/sdk` `StdioServerTransport`, registers two tools, and in
each handler does ONLY: parse `{query}` → `await decide(query, mode, deps)` → serialize the
`DecisionResult` to `content: [{ type: 'text', text }]` (a compact human/agent-readable
rendering; no-match returned as a normal result, not an error — REQ-REC-3/REQ-ANTI-4). No
retrieval/ranking/shaping in the adapter (REQ-MCP-3). `get_pattern` is NOT registered (REQ-CLI-3).

Both tools share one input schema:
```json
{ "type": "object",
  "properties": { "query": { "type": "string",
    "description": "A problem description, requirement, bug description, or code snippet." } },
  "required": ["query"] }
```

**Tool descriptions (first-class artifact — REQ-MCP-2):**

`recommend_pattern`:
> "Recommend the design/architecture pattern that best fits a described problem, requirement, or
> code snippet — AND explicitly name the obvious-but-wrong alternative and why it fails here. Call
> this when you are choosing HOW to structure code (e.g. 'how should I handle these payment
> methods', 'refactor this growing if/else', a requirement before code exists, or a snippet you're
> unsure about). Returns a curated judgment (pattern + why + why-not) grounded in a human-authored
> decision case, or an explicit 'no confident match' so you can fall back to your own reasoning.
> This is judgment, not a definition lookup."

`detect_antipattern`:
> "Check whether a code snippet or design is OVER-engineered or misapplies a pattern, and get a
> simpler alternative. Call this when code feels too abstract for its job (e.g. a Singleton where
> DI would do, a Strategy for two static branches, premature microservices, a Factory wrapping a
> plain constructor) or when a recurring bug smells structural. Returns the flagged misuse, why
> it's wrong in this context, and the simpler thing to do instead — grounded in a curated
> anti-pattern case, or an explicit 'no confident match'. It is retrieval-based judgment, NOT a
> static analyzer or linter."

## CLI Adapter (STRETCH) Shape (REQ-CLI-1/2)

`cli/main.ts`: `argv` → `{ mode, query }` (e.g. `patterns-bank recommend "<text>"` /
`patterns-bank antipattern "<text>"`) → build composition root → `await decide(query, mode)` →
print a text rendering of the `DecisionResult` to stdout, exit 0 (no-match is still exit 0).
No retrieval logic; entirely deletable without touching core/MCP (REQ-CLI-2).

## Dependencies

| Package | Use | Risk |
|---------|-----|------|
| `@modelcontextprotocol/sdk` | MCP stdio server | Stable; pin a known-good minor |
| `@xenova/transformers` | ONNX all-MiniLM-L6-v2 embeddings, offline | First-run model download (~90MB); cold-start latency — mitigated by day-1 spike + keyword fallback |
| `better-sqlite3` | Synchronous SQLite | Native build (node-gyp/prebuild); verify on demo machine day-1. Alt: `node:sqlite` (Node 22+) — avoids native build but newer/experimental |
| `vitest` | Tests | None |
| `typescript`, `tsx`/`tsup` | Build/run | None |

Runtime note: pin the Node version (target ≥20). If `better-sqlite3` prebuilds fail, fall back to
`node:sqlite`; the `CaseStorePort` interface isolates that swap from core.

## Testing Strategy (`strict_tdd=false`)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `cosine.ts` numeric correctness | Known vectors → expected similarity |
| Unit | `decide()` confident recommend | Fake `EmbeddingPort` (deterministic vectors) + in-memory cases → assert `kind:'recommendation'` fields |
| Unit | `decide()` antipattern bias | Assert only `anti_pattern_flag` cases can be returned in `antipattern` mode |
| Unit | `decide()` no-match (UC-4) | Query below threshold → `kind:'no_match'`, no fabricated fields |

Tests inject fakes through the ports — no MiniLM/SQLite/MCP needed to test the core. Adapters are
verified manually via a real MCP client during the demo (in scope for a 3-day build).

## Threat Matrix

N/A — no routing, shell execution, subprocess spawning, VCS/PR automation, or executable-file
classification. The MCP server reads/writes its own stdio (framework-managed, not a shell), the
CLI only reads argv and writes stdout, and `detect_antipattern` explicitly performs NO code
execution or static analysis (REQ-ANTI-1). The only external I/O is a one-time model download at
setup (UC-6), guarded by the offline keyword fallback.

## Key Tradeoffs & Alternatives Rejected

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Antipattern biasing | Hard pre-filter on flag | Score boost | Boost can mislabel a recommend-case as an antipattern; filter guarantees grounded results |
| Embedding cache | Startup-compute, SQLite cache keyed by embedder id | Bake MiniLM vectors at seed only | Seed-baked vectors break on fallback swap (dimension/space mismatch); keyed cache is swap-safe |
| Vector search | Brute-force in-memory cosine | sqlite-vec / ANN index | 12 rows — an index is pure complexity with no payoff (REQ-CORE-4) |
| Result contract | One discriminated-union DTO from core | Per-adapter result shapes | Keeps logic in core, adapters format-only (REQ-MCP-3) |
| SQLite driver | `better-sqlite3` (fallback `node:sqlite`) | ORM / async driver | Sync + tiny footprint; port isolates the swap |

## Migration / Rollout

No migration required (greenfield). Rollback = delete `src/` + revert the change folder. Adapters
are isolable; dropping the CLI never touches core or MCP; embedding-adapter failure swaps to the
keyword stub with zero core/adapter change.

## Open Questions

- [ ] Final `0.45` threshold value pending day-1 empirical calibration against demo scenarios (design default set; tunable, non-blocking).
