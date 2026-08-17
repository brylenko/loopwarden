import { a as LagMetric, L as LoopSnapshot, A as AlertLevel } from './types-BOkHjJO2.cjs';

interface AlertThreshold {
    /** Lag value (ms) that triggers this level. */
    ms: number;
    /** Minimum time between repeated firings of this level, in ms. 0 = no debounce. */
    debounceMs?: number;
}
interface WatchOptions {
    /** Identifies this monitor in multi-worker setups. Defaults to 'main'. */
    source?: string;
    /** How often to read the histogram and report a snapshot. Default 1000ms. */
    intervalMs?: number;
    /** Which percentile drives threshold comparisons. Default 'p99'. */
    metric?: LagMetric;
    /** Soft threshold — logged as a warning, does not necessarily page anyone. */
    warn?: AlertThreshold;
    /** Hard threshold — the one you actually want to alert/page on. */
    critical?: AlertThreshold;
    /** Include process.memoryUsage() in every snapshot. Cheap, on by default. */
    includeMemory?: boolean;
    /** Capture a synchronous stack trace on threshold breach. Cheap, on by default. */
    captureStackOnThreshold?: boolean;
    /** Called on every tick, unconditionally. This is your continuous log stream. */
    onLog: (snapshot: LoopSnapshot) => void;
    /** Called when a threshold is breached (subject to its own debounce). */
    onThreshold?: (snapshot: LoopSnapshot, level: AlertLevel) => void;
    /** Called once when lag drops back under a level's threshold after having breached it. */
    onRecover?: (snapshot: LoopSnapshot, level: AlertLevel) => void;
}
interface WatchHandle {
    stop: () => void;
}
declare function watchEventLoop(opts: WatchOptions): WatchHandle;

export { type AlertThreshold as A, type WatchHandle as W, type WatchOptions as a, watchEventLoop as w };
