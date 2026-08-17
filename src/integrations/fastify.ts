import { randomUUID } from 'node:crypto';
import { withTraceId, getCurrentTrace, _addTraceToRegistries } from '../core/trace.js';
import { OverloadState } from './shared.js';

export { OverloadState, getCurrentTrace };

// Structural duck-typed interfaces — we do NOT import from 'fastify' or 'fastify-plugin'.
// This keeps the bundle free of any fastify dependency at runtime.

interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface FastifyReply {
  code(statusCode: number): this;
  send(payload?: unknown): void;
}

type HookDoneCallback = (err?: Error) => void;

interface FastifyInstance {
  addHook(
    name: 'onRequest',
    hook: (request: FastifyRequest, reply: FastifyReply, done: HookDoneCallback) => void,
  ): void;
  addHook(
    name: 'preHandler',
    hook: (request: FastifyRequest, reply: FastifyReply, done: HookDoneCallback) => void,
  ): void;
  addHook(
    name: 'onResponse',
    hook: (request: FastifyRequest, reply: FastifyReply, done: HookDoneCallback) => void,
  ): void;
}

type PluginDoneCallback = (err?: Error) => void;

export interface LoopwardenFastifyOptions {
  /** Header to read the incoming trace id from. Default: 'x-request-id'. */
  header?: string;
  /** Optional label attached to the trace context. */
  label?: string;
  /** When provided, registers a preHandler that sheds load when the loop is overloaded. */
  shedding?: {
    state: OverloadState;
    /** Body message sent in the 503 JSON response. Default: 'Service temporarily unavailable'. */
    message?: string;
  };
}

/**
 * Fastify plugin that:
 *  1. Wraps every request in a `withTraceId` context (onRequest hook).
 *  2. Optionally sheds load by returning 503 when the event loop is overloaded
 *     (preHandler hook, only when `options.shedding` is provided).
 *
 * Does not depend on `fastify-plugin` — register with `fastify.register()` as usual.
 *
 * @example
 * await fastify.register(loopwardenPlugin, {
 *   header: 'x-request-id',
 *   label: 'api',
 *   shedding: { state },
 * });
 */
export function loopwardenPlugin(
  fastify: FastifyInstance,
  options: LoopwardenFastifyOptions,
  done: PluginDoneCallback,
): void {
  const header = options.header ?? 'x-request-id';
  const label = options.label;

  fastify.addHook('onRequest', (request, _reply, hookDone) => {
    const raw = request.headers[header];
    const id = (Array.isArray(raw) ? raw[0] : raw) ?? randomUUID();

    // ALS context propagation — getCurrentTrace() works throughout the async chain.
    // NOTE: withTraceId's internal remove() fires immediately when hookDone() returns
    // synchronously (result instanceof Promise === false), so we re-add the traceId
    // to all registries after withTraceId finishes.
    withTraceId(id, label, () => hookDone());

    // Register in watcher registries for the duration of the request lifecycle.
    // This must come AFTER withTraceId so we re-add after withTraceId's remove() fires.
    const removeFromRegistries = _addTraceToRegistries(id);
    (request as unknown as Record<string, unknown>).__lwCleanup = removeFromRegistries;
  });

  fastify.addHook('onResponse', (request, _reply, hookDone) => {
    const cleanup = (request as unknown as Record<string, unknown>).__lwCleanup;
    if (typeof cleanup === 'function') (cleanup as () => void)();
    hookDone();
  });

  if (options.shedding !== undefined) {
    const { state, message = 'Service temporarily unavailable' } = options.shedding;

    fastify.addHook('preHandler', (_request, reply, hookDone) => {
      if (state.isOverloaded) {
        reply.code(503).send({ error: message });
        return;
      }
      hookDone();
    });
  }

  done();
}
