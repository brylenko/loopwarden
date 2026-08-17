// src/reactors/pino.ts
var PinoReporter = class {
  #logger;
  constructor(opts) {
    this.#logger = opts.logger;
  }
  onLog = (snapshot) => {
    this.#logger.info(
      { source: snapshot.source, p50: snapshot.p50, p95: snapshot.p95, p99: snapshot.p99, max: snapshot.max },
      `[loop-guard] ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`
    );
  };
  onThreshold = (snapshot, level) => {
    const data = {
      source: snapshot.source,
      p50: snapshot.p50,
      p95: snapshot.p95,
      p99: snapshot.p99,
      max: snapshot.max,
      ...snapshot.traceId !== void 0 ? { traceId: snapshot.traceId } : {}
    };
    const msg = `[loop-guard] ${level.toUpperCase()} ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`;
    if (level === "critical") {
      this.#logger.error(data, msg);
    } else {
      this.#logger.warn(data, msg);
    }
  };
  onRecover = (snapshot, level) => {
    this.#logger.info(
      { source: snapshot.source, alertLevel: level, p99: snapshot.p99.toFixed(1) },
      `[loop-guard] recovered from ${level} on ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`
    );
  };
};
export {
  PinoReporter
};
//# sourceMappingURL=pino.js.map