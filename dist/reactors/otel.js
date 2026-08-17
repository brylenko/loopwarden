// src/reactors/otel.ts
import { metrics } from "@opentelemetry/api";
var OtelReporter = class {
  #histogram;
  constructor(opts = {}) {
    const meter = metrics.getMeter(opts.meterName ?? "loopwarden");
    this.#histogram = meter.createHistogram("event_loop_lag_ms", {
      description: "Node.js event loop lag in milliseconds",
      unit: "ms"
    });
  }
  onLog = (snapshot) => {
    this.#histogram.record(snapshot.p50, { source: snapshot.source, percentile: "p50" });
    this.#histogram.record(snapshot.p95, { source: snapshot.source, percentile: "p95" });
    this.#histogram.record(snapshot.p99, { source: snapshot.source, percentile: "p99" });
  };
};
export {
  OtelReporter
};
//# sourceMappingURL=otel.js.map