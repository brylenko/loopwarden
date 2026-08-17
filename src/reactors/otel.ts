import { metrics, type Histogram } from '@opentelemetry/api';
import type { LoopSnapshot } from '../core/types.js';

export interface OtelReporterOptions {
  meterName?: string;
}

/**
 * Records loop-guard snapshots as an OpenTelemetry histogram, for teams
 * already on an OTel pipeline into Grafana Cloud / Tempo / Mimir instead
 * of a plain Prometheus scrape target.
 *
 * Requires `@opentelemetry/api` as a peer dependency — not bundled.
 */
export class OtelReporter {
  #histogram: Histogram;

  constructor(opts: OtelReporterOptions = {}) {
    const meter = metrics.getMeter(opts.meterName ?? 'loop-guard');
    this.#histogram = meter.createHistogram('event_loop_lag_ms', {
      description: 'Node.js event loop lag in milliseconds',
      unit: 'ms',
    });
  }

  onLog = (snapshot: LoopSnapshot): void => {
    this.#histogram.record(snapshot.p50, { source: snapshot.source, percentile: 'p50' });
    this.#histogram.record(snapshot.p95, { source: snapshot.source, percentile: 'p95' });
    this.#histogram.record(snapshot.p99, { source: snapshot.source, percentile: 'p99' });
  };
}
