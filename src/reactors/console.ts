import type { AlertLevel, LoopSnapshot } from '../core/types.js';

function fmt(snapshot: LoopSnapshot): string {
  return `${snapshot.source} p50=${snapshot.p50.toFixed(1)}ms p95=${snapshot.p95.toFixed(1)}ms p99=${snapshot.p99.toFixed(1)}ms max=${snapshot.max.toFixed(1)}ms`;
}

/**
 * Zero-dependency console reporter. Drop it in on day one — no setup required.
 *
 * @example
 * watchEventLoop({ onLog: consoleReporter.onLog, onThreshold: consoleReporter.onThreshold });
 */
export const consoleReporter = {
  onLog(snapshot: LoopSnapshot): void {
    console.log(`[loopwarden] ${fmt(snapshot)}`);
  },

  onThreshold(snapshot: LoopSnapshot, level: AlertLevel): void {
    const prefix = level === 'critical' ? 'CRITICAL' : 'WARN';
    const msg = `[loopwarden] ${prefix} threshold breached — ${fmt(snapshot)}`;
    if (level === 'critical') {
      console.error(msg);
    } else {
      console.warn(msg);
    }
  },

  onRecover(snapshot: LoopSnapshot, level: AlertLevel): void {
    console.log(`[loopwarden] recovered from ${level} — ${fmt(snapshot)}`);
  },
};
