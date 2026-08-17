import type { AlertLevel, LoopSnapshot } from '../core/types.js';

// Minimal structural type so we don't bundle pino itself.
interface PinoLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface PinoReporterOptions {
  logger: PinoLogger;
}

/**
 * Wires loop-guard snapshots into a pino logger.
 *
 * Requires `pino` as a peer dependency — not bundled.
 */
export class PinoReporter {
  #logger: PinoLogger;

  constructor(opts: PinoReporterOptions) {
    this.#logger = opts.logger;
  }

  onLog = (snapshot: LoopSnapshot): void => {
    this.#logger.info(
      { source: snapshot.source, p50: snapshot.p50, p95: snapshot.p95, p99: snapshot.p99, max: snapshot.max },
      `[loop-guard] ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`,
    );
  };

  onThreshold = (snapshot: LoopSnapshot, level: AlertLevel): void => {
    const data = {
      source: snapshot.source,
      p50: snapshot.p50,
      p95: snapshot.p95,
      p99: snapshot.p99,
      max: snapshot.max,
      ...(snapshot.traceId !== undefined ? { traceId: snapshot.traceId } : {}),
    };
    const msg = `[loop-guard] ${level.toUpperCase()} ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`;
    if (level === 'critical') {
      this.#logger.error(data, msg);
    } else {
      this.#logger.warn(data, msg);
    }
  };

  onRecover = (snapshot: LoopSnapshot, level: AlertLevel): void => {
    this.#logger.info(
      { source: snapshot.source, alertLevel: level, p99: snapshot.p99.toFixed(1) },
      `[loop-guard] recovered from ${level} on ${snapshot.source} p99=${snapshot.p99.toFixed(1)}ms`,
    );
  };
}
