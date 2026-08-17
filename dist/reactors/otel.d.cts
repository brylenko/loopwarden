import { L as LoopSnapshot } from '../types-BOkHjJO2.cjs';

interface OtelReporterOptions {
    meterName?: string;
}
/**
 * Records loop-guard snapshots as an OpenTelemetry histogram, for teams
 * already on an OTel pipeline into Grafana Cloud / Tempo / Mimir instead
 * of a plain Prometheus scrape target.
 *
 * Requires `@opentelemetry/api` as a peer dependency — not bundled.
 */
declare class OtelReporter {
    #private;
    constructor(opts?: OtelReporterOptions);
    onLog: (snapshot: LoopSnapshot) => void;
}

export { OtelReporter, type OtelReporterOptions };
