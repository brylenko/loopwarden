/**
 * Regression tests for the Fastify ALS context propagation bug (v1.2.2 → v1.2.3).
 *
 * Bug: getCurrentTrace() returned undefined inside Fastify route handlers because
 * Fastify's plugin encapsulation (fastify.register()) creates an async boundary.
 * When the loopwardenPlugin's onRequest hook called als.run(ctx, hookDone), the
 * resulting ALS context was confined to the plugin's encapsulated child scope and
 * did NOT propagate to route handlers registered in the parent (root) scope.
 *
 * Fix: loopwardenPlugin now sets [Symbol.for('skip-override')] = true so Fastify
 * registers its hooks on the root instance, bypassing encapsulation — the same
 * mechanism fastify-plugin uses. This makes the ALS context available in all routes.
 *
 * Also fixed: added onRequestAbort hook to clean up traceIds when a client
 * disconnects before a response is sent (onResponse does not fire in that case).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { watchEventLoop } from '../index.js';
import { loopwardenPlugin, getCurrentTrace } from '../integrations/fastify.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

describe('Fastify: loopwardenPlugin ALS propagation', () => {
  it('getCurrentTrace() is defined before and after await in route handler', async () => {
    const { default: Fastify } = await import('fastify');
    const fastify = Fastify({ logger: false });
    await fastify.register(loopwardenPlugin as Parameters<typeof fastify.register>[0], {
      header: 'x-request-id',
      label: 'test',
    });

    let traceBefore: unknown = 'NOT-SET';
    let traceAfter: unknown = 'NOT-SET';
    const TRACE_ID = 'fastify-als-before-await-001';

    fastify.get('/check', async (_request: FastifyRequest, reply: FastifyReply) => {
      // THE EXACT BUG: before the fix this returned undefined
      traceBefore = getCurrentTrace();
      await new Promise<void>(r => setTimeout(r, 30));
      traceAfter = getCurrentTrace();
      reply.send('ok');
    });

    await fastify.listen({ port: 0 });
    const port = (fastify.server.address() as { port: number }).port;

    await fetch(`http://localhost:${port}/check`, {
      headers: { 'x-request-id': TRACE_ID },
    });

    await fastify.close();

    assert.ok(
      traceBefore !== undefined,
      `getCurrentTrace() returned undefined BEFORE first await — ALS context not propagated from onRequest hook into route handler. This is the v1.2.2 bug.`,
    );
    assert.strictEqual(
      (traceBefore as { traceId: string }).traceId,
      TRACE_ID,
      'traceId mismatch before await',
    );

    assert.ok(
      traceAfter !== undefined,
      'getCurrentTrace() returned undefined AFTER await — ALS context lost through async boundary.',
    );
    assert.strictEqual(
      (traceAfter as { traceId: string }).traceId,
      TRACE_ID,
      'traceId mismatch after await',
    );
  });

  it('LoopSnapshot.traceIds is populated during an in-flight Fastify request', async () => {
    const snapshots: Array<{ traceIds?: string[]; timestamp: number }> = [];
    const handle = watchEventLoop({
      intervalMs: 100,
      onLog: (snap) => snapshots.push(snap),
    });

    const { default: Fastify } = await import('fastify');
    const fastify = Fastify({ logger: false });
    await fastify.register(loopwardenPlugin as Parameters<typeof fastify.register>[0], {
      header: 'x-request-id',
      label: 'test',
    });

    const TRACE_ID = 'fastify-snapshot-trace-002';

    fastify.get('/slow', async (_request: FastifyRequest, reply: FastifyReply) => {
      await new Promise<void>(r => setTimeout(r, 350));
      reply.send('ok');
    });

    await fastify.listen({ port: 0 });
    const port = (fastify.server.address() as { port: number }).port;

    await fetch(`http://localhost:${port}/slow`, {
      headers: { 'x-request-id': TRACE_ID },
    });

    // Give one extra tick for the watcher to fire after response
    await new Promise<void>(r => setTimeout(r, 150));

    handle.stop();
    await fastify.close();

    const captured = snapshots.some(s => s.traceIds?.includes(TRACE_ID));
    assert.ok(
      captured,
      `Expected at least one snapshot to include '${TRACE_ID}' during request, but none did.\n` +
      `Snapshots: ${JSON.stringify(snapshots.map(s => s.traceIds))}`,
    );
  });

  it('LoopSnapshot.traceIds is cleared after Fastify response finishes', async () => {
    const snapshots: Array<{ traceIds?: string[]; timestamp: number }> = [];
    const handle = watchEventLoop({
      intervalMs: 100,
      onLog: (snap) => snapshots.push(snap),
    });

    const { default: Fastify } = await import('fastify');
    const fastify = Fastify({ logger: false });
    await fastify.register(loopwardenPlugin as Parameters<typeof fastify.register>[0], {
      header: 'x-request-id',
      label: 'test',
    });

    const TRACE_ID = 'fastify-cleanup-trace-003';

    fastify.get('/hold', async (_request: FastifyRequest, reply: FastifyReply) => {
      await new Promise<void>(r => setTimeout(r, 250));
      reply.send('ok');
    });

    await fastify.listen({ port: 0 });
    const port = (fastify.server.address() as { port: number }).port;

    await fetch(`http://localhost:${port}/hold`, {
      headers: { 'x-request-id': TRACE_ID },
    });

    const responseTime = Date.now();
    // Wait 400ms after response — 4 more watcher ticks
    await new Promise<void>(r => setTimeout(r, 400));

    handle.stop();
    await fastify.close();

    const postResponseSnaps = snapshots.filter(s => s.timestamp > responseTime + 50);
    const leaked = postResponseSnaps.some(s => s.traceIds?.includes(TRACE_ID));
    assert.ok(
      !leaked,
      `Expected traceId '${TRACE_ID}' to be absent after response, but it leaked.\n` +
      `Post-response snapshots: ${JSON.stringify(postResponseSnaps.map(s => s.traceIds))}`,
    );
  });

  it('traceIds are cleaned up when client disconnects before response (onRequestAbort)', async () => {
    const snapshots: Array<{ traceIds?: string[]; timestamp: number }> = [];
    const handle = watchEventLoop({
      intervalMs: 100,
      onLog: (snap) => snapshots.push(snap),
    });

    const { default: Fastify } = await import('fastify');
    const fastify = Fastify({ logger: false });
    await fastify.register(loopwardenPlugin as Parameters<typeof fastify.register>[0], {
      header: 'x-request-id',
      label: 'test',
    });

    const TRACE_ID = 'fastify-abort-trace-004';

    fastify.get('/very-slow', async (_request: FastifyRequest, reply: FastifyReply) => {
      // Hold for 3 seconds; client will disconnect after ~200ms
      await new Promise<void>(r => setTimeout(r, 3000));
      reply.send('ok');
    });

    await fastify.listen({ port: 0 });
    const port = (fastify.server.address() as { port: number }).port;

    const controller = new AbortController();
    const fetchPromise = fetch(`http://localhost:${port}/very-slow`, {
      headers: { 'x-request-id': TRACE_ID },
      signal: controller.signal,
    }).catch(() => { /* expected abort */ });

    // Abort after 200ms
    setTimeout(() => controller.abort(), 200);
    await fetchPromise;

    // Give 500ms after abort to allow onRequestAbort hook to fire and clean up
    await new Promise<void>(r => setTimeout(r, 500));

    const abortTime = Date.now();
    // Take a couple more snapshots after cleanup
    await new Promise<void>(r => setTimeout(r, 300));

    handle.stop();
    await fastify.close();

    const postAbortSnaps = snapshots.filter(s => s.timestamp > abortTime);
    const leaked = postAbortSnaps.some(s => s.traceIds?.includes(TRACE_ID));
    assert.ok(
      !leaked,
      `Expected traceId '${TRACE_ID}' to be removed after client disconnect (onRequestAbort), but it leaked.\n` +
      `Post-abort snapshots: ${JSON.stringify(postAbortSnaps.map(s => s.traceIds))}`,
    );
  });
});
