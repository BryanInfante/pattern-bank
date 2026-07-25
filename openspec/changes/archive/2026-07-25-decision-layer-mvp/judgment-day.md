# Judgment Day Ledger: decision-layer-mvp

> Dual blind adversarial review · two independent judges · frozen ledger below.
> Target: implemented code under `src/`, `demo/`, `test/` (round 1, pre-fix state).

## Confirmed by BOTH judges (corroborated → fix)

- **JD-1 (HIGH) — dimension-mismatch throws uncaught, breaking graceful no_match.**
  `SqliteCaseStore.getCachedEmbeddings()` (sqlite.case-store.ts:117-139) reuses cached
  vectors on `case_id+embedder_id` presence alone, never checking `dim` against the active
  embedder. A dim change under the same `embedder_id`, or a partial `saveEmbeddings` write
  (non-transactional), yields wrong-length vectors → `cosineSimilarity` throws → the
  exception escapes `decide()` uncaught → violates REQ-CORE-5/REQ-REC-3/REQ-ANTI-4 (in MCP a
  protocol error; in CLI exit 1, contradicting "no_match is exit 0").

- **JD-2 (MEDIUM) — no lifecycle/`close()` on the store; real handle leak.**
  `CaseStorePort` / `SqliteCaseStore` never release the `DatabaseSync` handle. Root cause of
  the Windows EBUSY on temp cleanup; a genuine leak for any caller building multiple
  composition roots in one process.

## Single judge, verified TRUE by orchestrator (fix approved)

- **JD-3 (HIGH, practical) — `npm run seed` crashes on a fresh clone.**
  `seed.ts:97` opens `data/patterns-bank.db` without `mkdir`-ing `data/` (unlike `build.ts`).
  `node:sqlite` does not create missing parent dirs → the documented step-1 bootstrap fails.

- **JD-4 (MEDIUM) — prototype-pollution bypass of the unknown-tool guard.**
  `server.ts:95` indexes the plain object `TOOL_MODE` with the client-controlled tool name;
  `TOOL_MODE['toString']` (etc.) resolves via `Object.prototype` to a truthy value, bypassing
  `if (!mode)` and returning a recommendation for an unregistered tool name.

## Recorded, NOT fixed this round (follow-up)

- **JD-5 (HIGH, dev workflow)** — editing a case's `context` and re-seeding does not invalidate
  the cached embedding (stale vector reused). *(single judge; deferred)*
- **INFO** — `Float32Array` byteOffset 4-byte-alignment assumption (both judges, WARNING/LOW).
- **INFO** — `isMainModule()` fragile under Windows drive-letter casing (single judge;
  empirically worked in all test invocations).
- **INFO** — orphan rows on case delete/rename; `JSON.parse(tags)` without try/catch;
  `embed()` called before the empty-candidates short-circuit (perf).

## Round 1 disposition

- Confirmed/approved for bounded fix: **JD-1, JD-2, JD-3, JD-4** (user-approved scope).
- Fix actor applied all four (surgical, no channel imports added to `src/core`).

## Round 1 re-judgment (scoped, fix delta only)

Both blind judges reviewed the fix delta independently:

| Finding | Judge A | Judge B |
|---------|---------|---------|
| JD-1 (dim-mismatch → uncaught throw) | RESOLVED | RESOLVED |
| JD-2 (no close(), handle leak) | RESOLVED | RESOLVED |
| JD-3 (seed mkdir on fresh clone) | RESOLVED | RESOLVED |
| JD-4 (prototype-pollution tool guard) | RESOLVED | RESOLVED |

**New defects introduced by the fix: none** (both judges, confirmed).

Both judges independently flagged one **INFO** item (pre-existing, NOT worsened, not severe):
`build()` has no try/finally, so if it throws mid-init (e.g. `loadCases()` on malformed
data) the just-opened SQLite handle isn't closed. Existed before the fix (no `close()` then).
Recorded as follow-up; does not reopen the review.

## Independent final verification (orchestrator)

- `npx tsc --noEmit` → clean
- `npx vitest run test/core` → 12/12 passed
- `npx tsx test/mcp/smoke.ts` → ALL CHECKS PASSED (incl. new JD-1/JD-2/JD-4 assertions)

## Terminal state

**JUDGMENT: APPROVED ✅** — all four confirmed findings resolved, no new severe defects,
independent verification green. Lineage terminal; not reopened.

### Follow-ups (not blocking, tracked)
- JD-5: re-seeding an edited case doesn't invalidate its cached embedding.
- INFO: `build()` error-path handle leak; `Float32Array` byteOffset alignment assumption;
  `isMainModule()` Windows-casing fragility; orphan rows on case delete/rename;
  `JSON.parse(tags)` without try/catch.
