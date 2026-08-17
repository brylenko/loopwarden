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

// src/index.ts
var src_exports = {};
__export(src_exports, {
  consoleReporter: () => consoleReporter,
  getCurrentTrace: () => getCurrentTrace,
  watchEventLoop: () => watchEventLoop,
  withTraceId: () => withTraceId
});
module.exports = __toCommonJS(src_exports);

// src/core/watch.ts
var import_node_perf_hooks = require("perf_hooks");

// src/core/trace.ts
var import_node_async_hooks = require("async_hooks");
var als = new import_node_async_hooks.AsyncLocalStorage();
function withTraceId(traceId, label, fn) {
  const ctx = label === void 0 ? { traceId } : { traceId, label };
  return als.run(ctx, fn);
}
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  consoleReporter,
  getCurrentTrace,
  watchEventLoop,
  withTraceId
});
//# sourceMappingURL=index.cjs.map