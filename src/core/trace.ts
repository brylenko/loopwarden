import { AsyncLocalStorage } from 'node:async_hooks';
import type { TraceContext } from './types.js';

const als = new AsyncLocalStorage<TraceContext>();

// Watchers register their active-set here; withTraceId keeps it current.
const registries = new Set<Set<string>>();

export function _registerTraceRegistry(set: Set<string>): () => void {
  registries.add(set);
  return () => registries.delete(set);
}

/**
 * Runs `fn` with a trace id bound to the current async context.
 * Any active watcher automatically collects this traceId for the duration of `fn`.
 * Cheap — uses AsyncLocalStorage (no legacy async_hooks callbacks), so overhead is negligible.
 *
 * @example
 * app.use((req, res, next) => withTraceId(req.id, 'http-controller', () => next()));
 */
export function withTraceId<T>(traceId: string, label: string | undefined, fn: () => T): T {
  const ctx: TraceContext = label === undefined ? { traceId } : { traceId, label };
  const remove = (): void => { for (const set of registries) set.delete(traceId); };
  for (const set of registries) set.add(traceId);
  let result: T;
  try {
    result = als.run(ctx, fn);
  } catch (e) {
    remove();
    throw e;
  }
  if (result instanceof Promise) {
    (result as Promise<unknown>).finally(remove);
    return result;
  }
  remove();
  return result;
}

export function getCurrentTrace(): TraceContext | undefined {
  return als.getStore();
}
