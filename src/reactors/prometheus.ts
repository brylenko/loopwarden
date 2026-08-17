import type { Gauge, Registry } from 'prom-client';
import type { AlertLevel, LoopSnapshot } from '../core/types.js';

export interface PrometheusReporterOptions {
  registry: Registry;
  prefix?: string;
}

/**
 * Wires loop-guard snapshots into prom-client gauges, labeled by `source`
 * so Grafana can break down lag per worker/controller/service.
 *
 * Requires `prom-client` as a peer dependency — not bundled.
 */
export class PrometheusReporter {
  #lagGauge: Gauge<'source' | 'percentile'>;
  #alertGauge: Gauge<'source' | 'level'>;

  constructor(opts: PrometheusReporterOptions) {
    const prefix = opts.prefix ?? 'nodejs_event_loop';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Gauge: PromGauge } = require('prom-client') as typeof import('prom-client');

    this.#lagGauge = new PromGauge({
      name: `${prefix}_lag_ms`,
      help: 'Event loop lag in ms by percentile',
      labelNames: ['source', 'percentile'],
      registers: [opts.registry],
    });

    this.#alertGauge = new PromGauge({
      name: `${prefix}_alert_active`,
      help: '1 if the given alert level is currently breached for this source',
      labelNames: ['source', 'level'],
      registers: [opts.registry],
    });
  }

  onLog = (snapshot: LoopSnapshot): void => {
    this.#lagGauge.set({ source: snapshot.source, percentile: 'p50' }, snapshot.p50);
    this.#lagGauge.set({ source: snapshot.source, percentile: 'p95' }, snapshot.p95);
    this.#lagGauge.set({ source: snapshot.source, percentile: 'p99' }, snapshot.p99);
    this.#lagGauge.set({ source: snapshot.source, percentile: 'max' }, snapshot.max);
  };

  onThreshold = (snapshot: LoopSnapshot, level: AlertLevel): void => {
    this.#alertGauge.set({ source: snapshot.source, level }, 1);
  };

  onRecover = (snapshot: LoopSnapshot, level: AlertLevel): void => {
    this.#alertGauge.set({ source: snapshot.source, level }, 0);
  };
}
