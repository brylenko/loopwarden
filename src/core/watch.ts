import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { getCurrentTrace } from './trace.js';
import type { AlertLevel, LagMetric, LoopSnapshot } from './types.js';

export interface AlertThreshold {
  /** Lag value (ms) that triggers this level. */
  ms: number;
  /** Minimum time between repeated firings of this level, in ms. 0 = no debounce. */
  debounceMs?: number;
}

export interface WatchOptions {
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

export interface WatchHandle {
  stop: () => void;
}

interface LevelState {
  breached: boolean;
  lastFiredAt: number;
}

export function watchEventLoop(opts: WatchOptions): WatchHandle {
  const histogram: IntervalHistogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();

  const source = opts.source ?? 'main';
  const intervalMs = opts.intervalMs ?? 1000;
  const metric = opts.metric ?? 'p99';
  const includeMemory = opts.includeMemory ?? true;
  const captureStack = opts.captureStackOnThreshold ?? true;

  const levels: Partial<Record<AlertLevel, LevelState>> = {};
  if (opts.warn) levels.warn = { breached: false, lastFiredAt: 0 };
  if (opts.critical) levels.critical = { breached: false, lastFiredAt: 0 };

  const timer = setInterval(() => {
    const snapshot: LoopSnapshot = {
      source,
      timestamp: Date.now(),
      p50: nsToMs(histogram.percentile(50)),
      p95: nsToMs(histogram.percentile(95)),
      p99: nsToMs(histogram.percentile(99)),
      max: nsToMs(histogram.max),
    };
    histogram.reset();

    if (includeMemory) {
      const mem = process.memoryUsage();
      snapshot.memory = { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal };
    }

    const trace = getCurrentTrace();
    if (trace?.traceId !== undefined) snapshot.traceId = trace.traceId;

    opts.onLog(snapshot);

    const currentLag = snapshot[metric];

    (['warn', 'critical'] as const).forEach((level) => {
      const threshold = opts[level];
      const state = levels[level];
      if (!threshold || !state) return;

      const isBreached = currentLag >= threshold.ms;

      if (isBreached) {
        const now = Date.now();
        const debounce = threshold.debounceMs ?? 0;
        if (now - state.lastFiredAt >= debounce) {
          state.lastFiredAt = now;

          const alertSnapshot: LoopSnapshot = { ...snapshot };
          if (captureStack) {
            const stack = new Error(`loopwarden: ${level} threshold breached`).stack;
            if (stack !== undefined) alertSnapshot.stack = stack;
          }

          opts.onThreshold?.(alertSnapshot, level);
        }
        state.breached = true;
      } else if (state.breached) {
        state.breached = false;
        opts.onRecover?.(snapshot, level);
      }
    });
  }, intervalMs).unref();

  return {
    stop: () => {
      clearInterval(timer);
      histogram.disable();
    },
  };
}

function nsToMs(ns: number): number {
  return ns / 1e6;
}
