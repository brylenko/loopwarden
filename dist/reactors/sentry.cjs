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

// src/reactors/sentry.ts
var sentry_exports = {};
__export(sentry_exports, {
  SentryReporter: () => SentryReporter
});
module.exports = __toCommonJS(sentry_exports);
var SentryReporter = class {
  #sentry;
  #captureAtLevel;
  constructor(opts) {
    this.#sentry = opts.sentry;
    this.#captureAtLevel = opts.captureAtLevel ?? "critical";
  }
  onLog = (snapshot) => {
    this.#sentry.addBreadcrumb({
      category: "event-loop",
      level: "info",
      message: `[${snapshot.source}] p99=${snapshot.p99.toFixed(1)}ms`,
      data: { p50: snapshot.p50, p95: snapshot.p95, p99: snapshot.p99, max: snapshot.max }
    });
  };
  onThreshold = (snapshot, level) => {
    this.#sentry.addBreadcrumb({
      category: "event-loop",
      level: level === "critical" ? "error" : "warning",
      message: `[${snapshot.source}] ${level} threshold breached: p99=${snapshot.p99.toFixed(1)}ms`,
      data: {
        traceId: snapshot.traceId
      }
    });
    if (level === this.#captureAtLevel) {
      this.#sentry.captureMessage(
        `Event loop overloaded on ${snapshot.source}: p99=${snapshot.p99.toFixed(1)}ms`,
        level === "critical" ? "error" : "warning"
      );
    }
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SentryReporter
});
//# sourceMappingURL=sentry.cjs.map