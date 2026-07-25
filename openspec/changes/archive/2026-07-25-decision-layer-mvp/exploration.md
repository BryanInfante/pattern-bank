# Exploration: decision-layer-mvp

> Pattern-decision MCP server for a 3-day hackathon.
> Phase: `sdd-explore` · Change: `decision-layer-mvp` · Store: openspec

## Current State

`patterns-bank` is greenfield — only `openspec/config.yaml` (declares TS/Node, MCP
over stdio, SQLite + local embeddings, vitest, `strict_tdd=false`, 3-day hackathon
constraint) and empty `openspec/specs/`, `openspec/changes/archive/` exist. No source
code yet, so no `.codegraph/` index is warranted.

## Problem Statement

LLMs already recall GoF / architecture pattern *definitions* fluently — that is not the
gap. The gap is **judgment**:

- picking the right pattern for a specific context,
- rejecting the "obvious but wrong" alternative,
- recognizing when applying a pattern is itself over-engineering.

This is a reasoning/context problem, not a retrieval problem, so widening the catalog
alone does not address it.

## Why Existing Solutions Fall Short

1. **apolosan/design_patterns_mcp** (705+ patterns, hybrid semantic+keyword+graph
   search) proves the MCP + SQLite + embeddings plumbing is viable — but its low
   traction (~30 stars, single maintainer) is evidence that a flat catalog alone does
   not create enough value over asking the LLM directly.
2. **refactoring.guru** is the content reference but is **copyrighted** — cannot be
   scraped/republished. All case content in this project must be original prose.
3. **Plain LLM** already knows definitions cold; a tool that just returns definitions is
   redundant. The exploitable gap is judgment under ambiguity.
4. **Context7's "freshness" value prop does not transfer** — GoF patterns have been
   stable ~30 years. "Curated judgment," not "up-to-date retrieval," is the
   differentiation axis.

## Affected Areas (greenfield — to be created)

- `openspec/changes/decision-layer-mvp/` — this change's artifacts
- (future) MCP server entry point, SQLite schema for decision cases, embedding pipeline,
  and the candidate tool handlers
- `openspec/config.yaml` — already encodes constraints (3-day timeline, vitest,
  `strict_tdd=false`, 400-line review budget)

## Approaches Considered

### 1. Decision-layer MVP — curated decision cases + embeddings + `recommend_pattern` + `detect_antipattern` (`get_pattern` cut/stubbed) — RECOMMENDED
- **Pros:** targets the validated differentiator; small content set (10-12 cases)
  hand-authorable in ~1 day; sharp before/after demo contrast; no copyright risk.
- **Cons:** thin retrieval coverage risks an on-stage "no good match";
  `detect_antipattern` without real static analysis is inherently heuristic.
- **Effort:** Medium

### 2. Catalog-first (à la apolosan), decision-flavored copy
- **Pros:** easier broad coverage, lower "no match" risk, simpler data model.
- **Cons:** reproduces exactly the differentiation apolosan already has and that low
  adoption evidence says does not work; shallow "why not" bullets won't survive an
  adversarial demo question.
- **Effort:** Medium-High

### 3. `recommend_pattern` only, cut everything else
- **Pros:** lowest scope, maximizes time for retrieval quality and case-writing.
- **Cons:** loses the strongest hackathon narrative device (the anti-pattern "wow"
  moment).
- **Effort:** Low

## Recommendation

**Approach 1**, with a critical execution correction: `detect_antipattern` must **not**
be conceived as a static-analysis engine — there is no time to build one in 3 days. It
reuses the exact same retrieval mechanism as `recommend_pattern`, pointed at
anti-pattern-flagged decision cases, plus LLM reasoning over the match. Pre-select 5-8
classic misuse pairs so demo retrieval quality is guaranteed rather than left to live
chance:

- Strategy vs. if/else chain
- Singleton vs. dependency injection
- Observer vs. plain callback
- Factory vs. direct constructor
- Decorator vs. inheritance

## Feasibility Within 3 Days

- **Day 1** — SQLite schema + embedding pipeline (transformers.js / ONNX
  `all-MiniLM-L6-v2`; brute-force in-memory cosine scan over 10-12 rows is sufficient —
  no vector index needed) + author first 5-6 cases. Time-box the embedding spike to 2-3h
  with brute-force cosine as the guaranteed fallback if `sqlite-vec` proves fiddly.
- **Day 2** — MCP stdio server skeleton, `recommend_pattern` wired to retrieval,
  remaining cases authored, `detect_antipattern` reusing the same retrieval path.
- **Day 3** — polish `detect_antipattern`, cut/stub `get_pattern` if behind, rehearse
  the plain-Claude-vs-tool demo contrast on pre-selected scenarios, minimal vitest
  coverage of the retrieval function only.
- **First things to cut** — `get_pattern` entirely; case count beyond ~8 if authoring
  quality is at risk; any vector-index tooling beyond brute-force cosine.

## Risks

- **Embeddings for local/offline use** — `@xenova/transformers` (or
  `@huggingface/transformers`) + `all-MiniLM-L6-v2` via ONNX is the standard no-API-key
  path; model cold-start/download time on the hackathon machine is unverified and must be
  tested day 1, not assumed.
- **MCP tool description quality** — vague `description` fields risk the calling LLM
  never invoking the tools, undermining the entire demo contrast; needs explicit design
  attention early.
- **Retrieval quality with ~12 cases** — sparse coverage means many plausible live
  queries won't retrieve well; mitigated only by rehearsed scenarios, not solved.
- **`detect_antipattern` scope creep** — must be framed as retrieval+reasoning, not
  "build a linter," or it will consume the remaining budget.
- **Copyright** — refactoring.guru may inspire which pairs are classic confusion points,
  never be copied as case text.
- **Solo / 3-day cascade risk** — any slip in day-1 embedding setup directly eats into
  case-authoring time, the actual differentiator.

## Open Questions for `sdd-propose`

1. Lock the final 8-12 decision-case pairs so authoring isn't open-ended.
2. Is `get_pattern` in MVP scope at all, or explicitly deferred?
3. Decision-case record schema (context, recommended pattern, rejected alternative,
   why-not, anti-pattern flag, example snippet)?
4. Embedding storage: brute-force cosine scan vs. `sqlite-vec` extension?
5. Which specific before/after scenarios get rehearsed for the demo, and is there a
   scripted fallback?
6. Given `strict_tdd=false`, is any test coverage required before demo or is verification
   entirely manual?

## Ready for Proposal

Yes — scope is bounded enough to proceed to `sdd-propose`. The proposal should lock the
case list, decision-case schema, embedding/storage choice, and confirm `get_pattern` is
out of MVP scope so day-3 time isn't spent negotiating scope under pressure.
