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

// src/reactors/otel.ts
var otel_exports = {};
__export(otel_exports, {
  OtelReporter: () => OtelReporter
});
module.exports = __toCommonJS(otel_exports);
var import_api = require("@opentelemetry/api");
var OtelReporter = class {
  #histogram;
  constructor(opts = {}) {
    const meter = import_api.metrics.getMeter(opts.meterName ?? "loop-guard");
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OtelReporter
});
//# sourceMappingURL=otel.cjs.map