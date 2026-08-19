import { randomUUID } from 'node:crypto';
import { withTraceId, getCurrentTrace, _addTraceToRegistries } from '../core/trace.js';
import { OverloadState } from './shared.js';

export { OverloadState, getCurrentTrace, _addTraceToRegistries };

// Structural duck-typed interfaces — we do NOT import from 'express'.
// This keeps the bundle free of any express dependency at runtime.

interface Request {
  headers: Record<string, string | string[] | undefined>;
}

interface Response {
  status(code: number): this;
  json(body: unknown): void;
  headersSent: boolean;
  on(event: string, listener: () => void): void;
}

type NextFunction = (err?: unknown) => void;

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

export interface TraceMiddlewareOptions {
  /** Header to read the incoming trace id from. Default: 'x-request-id'. */
  header?: string;
  /** Optional label attached to the trace context. */
  label?: string;
}

/**
 * Express middleware that wraps each request in a `withTraceId` context.
 *
 * The trace id is read from `options.header` (default `x-request-id`) or
 * generated via `randomUUID()`.  The context is available to every downstream
 * handler via `getCurrentTrace()` and is automatically collected by any active
 * `watchEventLoop` watcher.
 *
 * @example
 * app.use(traceMiddleware());
 * app.use(traceMiddleware({ header: 'x-trace-id', label: 'http-api' }));
 */
export function traceMiddleware(options?: TraceMiddlewareOptions): Middleware {
  const header = options?.header ?? 'x-request-id';
  const label = options?.label;

  return (req, res, next) => {
    const raw = req.headers[header];
    const id = (Array.isArray(raw) ? raw[0] : raw) ?? randomUUID();

    // ALS context propagation — getCurrentTrace() works throughout the async chain.
    // NOTE: withTraceId's internal remove() fires immediately when next() returns
    // synchronously (result instanceof Promise === false), so we re-add the traceId
    // to all registries after withTraceId finishes.
    withTraceId(id, label, () => next());

    // Register in watcher registries for the duration of the request lifecycle.
    // This must come AFTER withTraceId so we re-add after withTraceId's remove() fires.
    const removeFromRegistries = _addTraceToRegistries(id);
    let cleaned = false;
    const cleanup = (): void => { if (!cleaned) { cleaned = true; removeFromRegistries(); } };
    res.on('finish', cleanup);
    res.on('close', cleanup);
  };
}

export interface SheddingMiddlewareOptions {
  /** Shared overload state — updated by your watchEventLoop handlers. */
  state: OverloadState;
  /** Body message sent in the 503 JSON response. Default: 'Service temporarily unavailable'. */
  message?: string;
}

/**
 * Express middleware that returns a 503 JSON response while the event loop is
 * overloaded.  Mount this early in your middleware stack, before any
 * expensive handlers.
 *
 * @example
 * const state = new OverloadState();
 * app.use(sheddingMiddleware({ state }));
 *
 * watchEventLoop({
 *   onLog: () => {},
 *   onThreshold: (_snap, level) => state.raise(level),
 *   onRecover: (_snap, level) => state.lower(level),
 * });
 */
export function sheddingMiddleware(options: SheddingMiddlewareOptions): Middleware {
  const message = options.message ?? 'Service temporarily unavailable';

  return (req, res, next) => {
    if (options.state.isOverloaded) {
      res.status(503).json({ error: message });
      return;
    }
    next();
  };
}
