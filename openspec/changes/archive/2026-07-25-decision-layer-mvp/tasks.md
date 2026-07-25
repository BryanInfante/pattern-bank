# Tasks: Decision-Layer MVP (Agent-Agnostic Pattern Judgment)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1100 (greenfield: core+ports+adapters+cases+tests+config) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Day 1) -> PR 2 (Day 2) -> PR 3 (Day 3) |
| Delivery strategy | auto-forecast (treated as auto-chain: proceed, no blocking question) |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Core `decide()` + cosine + no-match + ports + embedding adapters + SQLite seed + 8 cases (T1-T14) | PR 1 | `vitest run test/core` | N/A — core has no I/O; fakes only | Delete `src/core`,`src/ports`,`src/adapters/embedding`,`src/adapters/case-store`,`src/cases` |
| 2 | Composition root + MCP adapter (schemas, descriptions, handlers) + optional cases 9-12 (T15-T19) | PR 2 | `vitest run test/core` + manual tool-list check | Real MCP client (Claude Code) calling both tools | Delete `src/adapters/mcp`,`src/composition`; MCP is additive over PR 1 |
| 3 | Scripted demo scenarios, rehearsal, CLI stretch, polish (T20-T24) | PR 3 | N/A (demo/docs) | Live scripted demo run (2-3 scenarios) | Delete `src/adapters/cli`, demo script; no core/MCP impact |

## Day 1: Core + Ports (PR 1)

- [x] T1 Scaffold `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/` dirs — REQ-CORE-1
- [x] T2 `src/core/types.ts`: `DecisionMode`, `DecisionCase`, `DecideDeps`, `DecisionResult` — REQ-CORE-3, REQ-CORE-6
- [x] T3 `src/ports/embedding.port.ts` + `src/ports/case-store.port.ts` — REQ-CORE-3
- [x] T4 `src/core/cosine.ts`: normalized cosine over `Float32Array` — REQ-CORE-4
- [x] T5 `test/core/cosine.test.ts`: known-vector correctness — REQ-CORE-4
- [x] T6 `src/core/shape.ts`: recommendation/antipattern/no_match builders — REQ-REC-1, REQ-ANTI-2, REQ-CORE-5
- [x] T7 `src/core/decide.ts`: brute-force cosine, `mode='antipattern'` hard pre-filter, threshold no-match, single shared retrieval path — REQ-CORE-2, REQ-CORE-4, REQ-CORE-5, REQ-ANTI-3
- [x] T8 `test/core/decide.test.ts` with fake `EmbeddingPort`: confident recommend, antipattern-flag-only bias, no-match (no fabricated fields) — REQ-CORE-5, REQ-REC-1, REQ-ANTI-2
- [ ] T9 **[SPIKE, day-1 required, HUMAN TASK]** Time-box MiniLM cold-start/download spike; calibrate `0.45` threshold against real demo-scenario scores — UC-6, resolves Open Question. NOT executed by sdd-apply: this is an empirical spike on the user's machine (model download + score calibration), not a scriptable code task. Code defaults `DecideDeps.threshold` to `0.45` (see `src/core/decide.ts` `DEFAULT_THRESHOLD`), overridable per-call — ready for the human to calibrate against real scores.
- [x] T10 `src/adapters/embedding/keyword.embedding.ts`: deterministic bag-of-words fallback (GUARANTEED path, build first) — UC-6, REQ-CORE-3
- [x] T11 `src/adapters/embedding/minilm.embedding.ts`: transformers.js ONNX MiniLM (build after T10 succeeds) — UC-6, REQ-CORE-3
- [x] T12 `src/adapters/case-store/sqlite.case-store.ts`: schema, `loadCases`, cached embeddings by `embedder_id` — REQ-CORE-6, REQ-CORE-7
- [x] T13 `src/cases/cases.data.ts`: author first 8 original decision cases (misuse pairs) — REQ-CORE-6, REQ-CORE-7
- [x] T14 `src/cases/seed.ts`: create schema, insert cases, reject records missing required fields — REQ-CORE-6

## Day 2: MCP Adapter (PR 2)

- [x] T15 `src/composition/build.ts`: wire ports + adapters, return `{ decide }` — REQ-CORE-1, REQ-CORE-3
- [x] T16 `src/adapters/mcp/schemas.ts`: shared input schema + full tool description strings (first-class artifact) — REQ-MCP-2
- [x] T17 `src/adapters/mcp/server.ts`: stdio server, register `recommend_pattern`/`detect_antipattern`, handlers ONLY parse+call `decide()`+serialize — REQ-MCP-1, REQ-MCP-3
- [x] T18 **[STRETCH, cuttable]** Author 2-4 more cases (total up to 12) — REQ-CORE-7 (added 3, total 11)
- [x] T19 Verify: programmatic end-to-end MCP smoke test (`test/mcp/smoke.ts`, `npx tsx test/mcp/smoke.ts`) via real `Client`/`Server` over `InMemoryTransport`, real composition root (real `node:sqlite` + keyword embedder) — REQ-MCP-1. (Manual verification via a real external MCP client, e.g. Claude Code, is still recommended before/at demo time but is outside this scripted apply pass.)

## Day 3: Polish + Demo (PR 3)

- [x] T20 Author 2-3 scripted plain-LLM-vs-tool demo scenarios + a scripted fallback script for live-demo risk — Proposal demo thesis, UC-1..UC-4 (`demo/scenarios.ts`, `npm run demo`; 1 recommend, 1 antipattern, 1 graceful no-match, real `decide()` output)
- [x] T21 **[CODE-SIDE DONE]** `demo/scenarios.ts` is deterministic/re-runnable (temp SQLite DB, defaults to `PB_EMBEDDER=keyword`, verified re-run twice with stable scores) with a "Rehearsal notes" comment block reminding to re-check `0.45` on the final embedder. **HUMAN TASK REMAINS**: live rehearsal + empirical threshold re-check on the actual demo machine/embedder is NOT executed by sdd-apply — UC-1..UC-4
- [x] T22 **[STRETCH — built]** `src/adapters/cli/main.ts`: argv -> `{mode, query}` -> composition root -> `decide()` -> stdout, exit 0 (no_match included); `npm run cli` script + `bin` entry added — REQ-CLI-1, REQ-CLI-2
- [x] T23 **[STRETCH — built]** `README.md`: differentiation intent, honest MVP scope, quickstart, MCP client config snippet, hexagonal architecture note, Non-goals/roadmap section
- [x] T24 Confirmed `get_pattern` is NOT registered on any adapter (MCP `TOOLS` array: only `recommend_pattern`/`detect_antipattern`; CLI `parseArgv`: only `recommend`/`antipattern` modes; `test/mcp/smoke.ts` asserts its absence) — REQ-CLI-3

## Cut Order (if time runs out)

CLI adapter (T22) -> cases beyond ~8 (T18) -> extra polish (T23). `get_pattern` (T24) is a verification-only task, never build it this cycle.
