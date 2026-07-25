#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { build } from '../../composition/build.js';
import type { DecisionMode, DecisionResult } from '../../core/types.js';

/**
 * cli/main.ts — the CLI adapter (STRETCH, design.md "CLI Adapter (STRETCH)
 * Shape"; REQ-CLI-1, REQ-CLI-2). Proves the core is genuinely
 * channel-agnostic by driving the SAME `decide()` used by the MCP adapter
 * through a second, unrelated delivery channel (argv/stdout instead of
 * MCP/stdio).
 *
 * Shape: `argv` -> `{ mode, query }` -> build composition root ->
 * `await decide(query, mode)` -> print a text rendering of the
 * `DecisionResult` to stdout -> exit 0 (a graceful `no_match` is still a
 * SUCCESSFUL run, not an error — same REQ-CORE-5/REQ-REC-3/REQ-ANTI-4
 * contract as the MCP adapter). This file contains NO retrieval, ranking,
 * or case-shaping logic (REQ-CLI-1) — only argv parsing and output
 * formatting. `get_pattern` is intentionally NOT a subcommand here either
 * (REQ-CLI-3). Entirely deletable without touching `src/core` or
 * `src/adapters/mcp` (REQ-CLI-2).
 *
 * Usage:
 *   patterns-bank recommend "<problem description or snippet>"
 *   patterns-bank antipattern "<snippet or design description>"
 */

const USAGE = 'Usage: patterns-bank <recommend|antipattern> "<query text>"';

interface ParsedArgs {
  mode: DecisionMode;
  query: string;
}

function parseArgv(argv: string[]): ParsedArgs {
  const [modeArg, ...rest] = argv;

  if (modeArg !== 'recommend' && modeArg !== 'antipattern') {
    throw new Error(`${USAGE}\nUnknown or missing mode: "${modeArg ?? ''}"`);
  }

  const query = rest.join(' ').trim();
  if (query === '') {
    throw new Error(`${USAGE}\nMissing query text.`);
  }

  return { mode: modeArg, query };
}

/**
 * Compact, human-readable rendering of a `DecisionResult` (formatting
 * only — mirrors `src/adapters/mcp/server.ts`'s renderer; no reshaping of
 * any field's meaning, REQ-CLI-1).
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

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { mode, query } = parseArgv(argv);
  const root = await build();
  const result = await root.decide(query, mode);
  process.stdout.write(`${renderResult(result)}\n`);
  // no_match is a normal, successful run — exit 0 either way.
  process.exitCode = 0;
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
    console.error('[cli] error:', (err as Error).message ?? err);
    process.exitCode = 1;
  });
}
