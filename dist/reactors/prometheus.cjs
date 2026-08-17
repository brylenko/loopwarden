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

// src/reactors/prometheus.ts
var prometheus_exports = {};
__export(prometheus_exports, {
  PrometheusReporter: () => PrometheusReporter
});
module.exports = __toCommonJS(prometheus_exports);
var PrometheusReporter = class {
  #lagGauge;
  #alertGauge;
  constructor(opts) {
    const prefix = opts.prefix ?? "nodejs_event_loop";
    const { Gauge: PromGauge } = require("prom-client");
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PrometheusReporter
});
//# sourceMappingURL=prometheus.cjs.map