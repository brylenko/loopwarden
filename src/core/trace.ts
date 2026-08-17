import { AsyncLocalStorage } from 'node:async_hooks';
import type { TraceContext } from './types.js';

const als = new AsyncLocalStorage<TraceContext>();

/**
 * Runs `fn` with a trace id bound to the current async context.
 * Cheap — uses AsyncLocalStorage (no legacy async_hooks callbacks), so overhead is negligible.
 *
 * @example
 * app.use((req, res, next) => withTraceId(req.id, 'http-controller', () => next()));
 */
export function withTraceId<T>(traceId: string, label: string | undefined, fn: () => T): T {
  const ctx: TraceContext = label === undefined ? { traceId } : { traceId, label };
  return als.run(ctx, fn);
}

export function getCurrentTrace(): TraceContext | undefined {
  return als.getStore();
}
