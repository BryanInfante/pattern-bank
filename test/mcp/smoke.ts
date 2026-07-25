import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { build } from '../../src/composition/build.js';
import type { CompositionRoot } from '../../src/composition/build.js';
import { createServer } from '../../src/adapters/mcp/server.js';
import { seed } from '../../src/cases/seed.js';
import { SqliteCaseStore } from '../../src/adapters/case-store/sqlite.case-store.js';

/**
 * T19 — end-to-end MCP smoke test (REQ-MCP-1, REQ-MCP-2, REQ-REC-3,
 * REQ-ANTI-4). Run with: `npx tsx test/mcp/smoke.ts`.
 *
 * A real external MCP client is not available in this environment, so this
 * exercises the real protocol surface programmatically: a real `Client` <->
 * real `Server` connected via the SDK's linked `InMemoryTransport` pair
 * (protocol-accurate — the same request/response schemas a real client
 * would use — with no stdio subprocess needed), wired to the REAL
 * composition root (real `node:sqlite` case store, real `decide()`),
 * forcing `PB_EMBEDDER=keyword` so this never depends on a MiniLM model
 * download.
 *
 * This is run directly via `tsx` (not vitest): Vite's builtin-module
 * externalization does not yet recognize the still-experimental
 * `node:sqlite` (it is absent from `module.builtinModules`), so importing
 * the real SQLite case-store adapter fails under vitest's Vite-based module
 * graph. `tsx` uses Node's own module resolution and has no such issue —
 * exactly the same way `npm run seed` already runs `src/cases/seed.ts`.
 */

async function main(): Promise<void> {
  const dbDir = await mkdtemp(join(tmpdir(), 'patterns-bank-mcp-smoke-'));
  const dbPath = join(dbDir, 'nested', 'smoke.db');

  const previousEmbedder = process.env.PB_EMBEDDER;
  const previousDbPath = process.env.PB_DB_PATH;

  let client: Client | undefined;
  let root: CompositionRoot | undefined;

  try {
    // Seed a real SQLite DB with the authored decision cases. seed() opens
    // dbPath directly and (like node:sqlite itself) does not create parent
    // directories, so create the nested folder first.
    await mkdir(join(dbDir, 'nested'), { recursive: true });
    const seedResult = seed(dbPath);
    console.log(`[smoke] seeded ${seedResult.inserted} decision case(s) into ${dbPath}`);

    // 0) JD-1/JD-2 — SqliteCaseStore dim-mismatch cache-miss + close()
    // lifecycle. node:sqlite cannot be imported under vitest (see file
    // header), so these assertions live here instead of a vitest unit test.
    {
      const cacheDbPath = join(dbDir, 'nested', 'cache-test.db');
      seed(cacheDbPath);
      const store = new SqliteCaseStore({ dbPath: cacheDbPath });
      const cases = await store.loadCases();
      const dim = 4;
      const vectors = cases.map((_, i) => new Float32Array([i, i + 1, i + 2, i + 3]));
      await store.saveEmbeddings('jd1-test-embedder', vectors);

      const hit = await store.getCachedEmbeddings('jd1-test-embedder', dim);
      assert.ok(hit !== null, 'expected a cache hit when expectedDim matches the stored dim');
      assert.equal(hit?.length, cases.length);

      const miss = await store.getCachedEmbeddings('jd1-test-embedder', dim + 1);
      assert.equal(
        miss,
        null,
        'expected a cache miss (null) when expectedDim does not match the stored dim (JD-1)',
      );
      console.log('[smoke] PASS: getCachedEmbeddings degrades to a cache-miss on dim mismatch (JD-1)');

      store.close();
      console.log('[smoke] PASS: SqliteCaseStore.close() does not throw (JD-2)');
      await assert.rejects(
        () => store.loadCases(),
        'expected using the store after close() to fail (JD-2 sanity check)',
      );
      console.log('[smoke] PASS: store is unusable after close() (JD-2 sanity check)');
    }

    process.env.PB_EMBEDDER = 'keyword';
    process.env.PB_DB_PATH = dbPath;

    root = await build();
    console.log(`[smoke] composition root built (embedder=${root.embedderId}, threshold=${root.threshold})`);

    const server = createServer(root);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'smoke-test-client', version: '0.0.0' });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    console.log('[smoke] client <-> server connected over InMemoryTransport');

    // 1) tools/list — both tools present, valid schemas, non-stub descriptions.
    const { tools } = await client.listTools();
    console.log(`[smoke] tools/list -> ${tools.map((t) => t.name).join(', ')}`);

    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ['detect_antipattern', 'recommend_pattern'],
      'expected exactly recommend_pattern and detect_antipattern',
    );
    assert.ok(
      !tools.some((t) => t.name === 'get_pattern'),
      'get_pattern must NOT be registered (REQ-CLI-3)',
    );
    for (const tool of tools) {
      assert.equal(typeof tool.description, 'string');
      assert.ok(
        (tool.description ?? '').length > 200,
        `"${tool.name}" description looks like a generic stub (REQ-MCP-2)`,
      );
      assert.deepEqual(tool.inputSchema, {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A problem description, requirement, bug description, or code snippet.',
          },
        },
        required: ['query'],
      });
    }
    console.log('[smoke] PASS: tool list has valid schemas + non-stub descriptions, no get_pattern');

    // 2) recommend_pattern — on-topic query -> real grounded recommendation.
    const recommendResult = await client.callTool({
      name: 'recommend_pattern',
      arguments: { query: 'payment dispatcher if else chain switch strategy provider' },
    });
    const recommendText = (recommendResult.content as { type: string; text: string }[])[0]?.text ?? '';
    console.log(`[smoke] recommend_pattern(on-topic) ->\n${recommendText}\n`);
    assert.notEqual(recommendResult.isError, true);
    assert.match(recommendText, /Recommended pattern:/);
    console.log('[smoke] PASS: recommend_pattern returns a grounded recommendation');

    // 3) detect_antipattern — on-topic query -> real grounded flag.
    const antipatternResult = await client.callTool({
      name: 'detect_antipattern',
      arguments: { query: 'singleton getInstance static shared config global testability' },
    });
    const antipatternText = (antipatternResult.content as { type: string; text: string }[])[0]?.text ?? '';
    console.log(`[smoke] detect_antipattern(on-topic) ->\n${antipatternText}\n`);
    assert.notEqual(antipatternResult.isError, true);
    assert.match(antipatternText, /Flagged as over-engineered\/misapplied:/);
    console.log('[smoke] PASS: detect_antipattern returns a grounded flag');

    // 4) graceful no-match — off-topic query -> normal (non-error) result.
    const noMatchResult = await client.callTool({
      name: 'recommend_pattern',
      arguments: { query: 'weather rain sunny day picnic' },
    });
    const noMatchText = (noMatchResult.content as { type: string; text: string }[])[0]?.text ?? '';
    console.log(`[smoke] recommend_pattern(off-topic) ->\n${noMatchText}\n`);
    assert.notEqual(noMatchResult.isError, true);
    assert.match(noMatchText, /No decision case cleared the confidence threshold/);
    console.log('[smoke] PASS: off-topic query degrades gracefully (REQ-REC-3/REQ-ANTI-4), non-error result');

    // 5) JD-4 — prototype-pollution: an unregistered tool name that collides
    // with an inherited Object property (e.g. "toString") must hit the
    // "Unknown tool" error path, never be treated as a registered tool.
    await assert.rejects(
      () => client!.callTool({ name: 'toString', arguments: { query: 'anything' } }),
      /Unknown tool/,
      'expected calling the inherited-property tool name "toString" to be rejected as unknown (JD-4)',
    );
    console.log('[smoke] PASS: unregistered tool name "toString" hits the Unknown tool error path (JD-4)');

    console.log('\n[smoke] ALL CHECKS PASSED');
  } finally {
    if (client) await client.close();
    if (previousEmbedder === undefined) delete process.env.PB_EMBEDDER;
    else process.env.PB_EMBEDDER = previousEmbedder;
    if (previousDbPath === undefined) delete process.env.PB_DB_PATH;
    else process.env.PB_DB_PATH = previousDbPath;
    // Close the case store's SQLite handle before the temp-dir rm() below,
    // so the Windows EBUSY cleanup race no longer applies (JD-2).
    root?.close();
    try {
      await rm(dbDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      // Best-effort OS temp-dir cleanup only — must never flip an
      // otherwise-passing smoke run to a failure.
      console.warn('[smoke] temp dir cleanup skipped (non-fatal):', (cleanupErr as Error).message);
    }
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exitCode = 1;
});
