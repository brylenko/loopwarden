import { randomUUID } from 'node:crypto';
import { withTraceId, getCurrentTrace } from '../core/trace.js';
import { watchEventLoop, type WatchOptions, type WatchHandle } from '../core/watch.js';
import { OverloadState } from './shared.js';

export { OverloadState, getCurrentTrace };

// Structural duck-typed interfaces — we do NOT import from '@nestjs/common' or '@nestjs/core'.
// This keeps the bundle free of any NestJS dependency at runtime and avoids
// the need for `experimentalDecorators` in tsconfig.json.

interface NestRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface NestResponse {
  status(code: number): this;
  json(body: unknown): void;
}

type NestNextFunction = (err?: unknown) => void;

export interface TraceMiddlewareOptions {
  /** Header to read the incoming trace id from. Default: 'x-request-id'. */
  header?: string;
  /** Optional label attached to the trace context. */
  label?: string;
}

/**
 * Returns a NestJS-compatible middleware function that wraps each request in a
 * `withTraceId` context.
 *
 * Use inside a NestJS module's `configure(consumer)` method:
 *
 * @example
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(createTraceMiddleware({ label: 'api' })).forRoutes('*');
 *   }
 * }
 */
export function createTraceMiddleware(options?: TraceMiddlewareOptions) {
  const header = options?.header ?? 'x-request-id';
  const label = options?.label;

  return function loopwardenTraceMiddleware(
    req: NestRequest,
    _res: NestResponse,
    next: NestNextFunction,
  ): void {
    const raw = req.headers[header];
    const id = (Array.isArray(raw) ? raw[0] : raw) ?? randomUUID();
    withTraceId(id, label, () => next());
  };
}

export interface LoopwardenServiceOptions extends WatchOptions {
  // inherits all WatchOptions (onLog, warn, critical, etc.)
}

/**
 * Returns an object with NestJS lifecycle hooks (`onModuleInit` / `onModuleDestroy`)
 * that start and stop a `watchEventLoop` monitor.
 *
 * Wire it up as a custom provider using `useValue` so you avoid decorators:
 *
 * @example
 * // app.module.ts
 * const loopwardenService = createLoopwardenService({
 *   onLog: (snap) => console.log('[loop]', snap.p99),
 *   warn: { ms: 100 },
 *   critical: { ms: 250 },
 * });
 *
 * // Module providers array (no decorators needed):
 * providers: [{ provide: 'LoopwardenService', useValue: loopwardenService }]
 *
 * // Or call lifecycle methods manually in bootstrap():
 * loopwardenService.onModuleInit();
 * // ... app running ...
 * loopwardenService.onModuleDestroy();
 */
export function createLoopwardenService(options: LoopwardenServiceOptions): {
  onModuleInit(): void;
  onModuleDestroy(): void;
} {
  let handle: WatchHandle | undefined;

  return {
    onModuleInit(): void {
      handle = watchEventLoop(options);
    },
    onModuleDestroy(): void {
      handle?.stop();
      handle = undefined;
    },
  };
}
