# Spec: Decision-Layer MVP (Agent-Agnostic Pattern Judgment)

> Change: `decision-layer-mvp` · Phase: `sdd-spec` · Store: openspec
> All capabilities below are NEW (greenfield) — full specs, not deltas.

## Use Cases

- **UC-1: Recommend a pattern from a described problem**
  - **Actor:** Code agent via MCP (Claude Code / Cursor / Windsurf / Cline / Zed)
  - **Trigger:** Agent calls `recommend_pattern` with a free-text problem description
  - **Preconditions:** MCP server running; case store loaded and embedded; embedding
    port available (model or fallback)
  - **Main flow:** 1) Agent sends problem text. 2) Core embeds the query. 3) Core runs
    brute-force cosine similarity against case embeddings. 4) Core selects top match(es)
    above threshold. 5) Core shapes result: recommended pattern, why, why-not the
    rejected alternative. 6) MCP adapter returns the shaped result to the agent.
  - **Outcome:** Agent receives a pattern + rationale + explicit rejection of the
    obvious-but-wrong alternative.
  - **Alternate / failure flows:** No case clears the similarity threshold → UC-4 (no
    match) path.

- **UC-2: Recommend a pattern from a code snippet**
  - **Actor:** Code agent via MCP
  - **Trigger:** Agent calls `recommend_pattern` with a code snippet instead of prose
  - **Preconditions:** Same as UC-1
  - **Main flow:** Same as UC-1, using the snippet as the embeddable query text; no
    snippet-specific parsing/AST analysis is performed — it is treated as text for
    embedding, identical to the problem-description path.
  - **Outcome:** Same shape as UC-1 (pattern + why + why-not).
  - **Alternate / failure flows:** No sufficiently-close case → UC-4.

- **UC-3: Detect over-engineering / misapplied pattern in a snippet**
  - **Actor:** Code agent via MCP
  - **Trigger:** Agent calls `detect_antipattern` with a code snippet
  - **Preconditions:** Case store includes cases with `anti_pattern_flag = true`;
    embedding port available
  - **Main flow:** 1) Agent sends snippet. 2) Core embeds the query using the SAME
    embedding path as UC-1/UC-2. 3) Core runs retrieval restricted to (or ranked with
    preference for) anti-pattern-flagged cases. 4) Core shapes result: flagged
    anti-pattern, why it is a misuse here, simpler suggested alternative. 5) MCP
    adapter returns the result.
  - **Outcome:** Agent receives an anti-pattern flag + simpler suggestion, grounded in
    a matched decision case — not from static code analysis.
  - **Alternate / failure flows:** No anti-pattern case matches closely enough → UC-4.

- **UC-4: No sufficiently-close decision case found (graceful no-match)**
  - **Actor:** Code agent via MCP (triggered as a sub-flow of UC-1/UC-2/UC-3)
  - **Trigger:** Best cosine similarity score falls below the configured threshold
  - **Preconditions:** Retrieval completed against the full case store
  - **Main flow:** 1) Core detects no case clears the threshold. 2) Core returns an
    explicit "no confident match" result (not a fabricated recommendation, not the
    weak best-effort match presented as confident). 3) MCP adapter surfaces this as a
    normal (non-error) tool result the agent can reason about.
  - **Outcome:** Agent is told retrieval found nothing confident, and may fall back to
    its own reasoning — the tool never invents a pattern name or rationale it cannot
    ground in a retrieved case.
  - **Alternate / failure flows:** None — this IS the failure/edge path for UC-1..3.

- **UC-5 (STRETCH): Developer invokes the same capability via CLI**
  - **Actor:** Developer via CLI (shell)
  - **Trigger:** Developer runs the `patterns-bank` command with a problem/snippet arg
  - **Preconditions:** Same core/case-store/embedding preconditions as UC-1; CLI
    adapter built (day-3-if-time; may not ship)
  - **Main flow:** 1) CLI parses argv. 2) CLI calls the same core `decide(query, mode)`
    service used by the MCP adapter. 3) CLI prints the shaped result to stdout.
  - **Outcome:** Same recommendation/anti-pattern output as the MCP path, via shell.
  - **Alternate / failure flows:** No match → same UC-4 shape, printed to stdout; CLI
    adapter itself may simply not exist if cut for time (explicitly acceptable).

- **UC-6: Offline embedding setup / first-run model load**
  - **Actor:** System / offline setup (no human in the loop at request time)
  - **Trigger:** Server startup, or first embedding request if lazy-loaded
  - **Preconditions:** `all-MiniLM-L6-v2` ONNX model available locally or downloadable
    once during setup; no API key required or used
  - **Main flow:** 1) System loads the ONNX model via transformers.js. 2) System
    embeds all case-store records once (or reads cached embeddings). 3) System is ready
    to serve UC-1/UC-2/UC-3.
  - **Outcome:** Embedding port ready for offline brute-force cosine retrieval.
  - **Alternate / failure flows:** Model fails to load/download on the demo machine →
    embedding port falls back to a deterministic keyword-overlap stub so the core and
    adapters keep working unchanged (degraded but functional retrieval, not a crash).

- **UC-7: Recommend a pattern from a requirement (design-time)**
  - **Actor:** Code agent via MCP (or developer at design time, before code exists)
  - **Trigger:** Agent calls `recommend_pattern` with a requirement / feature description
  - **Preconditions:** Same as UC-1
  - **Main flow:** Identical to UC-1 — the requirement text IS the embeddable query.
    This is an **input variant** of UC-1, not a new engine path: the difference is
    situational (forward-looking, no code yet), never algorithmic.
  - **Outcome:** Pattern + why + why-not, applied to a forward-looking design choice.
  - **Alternate / failure flows:** No confident match → UC-4.
  - **Note:** Adds NO new requirements; reuses the `recommend_pattern` requirement set.

- **UC-8: Recommend a structural fix from a bug description (diagnostic)**
  - **Actor:** Code agent via MCP
  - **Trigger:** Agent calls `recommend_pattern` or `detect_antipattern` with a bug
    description or the fragile snippet behind a recurring bug
  - **Preconditions:** Same as UC-1 / UC-3
  - **Main flow:** The bug description / snippet is the query; retrieval runs the SAME
    path. Diagnostic framing — the match surfaces the structural weakness and the
    pattern that removes it. When anti-pattern-flagged cases match, this overlaps UC-3.
    This is an **input variant** spanning UC-1/UC-3, not a new engine path.
  - **Outcome:** A recommended structural fix (pattern) + why the current shape is
    fragile.
  - **Alternate / failure flows:** No confident match → UC-4.
  - **Note:** Does NOT perform root-cause analysis of the bug itself (see Non-Goals).
    Adds NO new engine requirements.

## Non-Goals (this cycle)

- **Design-aware recommendation** — reasoning over a project's EXISTING architecture /
  design state to tailor advice (multi-input, stateful, context-carrying). This breaks
  the single-query `decide()` abstraction and is deferred to a future change.
- **Bug root-cause analysis** — UC-8 recommends a structural fix from the description; it
  does NOT diagnose why the bug occurs.
- Carried from the proposal: no static-analysis engine, no full pattern catalog, no
  `get_pattern` tool, no web UI, no hosted service.

## Requirements

### Capability: decision-core

#### REQ-CORE-1 — Pure decision service (Must)
The core `decide(query, mode)` service MUST have zero imports from any delivery
channel (no MCP SDK, no CLI/stdio parsing, no HTTP).

- GIVEN the core module's dependency graph
- WHEN it is inspected
- THEN no delivery-channel package (MCP SDK, CLI framework) appears anywhere in
  `src/core/`

#### REQ-CORE-2 — Shared retrieval path for both tools (Must)
`recommend_pattern` and `detect_antipattern` MUST both call the same underlying
retrieval function in the core; the only difference MAY be the case subset/ranking
bias (anti-pattern-flagged) and the result-shaping step.

- GIVEN a query in `recommend` mode and the same query in `antipattern` mode
- WHEN both are executed
- THEN both call the identical `decide()` retrieval implementation, differing only in
  mode-specific filtering/shaping — never in a separate retrieval algorithm

#### REQ-CORE-3 — Ports for embedding and case storage (Must)
The core MUST depend only on an embedding port interface and a case-store port
interface, never on a concrete embedding library or database driver directly.

- GIVEN the core's `decide()` implementation
- WHEN it needs an embedding or a case record
- THEN it calls the port interface, and a concrete adapter (ONNX/MiniLM, SQLite) is
  injected from outside the core

#### REQ-CORE-4 — Brute-force cosine retrieval, no vector index (Must)
The core MUST compute similarity via brute-force in-memory cosine over all case
embeddings (8-12 rows); it MUST NOT depend on a vector index or `sqlite-vec`.

- GIVEN 8-12 loaded decision cases with precomputed embeddings
- WHEN a query embedding is compared
- THEN cosine similarity is computed against every case in memory and ranked, with no
  ANN/vector-index dependency

#### REQ-CORE-5 — Graceful no-match (Must)
The core MUST return an explicit "no confident match" result when the best score is
below the configured threshold, rather than returning a low-confidence match as if
it were confident, and MUST NOT fabricate a pattern name or rationale not grounded
in a retrieved case.

- GIVEN a query whose best cosine score is below threshold
- WHEN `decide()` is called
- THEN the result explicitly signals no confident match, with no invented pattern or
  rationale

#### REQ-CORE-6 — Decision-case schema (Must)
Each decision case MUST conform to the schema: `id`, `context`, `recommended_pattern`,
`rejected_alternative`, `why_not`, `anti_pattern_flag`, `example_snippet`, `tags`.

- GIVEN the case-store loader
- WHEN it validates a case record
- THEN a record missing any required field is rejected/fails loading

#### REQ-CORE-7 — Case-set size (Must)
The system MUST ship with 8-12 original, human-authored decision cases (no copied
refactoring.guru text).

- GIVEN the loaded case store at startup
- WHEN its row count is checked
- THEN it contains between 8 and 12 case records

### Capability: pattern-recommendation

#### REQ-REC-1 — Recommendation output shape (Must)
`recommend_pattern` MUST return the recommended pattern, a why (grounded in the
matched case's context), and a why-not for the rejected/obvious alternative.

- GIVEN a query that retrieves a confident case match
- WHEN `recommend_pattern` is invoked
- THEN the response includes `recommended_pattern`, a why explanation, and a why-not
  explanation referencing `rejected_alternative`

#### REQ-REC-2 — Accepts prose or snippet input (Must)
`recommend_pattern` MUST accept either a free-text problem description or a code
snippet as the query, treating both as embeddable text (Given/When/Then per UC-1/UC-2).

- GIVEN a prose problem description
- WHEN `recommend_pattern` is invoked
- THEN retrieval proceeds identically to a snippet query, with no snippet-specific
  parsing branch

#### REQ-REC-3 — No-match degrades gracefully (Must)
`recommend_pattern` MUST surface REQ-CORE-5's no-match result as a normal (non-error)
tool response the calling agent can reason about.

- GIVEN a query with no confident case match
- WHEN `recommend_pattern` is invoked
- THEN the MCP tool response is a valid (non-error) result explicitly stating no
  confident match was found

### Capability: antipattern-detection

#### REQ-ANTI-1 — Retrieval+reasoning, not a static analyzer (Must, non-functional
constraint)
`detect_antipattern` MUST be implemented as retrieval over anti-pattern-flagged
decision cases plus result shaping; it MUST NOT include AST parsing, linting rules,
or any static-analysis engine.

- GIVEN the `detect_antipattern` implementation
- WHEN its dependencies are inspected
- THEN no AST/linter/static-analysis library is present; only the shared `decide()`
  retrieval path is used

#### REQ-ANTI-2 — Detection output shape (Must)
`detect_antipattern` MUST return the flagged anti-pattern/misuse, why it is a misuse
in this context, and a simpler suggested alternative.

- GIVEN a snippet matching an anti-pattern-flagged case
- WHEN `detect_antipattern` is invoked
- THEN the response includes the flagged issue, a why-misuse explanation, and a
  simpler-alternative suggestion

#### REQ-ANTI-3 — Shares core retrieval path (Must)
`detect_antipattern` MUST call the same `decide()` core function as
`recommend_pattern` (REQ-CORE-2), scoped/biased toward `anti_pattern_flag = true`
cases.

- GIVEN a call to `detect_antipattern`
- WHEN traced
- THEN it invokes `decide(query, 'antipattern')` and not a separate implementation

#### REQ-ANTI-4 — No-match degrades gracefully (Must)
Same as REQ-REC-3, for `detect_antipattern`.

- GIVEN a snippet with no confident anti-pattern case match
- WHEN `detect_antipattern` is invoked
- THEN the response explicitly states no confident anti-pattern match, as a normal
  (non-error) result

### Capability: mcp-adapter

#### REQ-MCP-1 — stdio MCP server exposing both tools (Must)
The MCP adapter MUST run over stdio transport and expose `recommend_pattern` and
`detect_antipattern` as callable tools.

- GIVEN the MCP server process started
- WHEN a compliant MCP client lists tools
- THEN both `recommend_pattern` and `detect_antipattern` appear with valid schemas

#### REQ-MCP-2 — High-quality tool descriptions (Must)
Each tool's `description` field MUST be specific enough (purpose, input expectations,
when to call it) that a calling LLM reliably chooses to invoke it for relevant
problems, per the proposal's identified risk.

- GIVEN a tool description
- WHEN reviewed against a checklist (states purpose, input type, and triggering
  intent)
- THEN it is not a one-line generic stub; ambiguous/generic descriptions are treated
  as a spec violation

#### REQ-MCP-3 — Thin translation only (Must)
The MCP adapter MUST only translate protocol I/O to/from the core `decide()` call; it
MUST NOT contain retrieval, ranking, or case-shaping logic of its own.

- GIVEN the MCP adapter's handler code
- WHEN inspected
- THEN it delegates the request payload to the core service and forwards the shaped
  result, with no independent business logic

### Capability: cli-adapter (STRETCH)

#### REQ-CLI-1 — CLI invokes the same core (Could)
IF built, the `patterns-bank` CLI command SHOULD call the same core `decide()`
service used by the MCP adapter, with no separate retrieval implementation.

- GIVEN the CLI adapter is implemented
- WHEN a developer runs it with a problem/snippet argument
- THEN it prints the same shaped result structure as the MCP path (adapted to stdout
  text)

#### REQ-CLI-2 — Deferrable without impact (Won't-this-cycle if unbuilt)
The CLI adapter MAY be entirely absent from the delivered MVP; its absence MUST NOT
block or degrade the core, ports, or MCP adapter.

- GIVEN the CLI adapter is cut for time
- WHEN the core and MCP adapter are verified
- THEN both function fully independent of any CLI code existing

#### REQ-CLI-3 — `get_pattern` tool (Won't-this-cycle)
A `get_pattern` (lookup-by-name) tool is explicitly out of scope for this change on
any adapter; it is deferred to a future change.

- GIVEN the MVP tool surface
- WHEN enumerated
- THEN `get_pattern` does not appear on any adapter (MCP or CLI)

## Non-Functional Requirements

- **Agnosticism (Must):** The core MUST remain 100% delivery-channel-agnostic; only
  adapters (`src/adapters/*`) may import protocol/channel-specific packages.
- **Offline operation (Must):** Embedding and retrieval MUST work fully offline after
  initial model acquisition — no runtime network calls required to serve a request.
- **No API key (Must):** No cloud LLM/embedding API key is required anywhere in the
  retrieval path (local ONNX model or keyword-overlap fallback only).
- **MCP tool-description quality (Must):** See REQ-MCP-2 — treated as a first-class
  design artifact, not an afterthought.
- **Graceful no-match (Must):** See REQ-CORE-5/REQ-REC-3/REQ-ANTI-4 — the system MUST
  NEVER fabricate a recommendation when retrieval confidence is insufficient.
- **`detect_antipattern` is not a linter (Must):** See REQ-ANTI-1 — explicit
  constraint against static-analysis scope creep.
- **3-day scope discipline (Must):** Any requirement not marked Must/Should is
  explicitly cuttable without renegotiating the rest of the spec; cut order per the
  proposal is CLI adapter → cases beyond ~8 → any vector tooling beyond cosine.

## Traceability

| Use Case | Requirements |
|----------|--------------|
| UC-1 (recommend from problem text) | REQ-CORE-1..7, REQ-REC-1, REQ-REC-2, REQ-MCP-1, REQ-MCP-3 |
| UC-2 (recommend from snippet) | REQ-CORE-1..4, REQ-REC-1, REQ-REC-2, REQ-MCP-1, REQ-MCP-3 |
| UC-3 (detect anti-pattern) | REQ-CORE-1..4, REQ-ANTI-1..3, REQ-MCP-1, REQ-MCP-3 |
| UC-4 (no-match) | REQ-CORE-5, REQ-REC-3, REQ-ANTI-4 |
| UC-5 (CLI, stretch) | REQ-CLI-1, REQ-CLI-2, REQ-CORE-1..5 |
| UC-6 (offline setup / fallback) | REQ-CORE-3, REQ-CORE-4; Non-Functional: offline operation, no API key |
| UC-7 (recommend from requirement) | *Input variant of UC-1* — REQ-REC-1, REQ-REC-2, REQ-REC-3; no new requirements |
| UC-8 (structural fix from bug) | *Input variant of UC-1/UC-3* — REQ-REC-1..3, REQ-ANTI-1..4; no new requirements |
