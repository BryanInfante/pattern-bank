# patterns-bank

**An agent-agnostic pattern *decision* layer for LLMs — not a pattern catalog.**

LLMs already recall GoF/architecture pattern *definitions* fluently. Asking one "what is the
Strategy pattern?" is a solved problem, and a flat 700-pattern lookup MCP doesn't beat asking the
LLM directly. The unmet gap is **judgment**: picking the right pattern for a specific context,
explicitly rejecting the obvious-but-wrong alternative (and saying why), and recognizing when
applying a pattern is itself over-engineering. That's what this tool does — it never just defines
a pattern; every result is grounded in a curated, human-authored decision case and comes with a
`why` and, for recommendations, an explicit `why-not` for the rejected alternative.

Two tools, one shared decision core:

- **`recommend_pattern`** — problem/requirement/snippet → recommended pattern + why + why-not the
  obvious alternative.
- **`detect_antipattern`** — snippet/design → flags over-engineering or a misapplied pattern +
  a simpler alternative. This is retrieval + reasoning over curated anti-pattern cases, **not** a
  static analyzer or linter.

Both tools call the exact same `decide(query, mode)` core service — same retrieval, same ranking,
only the candidate subset and the result shaping differ.

## Honest MVP scope

This is a 3-day hackathon build. It intentionally does NOT try to be a full pattern reference:

- **8-12 original, human-authored decision cases** (curated misuse pairs like Strategy vs.
  if/else, Singleton vs. DI, premature microservices vs. modular monolith) — not hundreds of
  patterns, not copied from any catalog.
- **Brute-force in-memory cosine retrieval** over that small case set — no vector index, no
  `sqlite-vec`; unnecessary at this scale.
- **Offline embeddings** via `all-MiniLM-L6-v2` (transformers.js/ONNX), with a deterministic
  keyword-overlap fallback if the model can't load — no API key, ever.
- **No code execution, no AST parsing, no linting.** `detect_antipattern` is retrieval-based
  judgment grounded in a matched case, never static analysis.
- When nothing clears the confidence threshold, the tool says so explicitly (`no_match`) instead
  of inventing a pattern name or rationale it can't ground in a real case.

## Quickstart

```bash
npm install

# Seed the local SQLite case store (creates data/patterns-bank.db)
npm run seed

# Run the MCP server over stdio (the primary channel — for MCP clients)
npm run mcp

# Run the scripted "plain LLM vs. this tool" demo (offline, deterministic)
npm run demo

# Run the CLI adapter directly (the second, agnostic channel over the same core)
npm run cli -- recommend "how should I structure a checkout that supports many payment methods?"
npm run cli -- antipattern "class ConfigSingleton { static getInstance() { ... } }"
```

Requires Node.js ≥ 22 (`node:sqlite` is used by the case-store adapter). `npm run seed` and
`npm run mcp`/`npm run cli` use `tsx` to run the TypeScript sources directly — no build step
required for local use.

### Embedder selection

Defaults to the offline ONNX MiniLM embedder, downloading the model on first use. If that fails
to load (no network, blocked download, etc.) it automatically falls back to a deterministic
keyword-overlap stub — same interface, same `decide()`, degraded but functional retrieval. You can
force the fallback explicitly:

```bash
PB_EMBEDDER=keyword npm run mcp
```

`PB_SIM_THRESHOLD` overrides the similarity threshold used to decide a "confident" match (default
`0.45` for MiniLM, `0.20` for the keyword stub — the two embedders' score ranges are not
comparable).

## MCP client configuration

Add `patterns-bank` as a stdio MCP server. Example for Claude Code / Cursor-style config:

```json
{
  "mcpServers": {
    "patterns-bank": {
      "command": "npx",
      "args": ["tsx", "src/adapters/mcp/server.ts"],
      "cwd": "/absolute/path/to/patterns-bank"
    }
  }
}
```

Once connected, an agent should see two tools: `recommend_pattern` and `detect_antipattern`. Tool
descriptions are written as a first-class artifact (specific purpose, input expectations,
triggering intent) so a calling LLM reliably chooses to invoke them for relevant problems, rather
than silently ignoring generic stub descriptions.

## Hexagonal architecture

The decision engine is a pure hexagonal core with zero delivery-channel imports:

```
src/
├── core/           # decide(query, mode) — pure, only entry point (REQ-CORE-1/2)
├── ports/           # EmbeddingPort, CaseStorePort — the only things core depends on
├── adapters/
│   ├── embedding/    # MiniLM (ONNX) + keyword-overlap fallback
│   ├── case-store/   # SQLite (node:sqlite) case + embedding cache
│   ├── mcp/          # stdio MCP server — thin translation only, no retrieval logic
│   └── cli/          # patterns-bank CLI — thin translation only, no retrieval logic
├── cases/            # curated decision-case records + seed script
└── composition/      # the ONLY place adapters are wired to the core
```

`src/core` never imports the MCP SDK, a CLI framework, or a concrete embedding/database library —
only the two port interfaces. Both delivery adapters (MCP, CLI) parse their own I/O, call the same
`decide()`, and format the same `DecisionResult` DTO; neither contains retrieval, ranking, or
case-shaping logic. This is deliberately eating our own dogfood: a design-pattern judgment tool
built with clean/hexagonal architecture reinforces the product's own message, and it means either
adapter is entirely deletable without touching the core or the other adapter.

## Non-goals / roadmap

Explicitly out of scope for this cycle:

- **Design-aware recommendation** — reasoning over a project's *existing* architecture/design
  state to tailor advice. This is multi-input and stateful; it breaks the single-query `decide()`
  abstraction used throughout and is deferred to a future change.
- **Bug root-cause analysis** — a bug description can be used as a query (it recommends a
  structural fix), but the tool never diagnoses *why* the bug occurs.
- **`get_pattern` (lookup-by-name)** — deferred; not implemented on any adapter in this MVP.
- **Full pattern catalog** — the value is curated judgment on a small, deliberately-authored case
  set, not coverage of every GoF/architecture pattern.
- **Static analysis / linting** — `detect_antipattern` is retrieval + reasoning against curated
  cases, never AST parsing or lint rules.
- **Web UI / hosted service** — local-only, stdio MCP + CLI, SQLite on disk.

## Testing

```bash
npx vitest run          # unit tests on the core retrieval/shaping logic (fakes for the ports)
npx tsc --noEmit        # typecheck
npx tsx test/mcp/smoke.ts   # real end-to-end MCP protocol smoke test (Client<->Server, real SQLite)
```

`test/mcp/smoke.ts` and `demo/scenarios.ts` run via `tsx` rather than vitest because they exercise
the real `node:sqlite` case-store adapter, which vitest's Vite-based module graph cannot yet
resolve (it's still an experimental Node builtin).
