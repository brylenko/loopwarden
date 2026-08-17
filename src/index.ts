export { watchEventLoop } from './core/watch.js';
export type { WatchOptions, WatchHandle, AlertThreshold } from './core/watch.js';

export { withTraceId, getCurrentTrace } from './core/trace.js';

export type {
  LoopSnapshot,
  AlertLevel,
  LagMetric,
  TraceContext,
} from './core/types.js';

export { consoleReporter } from './reactors/console.js';
