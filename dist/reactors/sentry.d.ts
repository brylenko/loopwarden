import * as SentryNode from '@sentry/node';
import { A as AlertLevel, L as LoopSnapshot } from '../types-BOkHjJO2.js';

interface SentryReporterOptions {
    sentry: typeof SentryNode;
    /** Which level actually calls captureMessage. Default 'critical'. warn only leaves a breadcrumb. */
    captureAtLevel?: AlertLevel;
}
/**
 * Wires loop-guard into Sentry: always leaves a breadcrumb on every tick's
 * threshold state, and calls captureMessage only at `captureAtLevel` so you
 * don't spam Sentry on every sample.
 *
 * Requires `@sentry/node` as a peer dependency — not bundled.
 */
declare class SentryReporter {
    #private;
    constructor(opts: SentryReporterOptions);
    onLog: (snapshot: LoopSnapshot) => void;
    onThreshold: (snapshot: LoopSnapshot, level: AlertLevel) => void;
}

export { SentryReporter, type SentryReporterOptions };
