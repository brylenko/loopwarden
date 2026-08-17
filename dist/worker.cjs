"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/worker.ts
var worker_exports = {};
__export(worker_exports, {
  pipeFromWorker: () => pipeFromWorker,
  reportEventLoopToParent: () => reportEventLoopToParent
});
module.exports = __toCommonJS(worker_exports);
var import_node_worker_threads = require("worker_threads");

// src/core/watch.ts
var import_node_perf_hooks = require("perf_hooks");

// src/core/trace.ts
var import_node_async_hooks = require("async_hooks");
var als = new import_node_async_hooks.AsyncLocalStorage();
function getCurrentTrace() {
  return als.getStore();
}

// src/core/watch.ts
function watchEventLoop(opts) {
  const histogram = (0, import_node_perf_hooks.monitorEventLoopDelay)({ resolution: 10 });
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

// src/worker.ts
var CHANNEL = "__loopGuard";
function reportEventLoopToParent(opts = {}) {
  if (!import_node_worker_threads.parentPort) {
    throw new Error("loop-guard: reportEventLoopToParent() must be called inside a worker_thread");
  }
  const port = import_node_worker_threads.parentPort;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  pipeFromWorker,
  reportEventLoopToParent
});
//# sourceMappingURL=worker.cjs.map