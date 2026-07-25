# Verify Report: decision-layer-mvp

> Phase: `sdd-verify` · Store: openspec
> Verdict: **PASS WITH WARNINGS** (0 CRITICAL, 3 WARNING, 1 SUGGESTION from the spec-conformance lens)

## Requirement Coverage (17 Must, all verified with runtime evidence)

All Must requirements PASS: REQ-CORE-1..7, REQ-REC-1..3, REQ-ANTI-1..4, REQ-MCP-1..3.
REQ-CLI-1 delivered (Could); REQ-CLI-3 (`get_pattern` absent) confirmed.

Highlights:
- **REQ-CORE-1 (agnosticism)** — `grep` of `src/core/` for MCP SDK / `node:sqlite` /
  `better-sqlite3` / `@xenova` / `process.argv` / `process.env` → zero matches. Gate holds.
- **REQ-CORE-2 / REQ-ANTI-3 (shared path)** — one `decide()`; antipattern mode differs only
  by a hard `anti_pattern_flag` candidate pre-filter + shaping branch.
- **REQ-CORE-5 (no fabrication)** — `buildNoMatch()` returns only
  `{kind,mode,best_score,threshold,message}`; asserted by test and observed live.
- **REQ-CORE-6** — rejection logic exists but **no test exercises the rejection path**
  (WARNING 1).

## Traceability spot-check
UC-1..UC-4 all observed live in demo + MCP smoke test. UC-7/UC-8 confirmed to add zero engine
code (no framing-specific branch in `decide.ts`/`shape.ts`; `query` treated as opaque text).

## Command outputs (verbatim)
- `npx vitest run test/core` → 2 files, **12 tests passed**.
- `npx tsc --noEmit` → clean, exit 0.
- `npx tsx demo/scenarios.ts` → 3/3 scenarios (Strategy 0.801, Singleton flagged 0.620,
  off-topic no_match 0.063 < 0.2).
- `npx tsx test/mcp/smoke.ts` → ALL CHECKS PASSED.
- CLI → works once the DB is seeded (fresh/empty DB returns no_match — see WARNING 3).

## Deviations assessment
- **`node:sqlite` instead of `better-sqlite3`** — within design.md's own documented fallback
  provision (Node 24, avoids native build); isolated behind `CaseStorePort`. **Accepted.**
- **`smoke.ts` / `demo/scenarios.ts` as `tsx` scripts, not vitest** — vitest cannot resolve the
  experimental `node:sqlite` builtin; `vitest.config.ts` deliberately excludes them. **Accepted**,
  but creates an operational coverage gap (WARNING 2).

## Warnings & suggestions
- **WARNING 1** — REQ-CORE-6 rejection path untested at runtime.
- **WARNING 2** — MCP/demo e2e checks not wired into CI or `npm test`; only run on manual `tsx`.
- **WARNING 3** — a fresh/unseeded DB degrades indistinguishably from a genuine no_match.
- **SUGGESTION 1** — add a test that sends a real multi-line code snippet as `query` (UC-2).

## Next
No CRITICAL spec blockers. Warnings are hardening/process items. See `judgment-day.md` for the
adversarial dual-review ledger, which surfaced additional edge-case defects addressed in a
bounded fix round.
