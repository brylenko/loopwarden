/**
 * Regression tests for the traceIds capture bug (v1.2.1 → v1.2.2).
 *
 * Bug: LoopSnapshot.traceIds never captured traces set via traceMiddleware because
 * next() is synchronous in Express — withTraceId saw result instanceof Promise === false
 * and called remove() immediately, before any watcher tick could observe the trace.
 *
 * Fix: traceMiddleware now calls _addTraceToRegistries AFTER withTraceId so the
 * traceId is re-inserted after withTraceId's own remove() fires. Cleanup is tied
 * to res.on('finish') and res.on('close') for correct request lifecycle management.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { watchEventLoop, getCurrentTrace } from '../index.js';
import { traceMiddleware } from '../integrations/express.js';

describe('traceIds capture via traceMiddleware', () => {
  it('traceIds populated during in-flight request', (t, done) => {
    const snapshots: Array<{ traceIds?: string[] }> = [];
    const handle = watchEventLoop({
      intervalMs: 100,
      onLog: (snap) => snapshots.push(snap),
    });

    const middleware = traceMiddleware({ header: 'x-request-id', label: 'test' });

    const server = http.createServer((req, res) => {
      // Cast: http.ServerResponse has .on() and the other needed shape;
      // status()/json() are Express-only but not called in this test path.
      middleware(req as any, res as any, async () => {
        // Hold the request open for 350ms so at least 3 watcher ticks fire
        await new Promise<void>(r => setTimeout(r, 350));
        res.writeHead(200);
        res.end('ok');
      });
    });

    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const TRACE_ID = 'in-flight-trace-001';

      fetch(`http://localhost:${addr.port}/`, {
        headers: { 'x-request-id': TRACE_ID },
      }).then(async () => {
        // Give one extra tick for the watcher to fire after response
        await new Promise<void>(r => setTimeout(r, 150));

        handle.stop();
        server.close(() => {
          const captured = snapshots.some(s => s.traceIds?.includes(TRACE_ID));
          assert.ok(
            captured,
            `Expected at least one snapshot to include '${TRACE_ID}' during request, but none did.\n` +
            `Snapshots: ${JSON.stringify(snapshots.map(s => s.traceIds))}`,
          );
          done();
        });
      }).catch(done);
    });
  });

  it('traceIds cleared after response finishes', (t, done) => {
    const snapshots: Array<{ traceIds?: string[]; timestamp: number }> = [];
    const handle = watchEventLoop({
      intervalMs: 100,
      onLog: (snap) => snapshots.push(snap),
    });

    const middleware = traceMiddleware({ header: 'x-request-id', label: 'test' });

    const server = http.createServer((req, res) => {
      middleware(req as any, res as any, async () => {
        // Hold for 250ms so we get some in-flight snapshots
        await new Promise<void>(r => setTimeout(r, 250));
        res.writeHead(200);
        res.end('ok');
      });
    });

    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const TRACE_ID = 'cleared-trace-002';

      fetch(`http://localhost:${addr.port}/`, {
        headers: { 'x-request-id': TRACE_ID },
      }).then(async () => {
        const responseTime = Date.now();

        // Wait 400ms after response — 4 more watcher ticks
        await new Promise<void>(r => setTimeout(r, 400));

        handle.stop();
        server.close(() => {
          // Post-response snapshots should not contain the trace
          const postResponseSnaps = snapshots.filter(s => s.timestamp > responseTime + 50);
          const leaked = postResponseSnaps.some(s => s.traceIds?.includes(TRACE_ID));
          assert.ok(
            !leaked,
            `Expected traceId '${TRACE_ID}' to be absent after response, but it leaked.\n` +
            `Post-response snapshots: ${JSON.stringify(postResponseSnaps.map(s => s.traceIds))}`,
          );
          done();
        });
      }).catch(done);
    });
  });

  it('getCurrentTrace works through await chain inside handler', (t, done) => {
    const middleware = traceMiddleware({ header: 'x-request-id', label: 'als-chain-test' });

    const server = http.createServer((req, res) => {
      middleware(req as any, res as any, async () => {
        // ALS context must propagate through await
        const before = getCurrentTrace();
        assert.ok(before !== undefined, 'getCurrentTrace() should be defined before await');
        assert.strictEqual(before.traceId, 'als-chain-trace-003');
        assert.strictEqual(before.label, 'als-chain-test');

        await new Promise<void>(r => setTimeout(r, 50));

        const after = getCurrentTrace();
        assert.ok(after !== undefined, 'getCurrentTrace() should be defined after await');
        assert.strictEqual(after.traceId, 'als-chain-trace-003');

        res.writeHead(200);
        res.end('ok');
      });
    });

    server.listen(0, () => {
      const addr = server.address() as { port: number };

      fetch(`http://localhost:${addr.port}/`, {
        headers: { 'x-request-id': 'als-chain-trace-003' },
      }).then(() => {
        server.close(done);
      }).catch(done);
    });
  });
});
