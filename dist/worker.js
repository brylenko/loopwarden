// src/worker.ts
import { parentPort } from "worker_threads";

// src/core/watch.ts
import { monitorEventLoopDelay } from "perf_hooks";

// src/core/trace.ts
import { AsyncLocalStorage } from "async_hooks";
var als = new AsyncLocalStorage();
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
            const stack = new Error(`loopwarden: ${level} threshold breached`).stack;
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

// src/worker.ts
var CHANNEL = "__loopwarden";
function reportEventLoopToParent(opts = {}) {
  if (!parentPort) {
    throw new Error("loopwarden: reportEventLoopToParent() must be called inside a worker_thread");
  }
  const port = parentPort;
  return watchEventLoop({
    ...opts,
    onLog: (snapshot) => port.postMessage({ channel: CHANNEL, kind: "log", snapshot }),
    onThreshold: (snapshot, level) => port.postMessage({ channel: CHANNEL, kind: "threshold", snapshot, level }),
    onRecover: (snapshot, level) => port.postMessage({ channel: CHANNEL, kind: "recover", snapshot, level })
  });
}
function pipeFromWorker(worker, handlers) {
  const listener = (msg) => {
    if (!isWireMessage(msg)) return;
    if (msg.kind === "log") handlers.onLog?.(msg.snapshot);
    else if (msg.kind === "threshold") handlers.onThreshold?.(msg.snapshot, msg.level);
    else if (msg.kind === "recover") handlers.onRecover?.(msg.snapshot, msg.level);
  };
  worker.on("message", listener);
  return () => worker.off("message", listener);
}
function isWireMessage(msg) {
  return typeof msg === "object" && msg !== null && msg.channel === CHANNEL;
}
export {
  pipeFromWorker,
  reportEventLoopToParent
};
//# sourceMappingURL=worker.js.map