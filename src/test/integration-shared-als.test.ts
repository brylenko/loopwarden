/**
 * Regression test: verifies that traceMiddleware (from loopwarden/express) and
 * getCurrentTrace (from loopwarden) share the same AsyncLocalStorage instance.
 *
 * This test MUST be run against the compiled dist outputs, NOT against the raw
 * TypeScript sources (where both imports resolve to the same module file and the
 * bug is invisible). The test runner compiles src/ → dist-test/ and executes the
 * .js files, so we import from the *dist* entry points explicitly.
 *
 * If splitting is disabled in tsup.config.ts, each dist entry point inlines its
 * own `new AsyncLocalStorage()` and the stores are isolated from each other:
 * traceMiddleware writes to its own ALS but getCurrentTrace reads from a different
 * one, always returning `undefined`. This test catches that regression.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import from the built dist entry points to exercise the actual bundled output.
// Use a dynamic import so that TypeScript resolves these as module specifiers at
// runtime rather than compile-time path aliases.
const distRoot = new URL('../../dist/', import.meta.url).href;

const { getCurrentTrace } = await import(`${distRoot}index.js`);
const { traceMiddleware } = await import(`${distRoot}integrations/express.js`);

describe('integration: traceMiddleware → getCurrentTrace shared ALS', () => {
  it('getCurrentTrace() sees the trace set by traceMiddleware', (t, done) => {
    const mw = traceMiddleware({ header: 'x-request-id', label: 'als-test' });
    const req = { headers: { 'x-request-id': 'shared-als-trace-id' } };
    const res = { on(_event: string, _fn: () => void) {} };

    mw(req, res, () => {
      const ctx = getCurrentTrace();
      assert.ok(
        ctx !== undefined,
        'getCurrentTrace() returned undefined — ALS instances are NOT shared between dist entry points (splitting bug)',
      );
      assert.strictEqual(
        ctx.traceId,
        'shared-als-trace-id',
        `Expected traceId 'shared-als-trace-id' but got '${ctx?.traceId}'`,
      );
      assert.strictEqual(
        ctx.label,
        'als-test',
        `Expected label 'als-test' but got '${ctx?.label}'`,
      );
      done();
    });
  });

  it('getCurrentTrace() returns undefined when called outside any middleware context', () => {
    // Sanity check: outside any withTraceId scope the store must be empty.
    assert.strictEqual(getCurrentTrace(), undefined);
  });
});
