export type LagMetric = 'p50' | 'p95' | 'p99' | 'max';

export type AlertLevel = 'warn' | 'critical';

export interface LoopSnapshot {
  source: string;
  timestamp: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  memory?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  traceId?: string;
  /** Synchronous stack captured at the moment of an alert. Cheap, always available. */
  stack?: string;
}

export interface TraceContext {
  traceId: string;
  label?: string;
}
