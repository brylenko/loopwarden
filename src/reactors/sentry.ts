import type * as SentryNode from '@sentry/node';
import type { AlertLevel, LoopSnapshot } from '../core/types.js';

export interface SentryReporterOptions {
  sentry: typeof SentryNode;
  /** Which level actually calls captureMessage. Default 'critical'. warn only leaves a breadcrumb. */
  captureAtLevel?: AlertLevel;
}

/**
 * Wires loopwarden into Sentry: always leaves a breadcrumb on every tick's
 * threshold state, and calls captureMessage only at `captureAtLevel` so you
 * don't spam Sentry on every sample.
 *
 * Requires `@sentry/node` as a peer dependency — not bundled.
 */
export class SentryReporter {
  #sentry: typeof SentryNode;
  #captureAtLevel: AlertLevel;

  constructor(opts: SentryReporterOptions) {
    this.#sentry = opts.sentry;
    this.#captureAtLevel = opts.captureAtLevel ?? 'critical';
  }

  onLog = (snapshot: LoopSnapshot): void => {
    this.#sentry.addBreadcrumb({
      category: 'event-loop',
      level: 'info',
      message: `[${snapshot.source}] p99=${snapshot.p99.toFixed(1)}ms`,
      data: { p50: snapshot.p50, p95: snapshot.p95, p99: snapshot.p99, max: snapshot.max },
    });
  };

  onThreshold = (snapshot: LoopSnapshot, level: AlertLevel): void => {
    this.#sentry.addBreadcrumb({
      category: 'event-loop',
      level: level === 'critical' ? 'error' : 'warning',
      message: `[${snapshot.source}] ${level} threshold breached: p99=${snapshot.p99.toFixed(1)}ms`,
      data: {
        traceIds: snapshot.traceIds,
      },
    });

    if (level === this.#captureAtLevel) {
      this.#sentry.captureMessage(
        `Event loop overloaded on ${snapshot.source}: p99=${snapshot.p99.toFixed(1)}ms`,
        level === 'critical' ? 'error' : 'warning',
      );
    }
  };
}
