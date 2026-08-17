// src/reactors/sentry.ts
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
export {
  SentryReporter
};
//# sourceMappingURL=sentry.js.map