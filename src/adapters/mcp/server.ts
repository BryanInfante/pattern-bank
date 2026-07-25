import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { build } from '../../composition/build.js';
import type { CompositionRoot } from '../../composition/build.js';
import type { DecisionMode, DecisionResult } from '../../core/types.js';
import {
  DECISION_QUERY_INPUT_SCHEMA,
  DETECT_ANTIPATTERN_DESCRIPTION,
  RECOMMEND_PATTERN_DESCRIPTION,
} from './schemas.js';

/**
 * server.ts — the MCP stdio adapter (REQ-MCP-1/2/3, design.md "MCP Adapter
 * Design"). Uses `@modelcontextprotocol/sdk`'s `StdioServerTransport` and
 * registers exactly two tools: `recommend_pattern` and `detect_antipattern`.
 * `get_pattern` is intentionally NOT registered (REQ-CLI-3).
 *
 * Each tool handler does ONLY: parse `{ query }` -> `await decide(query,
 * mode, deps)` (via the injected `CompositionRoot`) -> serialize the
 * `DecisionResult` to `content: [{ type: 'text', text }]`. No
 * retrieval/ranking/shaping logic lives in this adapter (REQ-MCP-3) — that
 * is exclusively `src/core`'s job. `no_match` is returned as a NORMAL
 * (non-error) tool result, never as a protocol error (REQ-REC-3/REQ-ANTI-4).
 */

const TOOLS: Tool[] = [
  {
    name: 'recommend_pattern',
    description: RECOMMEND_PATTERN_DESCRIPTION,
    inputSchema: DECISION_QUERY_INPUT_SCHEMA,
  },
  {
    name: 'detect_antipattern',
    description: DETECT_ANTIPATTERN_DESCRIPTION,
    inputSchema: DECISION_QUERY_INPUT_SCHEMA,
  },
];

/** Maps each registered tool name to the core `DecisionMode` it drives. */
const TOOL_MODE: Record<string, DecisionMode> = {
  recommend_pattern: 'recommend',
  detect_antipattern: 'antipattern',
};

/**
 * Compact, human/agent-readable rendering of a `DecisionResult` (formatting
 * only — no reshaping of any field's meaning).
 */
function renderResult(result: DecisionResult): string {
  switch (result.kind) {
    case 'recommendation':
      return [
        `Recommended pattern: ${result.recommended_pattern} (score ${result.score.toFixed(3)})`,
        `Why: ${result.why}`,
        `Rejected alternative: ${result.rejected_alternative}`,
        `Why not: ${result.why_not}`,
        `Example:\n${result.example_snippet}`,
        `[case: ${result.case_id}]`,
      ].join('\n');
    case 'antipattern':
      return [
        `Flagged as over-engineered/misapplied: ${result.flagged} (score ${result.score.toFixed(3)})`,
        `Why this is a misuse here: ${result.why_misuse}`,
        `Simpler alternative: ${result.simpler_alternative}`,
        `Example:\n${result.example_snippet}`,
        `[case: ${result.case_id}]`,
      ].join('\n');
    case 'no_match':
      return result.message;
  }
}

function parseQueryArg(toolName: string, args: Record<string, unknown> | undefined): string {
  const query = args?.['query'];
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`"${toolName}" requires a non-empty string "query" argument`);
  }
  return query;
}

/** Builds the MCP `Server` wired to the given composition root (testable without stdio). */
export function createServer(root: CompositionRoot): Server {
  const server = new Server(
    { name: 'patterns-bank', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const toolName = request.params.name;
    if (!Object.hasOwn(TOOL_MODE, toolName)) {
      throw new Error(`Unknown tool: "${toolName}"`);
    }
    const mode = TOOL_MODE[toolName] as DecisionMode;

    const query = parseQueryArg(toolName, request.params.arguments);
    const result = await root.decide(query, mode);

    return { content: [{ type: 'text', text: renderResult(result) }] };
  });

  return server;
}

/** Boots the real composition root and serves over stdio. */
export async function main(): Promise<void> {
  const root = await build();
  const server = createServer(root);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[mcp-server] fatal error:', err);
    process.exit(1);
  });
}
