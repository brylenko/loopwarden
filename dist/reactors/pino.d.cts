import { L as LoopSnapshot, A as AlertLevel } from '../types-BOkHjJO2.cjs';

interface PinoLogger {
    info(obj: Record<string, unknown>, msg: string): void;
    warn(obj: Record<string, unknown>, msg: string): void;
    error(obj: Record<string, unknown>, msg: string): void;
}
interface PinoReporterOptions {
    logger: PinoLogger;
}
/**
 * Wires loop-guard snapshots into a pino logger.
 *
 * Requires `pino` as a peer dependency — not bundled.
 */
declare class PinoReporter {
    #private;
    constructor(opts: PinoReporterOptions);
    onLog: (snapshot: LoopSnapshot) => void;
    onThreshold: (snapshot: LoopSnapshot, level: AlertLevel) => void;
    onRecover: (snapshot: LoopSnapshot, level: AlertLevel) => void;
}

export { PinoReporter, type PinoReporterOptions };
