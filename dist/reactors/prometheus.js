var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/reactors/prometheus.ts
var PrometheusReporter = class {
  #lagGauge;
  #alertGauge;
  constructor(opts) {
    const prefix = opts.prefix ?? "nodejs_event_loop";
    const { Gauge: PromGauge } = __require("prom-client");
    this.#lagGauge = new PromGauge({
      name: `${prefix}_lag_ms`,
      help: "Event loop lag in ms by percentile",
      labelNames: ["source", "percentile"],
      registers: [opts.registry]
    });
    this.#alertGauge = new PromGauge({
      name: `${prefix}_alert_active`,
      help: "1 if the given alert level is currently breached for this source",
      labelNames: ["source", "level"],
      registers: [opts.registry]
    });
  }
  onLog = (snapshot) => {
    this.#lagGauge.set({ source: snapshot.source, percentile: "p50" }, snapshot.p50);
    this.#lagGauge.set({ source: snapshot.source, percentile: "p95" }, snapshot.p95);
    this.#lagGauge.set({ source: snapshot.source, percentile: "p99" }, snapshot.p99);
    this.#lagGauge.set({ source: snapshot.source, percentile: "max" }, snapshot.max);
  };
  onThreshold = (snapshot, level) => {
    this.#alertGauge.set({ source: snapshot.source, level }, 1);
  };
  onRecover = (snapshot, level) => {
    this.#alertGauge.set({ source: snapshot.source, level }, 0);
  };
};
export {
  PrometheusReporter
};
//# sourceMappingURL=prometheus.js.map