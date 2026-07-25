# Spec: CLI Adapter (Decision-Layer MVP)

> Capability: `cli-adapter` · Part of: `decision-layer-mvp` change
> Stretch delivery channel: shell-invokable patterns-bank command for developer workflows

## Overview

The CLI adapter provides an optional shell-invokable interface to the decision-layer core,
enabling developers to query pattern judgment from a command line. It calls the same core
`decide()` service used by the MCP adapter and prints results as plain text to stdout.

**Status:** STRETCH (day-3-if-time). May be entirely absent from the delivered MVP without
blocking or degrading the core or MCP adapter (REQ-CLI-2).

## Use Cases

- **UC-5 (STRETCH): Developer invokes the same capability via CLI** — `patterns-bank` command
  with a problem/snippet argument; same judgment output as MCP, formatted as plain text.

## Requirements

### REQ-CLI-1 — CLI invokes the same core (Could)

IF built, the `patterns-bank` CLI command SHOULD call the same core `decide()` service
used by the MCP adapter, with no separate retrieval implementation.

**Given** the CLI adapter is implemented  
**When** a developer runs it with a problem/snippet argument  
**Then** it prints the same shaped result structure as the MCP path (adapted to stdout
text)

### REQ-CLI-2 — Deferrable without impact (Won't-this-cycle if unbuilt)

The CLI adapter MAY be entirely absent from the delivered MVP; its absence MUST NOT block
or degrade the core, ports, or MCP adapter.

**Given** the CLI adapter is cut for time  
**When** the core and MCP adapter are verified  
**Then** both function fully independent of any CLI code existing

### REQ-CLI-3 — `get_pattern` tool (Won't-this-cycle)

A `get_pattern` (lookup-by-name) tool is explicitly out of scope for this change on any
adapter; it is deferred to a future change.

**Given** the MVP tool surface  
**When** enumerated  
**Then** `get_pattern` does not appear on any adapter (MCP or CLI)

## Interface

### Commands

```sh
patterns-bank recommend "<problem or snippet>"
patterns-bank antipattern "<code or design>"
```

### Output

Plain-text renderings of the core's `DecisionResult` types:
- **Recommendation:** pattern name, why, why-not, example snippet, confidence score
- **Antipattern:** flagged issue, why misuse, simpler alternative, example snippet, score
- **No-match:** explicit "no confident match" message (exit code 0)

### Exit Codes

- `0` — Success (any result type, including no-match)
- `1` — Error (e.g., database failure, embedding failure)

## Implementation Notes

- Reads `PB_SIM_THRESHOLD` and other env vars (same as MCP)
- Lazy-loads embeddings if not yet cached (same composition root as MCP)
- No additional business logic — pure wrapper around `decide()`
- Entirely deletable without touching core, ports, or MCP adapter

## Cut Criteria

If time runs out during the 3-day build:
1. CLI adapter is the first cut candidate (REQ-CLI-2)
2. Core and MCP adapter remain fully functional
3. The CLI feature is deferred to a post-MVP follow-up change

## Traceability

| Use Case | Requirements |
|----------|--------------|
| UC-5 (CLI, stretch) | REQ-CLI-1, REQ-CLI-2, REQ-CORE-1..5 |
