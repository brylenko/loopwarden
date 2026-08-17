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

// src/reactors/pino.ts
var pino_exports = {};
__export(pino_exports, {
  PinoReporter: () => PinoReporter
});
module.exports = __toCommonJS(pino_exports);
var PinoReporter = class {
  #logger;
  constructor(opts) {
    this.#logger = opts.logger;
  }
  onLog = (snapshot) => {
    this.#logger.info(
      { source: snapshot.source, p50: snapshot.p50, p95: snapshot.p95, p99: snapshot.p99, max: snapshot.max },
      `[loopwarden] ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`
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
    const msg = `[loopwarden] ${level.toUpperCase()} ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`;
    if (level === "critical") {
      this.#logger.error(data, msg);
    } else {
      this.#logger.warn(data, msg);
    }
  };
  onRecover = (snapshot, level) => {
    this.#logger.info(
      { source: snapshot.source, alertLevel: level, p99: snapshot.p99.toFixed(1) },
      `[loopwarden] recovered from ${level} on ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`
    );
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PinoReporter
});
//# sourceMappingURL=pino.cjs.map