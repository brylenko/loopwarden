import { Registry } from 'prom-client';
import { L as LoopSnapshot, A as AlertLevel } from '../types-BOkHjJO2.cjs';

interface PrometheusReporterOptions {
    registry: Registry;
    prefix?: string;
}
/**
 * Wires loopwarden snapshots into prom-client gauges, labeled by `source`
 * so Grafana can break down lag per worker/controller/service.
 *
 * Requires `prom-client` as a peer dependency — not bundled.
 */
declare class PrometheusReporter {
    #private;
    constructor(opts: PrometheusReporterOptions);
    onLog: (snapshot: LoopSnapshot) => void;
    onThreshold: (snapshot: LoopSnapshot, level: AlertLevel) => void;
    onRecover: (snapshot: LoopSnapshot, level: AlertLevel) => void;
}

export { PrometheusReporter, type PrometheusReporterOptions };
