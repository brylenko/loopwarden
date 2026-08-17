export { A as AlertThreshold, W as WatchHandle, a as WatchOptions, w as watchEventLoop } from './watch-DJoTnbht.js';
import { T as TraceContext, L as LoopSnapshot, A as AlertLevel } from './types-BOkHjJO2.js';
export { a as LagMetric } from './types-BOkHjJO2.js';

/**
 * Runs `fn` with a trace id bound to the current async context.
 * Cheap — uses AsyncLocalStorage (no legacy async_hooks callbacks), so overhead is negligible.
 *
 * @example
 * app.use((req, res, next) => withTraceId(req.id, 'http-controller', () => next()));
 */
declare function withTraceId<T>(traceId: string, label: string | undefined, fn: () => T): T;
declare function getCurrentTrace(): TraceContext | undefined;

/**
 * Zero-dependency console reporter. Drop it in on day one — no setup required.
 *
 * @example
 * watchEventLoop({ onLog: consoleReporter.onLog, onThreshold: consoleReporter.onThreshold });
 */
declare const consoleReporter: {
    onLog(snapshot: LoopSnapshot): void;
    onThreshold(snapshot: LoopSnapshot, level: AlertLevel): void;
    onRecover(snapshot: LoopSnapshot, level: AlertLevel): void;
};

export { AlertLevel, LoopSnapshot, TraceContext, consoleReporter, getCurrentTrace, withTraceId };
