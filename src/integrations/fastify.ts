import { randomUUID } from 'node:crypto';
import { withTraceId, getCurrentTrace, _addTraceToRegistries } from '../core/trace.js';
import { OverloadState } from './shared.js';

export { OverloadState, getCurrentTrace, _addTraceToRegistries };

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
  /** Fired when the client disconnects before a response is sent (Fastify ≥ 4.8). */
  addHook(
    name: 'onRequestAbort',
    hook: (request: FastifyRequest, done: HookDoneCallback) => void,
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
 * IMPORTANT: This plugin sets `[Symbol.for('skip-override')] = true` on itself so that
 * hooks are registered on the root Fastify instance rather than an encapsulated child
 * scope. Without this, Fastify's plugin encapsulation creates an async boundary that
 * prevents AsyncLocalStorage context from propagating to routes in the parent scope.
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

    // ALS context propagation — withTraceId runs als.run(ctx, () => hookDone()).
    // Because this plugin sets skip-override (root scope), the ALS context set here
    // propagates to all route handlers, both before and after any await.
    //
    // withTraceId also adds id to registries, then calls remove() synchronously
    // when hookDone() returns (not a Promise). We re-add below so the traceId
    // remains in watcher registries for the lifetime of the request.
    withTraceId(id, label, () => hookDone());

    // Re-register in watcher registries AFTER withTraceId's own remove() has fired.
    // withTraceId sees hookDone() return synchronously and immediately calls remove(),
    // so we must call _addTraceToRegistries here to re-insert the traceId.
    const removeFromRegistries = _addTraceToRegistries(id);
    let cleaned = false;
    const cleanup = (): void => { if (!cleaned) { cleaned = true; removeFromRegistries(); } };
    (request as unknown as Record<string, unknown>).__lwCleanup = cleanup;
  });

  fastify.addHook('onResponse', (request, _reply, hookDone) => {
    const cleanup = (request as unknown as Record<string, unknown>).__lwCleanup;
    if (typeof cleanup === 'function') (cleanup as () => void)();
    hookDone();
  });

  // Handle client disconnects: onRequestAbort fires when the client closes the
  // connection before a response is sent, which means onResponse won't fire.
  // Available in Fastify ≥ 4.8 — always present in our >=4 peer range.
  fastify.addHook('onRequestAbort', (request, hookDone) => {
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

// Skip Fastify's plugin encapsulation so hooks are registered on the root instance.
// This is the same mechanism fastify-plugin uses, but without the dependency.
// Without this, Fastify's async child scope breaks AsyncLocalStorage propagation
// from onRequest hooks into route handlers registered in the parent scope.
(loopwardenPlugin as unknown as Record<string | symbol, unknown>)[Symbol.for('skip-override')] = true;
