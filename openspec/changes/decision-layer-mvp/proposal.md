# Proposal: Decision-Layer MVP (Agent-Agnostic Pattern Judgment)

> Change: `decision-layer-mvp` · Phase: `sdd-propose` · Store: openspec
> 3-day hackathon, solo dev, TS/Node, `strict_tdd=false`, review budget 400 lines.

## Intent

LLMs already recall GoF/architecture pattern *definitions* fluently. The unmet gap is
**judgment**: picking the right pattern for a context, rejecting the obvious-but-wrong
alternative, and recognizing when applying a pattern is itself over-engineering. A flat
catalog (e.g. apolosan's 705-pattern MCP, ~30 stars) does not beat asking the LLM
directly. Differentiation axis is **curated judgment**, not freshness or coverage. Demo
thesis: show the CONTRAST — plain LLM vs. this tool, which adds the *why-not* and the
anti-pattern warning.

## Scope

### In Scope
- **Hexagonal core decision engine** (pure): retrieval over curated decision cases +
  result shaping. Zero dependency on any delivery channel.
- **Two value tools** (both route through the SAME core retrieval path):
  - `recommend_pattern` — problem/snippet → recommended pattern + WHY + WHY-NOT the
    obvious alternative.
  - `detect_antipattern` — snippet → flags over-engineering/misapplied patterns + simpler
    suggestion. Retrieval pointed at anti-pattern-flagged cases; **not** a static analyzer.
- **MCP adapter (PRIMARY, MVP)** — stdio server exposing both tools. Covers Claude Code,
  Cursor, Windsurf, Cline, Zed, etc.
- **CLI adapter (STRETCH, day-3-if-time)** — `patterns-bank` command any agent can shell
  out to ("gentle-ai style" universal fallback). Documented port, explicitly deferrable.
- **8-12 original, human-authored decision cases** (no refactoring.guru copy).
- **Embedding/storage**: transformers.js/ONNX `all-MiniLM-L6-v2` (offline, no API key),
  brute-force in-memory cosine over ~12 rows. No vector index / no sqlite-vec.
- Minimal vitest on the core retrieval function only.

### Out of Scope / Non-Goals
- No static-analysis / linter engine (`detect_antipattern` is retrieval+reasoning).
- No full 700-pattern catalog.
- `get_pattern` — deferred (trivial stretch at most).
- No web UI, no hosted service, no persistence beyond local SQLite.

## Capabilities

### New Capabilities
- `decision-core`: pure retrieval+shaping engine over decision cases; delivery-agnostic.
- `pattern-recommendation`: `recommend_pattern` tool behavior (pattern + why + why-not).
- `antipattern-detection`: `detect_antipattern` tool behavior (flag + simpler suggestion).
- `mcp-adapter`: stdio MCP server exposing both tools (PRIMARY).
- `cli-adapter`: shell-invokable `patterns-bank` command (STRETCH, deferrable).

### Modified Capabilities
- None (greenfield).

## Approach

**Ports & adapters.** A pure core (no I/O, no protocol) exposes an application service
`decide(query, mode)` where `mode ∈ {recommend, antipattern}`. Two ports: an
**embedding port** (interface; ONNX/MiniLM adapter behind it) and a **case-store port**
(interface; SQLite + in-memory cosine adapter). Delivery adapters (MCP, then CLI) are
thin translators that call the same service. The tool-description text for MCP is
treated as a first-class design artifact — vague descriptions mean the calling LLM never
invokes the tools. Coherence talking point: a design-pattern tool built with clean/
hexagonal architecture reinforces the product's own message.

**Pre-selected misuse pairs** (guarantee demo retrieval quality): Strategy vs if/else,
Singleton vs DI, Observer vs plain callback, Factory vs direct constructor, Decorator vs
inheritance, Repository vs direct DB access, premature microservices vs modular monolith.

### Decision-Case Record Schema
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Stable case identifier |
| `context` / `problem` | text | The situation being decided (embedded for retrieval) |
| `recommended_pattern` | string | The pattern to apply |
| `rejected_alternative` | string | The obvious-but-wrong option |
| `why_not` | text | Why the alternative fails in this context |
| `anti_pattern_flag` | bool | Marks over-engineering/misuse cases for `detect_antipattern` |
| `example_snippet` | text | Short illustrative code |
| `tags` | string[] | Coarse filtering / grouping |

## Affected Areas (all greenfield — to be created)

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/` | New | Pure decision engine (`decide`, result shaping, cosine ranking) |
| `src/core/cases/` | New | Decision-case store + 8-12 authored case records |
| `src/ports/embedding` | New | Embedding port interface + ONNX/MiniLM adapter |
| `src/ports/case-store` | New | Case-store port interface + SQLite/in-memory adapter |
| `src/adapters/mcp/` | New | MCP stdio server (PRIMARY) — tool schemas + handlers |
| `src/adapters/cli/` | New | `patterns-bank` CLI (STRETCH) over the same core |
| `test/core/` | New | Minimal vitest on retrieval/core only |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Two-adapter scope overrun in 3 days | High | MCP ships; CLI is a thin stretch over the same core, cut first |
| MiniLM cold-start/download unverified | Med | Time-box embedding spike day-1; brute-force cosine is the guaranteed fallback |
| Sparse retrieval (~12 cases) → live "no match" | Med | Rehearse 2-3 scripted scenarios with fallback; agnostic core, not solved |
| Vague MCP tool descriptions → LLM never calls tools | Med | Treat descriptions as first-class design artifact, drafted early |
| `detect_antipattern` scope creep into a linter | Med | Framed as retrieval+reasoning reusing the same path; enforced in spec |
| Copyright (refactoring.guru) | Low | Inspire pair selection only; all case text original |
| Solo 3-day cascade (day-1 slip eats authoring) | Med | Fallback-first sequencing; authoring is the differentiator, protected |

## 3-Day Delivery Outline (hexagonal split)

- **Day 1 — Core + ports.** Define `decide` service, embedding + case-store port
  interfaces, SQLite schema, ONNX/MiniLM adapter (time-boxed spike, cosine fallback).
  Author first 5-6 cases. Minimal vitest on retrieval.
- **Day 2 — MCP adapter.** stdio server skeleton, wire `recommend_pattern` and
  `detect_antipattern` to the core (same path, anti-pattern-flagged subset). Author
  remaining cases. Draft strong tool descriptions.
- **Day 3 — Polish + demo.** Refine `detect_antipattern` output; CLI stretch adapter
  only if time; rehearse plain-LLM-vs-tool contrast on scripted scenarios with fallback.
  Cut order: CLI → cases beyond ~8 → any vector tooling beyond cosine.

## Rollback Plan

Greenfield: no production dependents. Rollback = delete `src/` and revert the change
folder. Each adapter is isolable — dropping the CLI adapter never touches the core or MCP
path. If the embedding adapter fails on the demo machine, swap the embedding port to a
deterministic keyword-overlap stub without changing core or adapters.

## Dependencies

- `@xenova/transformers` (or `@huggingface/transformers`) + `all-MiniLM-L6-v2` ONNX model.
- SQLite (node driver), MCP SDK (stdio), vitest.

## Success Criteria

- [ ] Pure core `decide(query, mode)` runs with zero delivery-channel imports.
- [ ] MCP stdio server exposes both tools; a real agent (e.g. Claude Code) invokes them.
- [ ] `recommend_pattern` returns pattern + why + why-not; `detect_antipattern` flags a
      misuse + simpler suggestion — both via the same retrieval path.
- [ ] 8-12 original decision cases loaded and embedded offline (no API key).
- [ ] 2-3 scripted demo scenarios rehearsed showing plain-LLM-vs-tool contrast.
- [ ] Minimal vitest on the core retrieval function passes.
- [ ] (Stretch) CLI adapter invokes the same core via shell.
