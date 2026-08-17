// src/core/watch.ts
import { monitorEventLoopDelay } from "perf_hooks";

// src/core/trace.ts
import { AsyncLocalStorage } from "async_hooks";
var als = new AsyncLocalStorage();
function withTraceId(traceId, label, fn) {
  const ctx = label === void 0 ? { traceId } : { traceId, label };
  return als.run(ctx, fn);
}
function getCurrentTrace() {
  return als.getStore();
}

// src/core/watch.ts
function watchEventLoop(opts) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const source = opts.source ?? "main";
  const intervalMs = opts.intervalMs ?? 1e3;
  const metric = opts.metric ?? "p99";
  const includeMemory = opts.includeMemory ?? true;
  const captureStack = opts.captureStackOnThreshold ?? true;
  const levels = {};
  if (opts.warn) levels.warn = { breached: false, lastFiredAt: 0 };
  if (opts.critical) levels.critical = { breached: false, lastFiredAt: 0 };
  const timer = setInterval(() => {
    const snapshot = {
      source,
      timestamp: Date.now(),
      p50: nsToMs(histogram.percentile(50)),
      p95: nsToMs(histogram.percentile(95)),
      p99: nsToMs(histogram.percentile(99)),
      max: nsToMs(histogram.max)
    };
    histogram.reset();
    if (includeMemory) {
      const mem = process.memoryUsage();
      snapshot.memory = { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal };
    }
    const trace = getCurrentTrace();
    if (trace?.traceId !== void 0) snapshot.traceId = trace.traceId;
    opts.onLog(snapshot);
    const currentLag = snapshot[metric];
    ["warn", "critical"].forEach((level) => {
      const threshold = opts[level];
      const state = levels[level];
      if (!threshold || !state) return;
      const isBreached = currentLag >= threshold.ms;
      if (isBreached) {
        const now = Date.now();
        const debounce = threshold.debounceMs ?? 0;
        if (now - state.lastFiredAt >= debounce) {
          state.lastFiredAt = now;
          const alertSnapshot = { ...snapshot };
          if (captureStack) {
            const stack = new Error(`loop-guard: ${level} threshold breached`).stack;
            if (stack !== void 0) alertSnapshot.stack = stack;
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
    }
  };
}
function nsToMs(ns) {
  return ns / 1e6;
}

// src/reactors/console.ts
function fmt(snapshot) {
  return `${snapshot.source} p50=${snapshot.p50.toFixed(1)}ms p95=${snapshot.p95.toFixed(1)}ms p99=${snapshot.p99.toFixed(1)}ms max=${snapshot.max.toFixed(1)}ms`;
}
var consoleReporter = {
  onLog(snapshot) {
    console.log(`[loop-guard] ${fmt(snapshot)}`);
  },
  onThreshold(snapshot, level) {
    const prefix = level === "critical" ? "CRITICAL" : "WARN";
    const msg = `[loop-guard] ${prefix} threshold breached \u2014 ${fmt(snapshot)}`;
    if (level === "critical") {
      console.error(msg);
    } else {
      console.warn(msg);
    }
  },
  onRecover(snapshot, level) {
    console.log(`[loop-guard] recovered from ${level} \u2014 ${fmt(snapshot)}`);
  }
};
export {
  consoleReporter,
  getCurrentTrace,
  watchEventLoop,
  withTraceId
};
//# sourceMappingURL=index.js.map