# Spec: MCP Adapter (Decision-Layer MVP)

> Capability: `mcp-adapter` · Part of: `decision-layer-mvp` change
> Primary delivery channel: MCP stdio server exposing pattern judgment to code agents

## Overview

The MCP adapter is the primary delivery channel for the decision-layer MVP. It runs as a
Model Context Protocol (MCP) stdio server and exposes two tools:
1. `recommend_pattern` — recommend a design/architecture pattern from a problem/snippet
2. `detect_antipattern` — flag over-engineering or misapplied patterns

The adapter is a thin translation layer only: it parses the MCP protocol, calls the core
`decide()` service, and serializes the result back to the calling agent. No retrieval,
ranking, or case-shaping logic lives in the adapter — all business logic stays in the pure
core.

## Supported Clients

The MCP stdio transport works with any agent that supports the Model Context Protocol:
- Claude Code
- Cursor
- Windsurf
- Cline
- Zed
- Any custom MCP client

## Related Use Cases

- **UC-1: Recommend a pattern from a described problem** — Agent calls `recommend_pattern` via MCP.
- **UC-2: Recommend a pattern from a code snippet** — Agent calls `recommend_pattern` with snippet text.
- **UC-3: Detect over-engineering / misapplied pattern in a snippet** — Agent calls `detect_antipattern` via MCP.
- **UC-4: No sufficiently-close decision case found** — Both tools return explicit no-match as normal result.
- **UC-7: Recommend a pattern from a requirement (design-time)** — MCP tool call with requirement text.
- **UC-8: Recommend a structural fix from a bug description** — MCP tool call with bug description.

## Requirements

### REQ-MCP-1 — stdio MCP server exposing both tools (Must)

The MCP adapter MUST run over stdio transport and expose `recommend_pattern` and
`detect_antipattern` as callable tools.

**Given** the MCP server process started  
**When** a compliant MCP client lists tools  
**Then** both `recommend_pattern` and `detect_antipattern` appear with valid schemas

### REQ-MCP-2 — High-quality tool descriptions (Must)

Each tool's `description` field MUST be specific enough (purpose, input expectations,
when to call it) that a calling LLM reliably chooses to invoke it for relevant problems.

**Given** a tool description  
**When** reviewed against a checklist (states purpose, input type, and triggering intent)  
**Then** it is not a one-line generic stub; ambiguous/generic descriptions are treated
as a spec violation

Tool descriptions MUST include:
- Clear purpose statement
- When to invoke the tool (what problem types / situations)
- Input expectations (prose, snippet, requirement, bug description, etc.)
- Grounding statement (outputs are curated, not LLM-generated)
- Fallback behavior (honest no-match signal)

### REQ-MCP-3 — Thin translation only (Must)

The MCP adapter MUST only translate protocol I/O to/from the core `decide()` call; it
MUST NOT contain retrieval, ranking, or case-shaping logic of its own.

**Given** the MCP adapter's handler code  
**When** inspected  
**Then** it delegates the request payload to the core service and forwards the shaped
result, with no independent business logic

## Tool Schemas

### Shared Input Schema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "A problem description, requirement, bug description, or code snippet."
    }
  },
  "required": ["query"]
}
```

### Output Contract

All results are serialized as `content: [{ type: 'text', text: '...' }]`. No-match results
are normal (non-error) MCP results, never error-type responses.

## Tool Descriptions (First-Class Artifact per REQ-MCP-2)

### `recommend_pattern`

> "Recommend the design/architecture pattern that best fits a described problem,
> requirement, or code snippet — AND explicitly name the obvious-but-wrong alternative
> and why it fails here. Call this when you are choosing HOW to structure code
> (e.g. 'how should I handle these payment methods', 'refactor this growing if/else',
> a requirement before code exists, or a snippet you're unsure about). Returns a curated
> judgment (pattern + why + why-not) grounded in a human-authored decision case, or an
> explicit 'no confident match' so you can fall back to your own reasoning. This is
> judgment, not a definition lookup."

### `detect_antipattern`

> "Check whether a code snippet or design is OVER-engineered or misapplies a pattern,
> and get a simpler alternative. Call this when code feels too abstract for its job
> (e.g. a Singleton where DI would do, a Strategy for two static branches, premature
> microservices, a Factory wrapping a plain constructor) or when a recurring bug smells
> structural. Returns the flagged misuse, why it's wrong in this context, and the
> simpler thing to do instead — grounded in a curated anti-pattern case, or an explicit
> 'no confident match'. It is retrieval-based judgment, NOT a static analyzer or linter."

## Non-Functional Requirements

- **Pure delegation:** The adapter MUST NOT contain any retrieval, ranking, or
  case-shaping code. Business logic lives in `src/core/`; the adapter only translates.
- **Tool-description quality:** Descriptions are a first-class design artifact per REQ-MCP-2.
  Vague or generic descriptions are treated as spec violations because they prevent
  calling LLMs from invoking the tools reliably.
- **No-match is normal:** Graceful no-match results (UC-4) MUST be MCP `content` results,
  never errors, so the calling agent can reason about them.
- **Stable service:** The MCP server MUST start cleanly, load cases and embeddings,
  and handle concurrent requests (or signal overload).

## Deployment

- Run the MCP server: `npx tsx src/adapters/mcp/server.ts` or via npm script
- Configure the client to connect to the server's stdio
- The server loads the case store and embeddings on startup
- Ready for tool calls from the agent

## Traceability

| Use Case | Requirements |
|----------|--------------|
| UC-1 (recommend from problem text) | REQ-MCP-1, REQ-MCP-2, REQ-MCP-3 |
| UC-2 (recommend from snippet) | REQ-MCP-1, REQ-MCP-2, REQ-MCP-3 |
| UC-3 (detect anti-pattern) | REQ-MCP-1, REQ-MCP-2, REQ-MCP-3 |
| UC-4 (no-match) | REQ-MCP-1, REQ-MCP-2, REQ-MCP-3 |
| UC-7 (recommend from requirement) | REQ-MCP-1, REQ-MCP-2, REQ-MCP-3 |
| UC-8 (structural fix from bug) | REQ-MCP-1, REQ-MCP-2, REQ-MCP-3 |
