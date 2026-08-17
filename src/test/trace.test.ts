import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withTraceId, getCurrentTrace } from '../core/trace.js';

describe('withTraceId / getCurrentTrace', () => {
  it('returns undefined outside any context', () => {
    assert.strictEqual(getCurrentTrace(), undefined);
  });

  it('propagates traceId inside the callback', () => {
    withTraceId('req-123', undefined, () => {
      const ctx = getCurrentTrace();
      assert.strictEqual(ctx?.traceId, 'req-123');
    });
  });

  it('propagates label when provided', () => {
    withTraceId('req-456', 'http-handler', () => {
      const ctx = getCurrentTrace();
      assert.strictEqual(ctx?.traceId, 'req-456');
      assert.strictEqual(ctx?.label, 'http-handler');
    });
  });

  it('does not set label when undefined', () => {
    withTraceId('req-789', undefined, () => {
      const ctx = getCurrentTrace();
      assert.strictEqual(ctx?.traceId, 'req-789');
      assert.strictEqual('label' in (ctx ?? {}), false);
    });
  });

  it('restores undefined after the callback exits', () => {
    withTraceId('req-abc', undefined, () => { /* noop */ });
    assert.strictEqual(getCurrentTrace(), undefined);
  });

  it('nests correctly — inner context shadows outer', () => {
    withTraceId('outer', 'outer-label', () => {
      withTraceId('inner', 'inner-label', () => {
        const ctx = getCurrentTrace();
        assert.strictEqual(ctx?.traceId, 'inner');
        assert.strictEqual(ctx?.label, 'inner-label');
      });
      // outer restored after inner exits
      const ctx = getCurrentTrace();
      assert.strictEqual(ctx?.traceId, 'outer');
    });
  });

  it('returns the value from fn', () => {
    const result = withTraceId('req-ret', undefined, () => 42);
    assert.strictEqual(result, 42);
  });

  it('propagates into async microtasks within the same tick', async () => {
    let seen: string | undefined;
    await withTraceId('async-id', undefined, async () => {
      await Promise.resolve();
      seen = getCurrentTrace()?.traceId;
    });
    assert.strictEqual(seen, 'async-id');
  });
});
