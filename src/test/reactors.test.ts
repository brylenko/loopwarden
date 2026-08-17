import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { LoopSnapshot } from '../core/types.js';

const require = createRequire(import.meta.url);
import { consoleReporter } from '../reactors/console.js';
import { PinoReporter } from '../reactors/pino.js';
import { PrometheusReporter } from '../reactors/prometheus.js';
import { SentryReporter } from '../reactors/sentry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnap(overrides: Partial<LoopSnapshot> = {}): LoopSnapshot {
  return {
    source: 'test',
    timestamp: Date.now(),
    p50: 2.0,
    p95: 8.0,
    p99: 12.0,
    max: 15.0,
    ...overrides,
  };
}

/** Temporarily replaces a console method and collects calls. */
function captureConsole(method: 'log' | 'warn' | 'error', fn: () => void): string[] {
  const captured: string[] = [];
  const original = console[method];
  console[method] = (...args: unknown[]) => captured.push(args.map(String).join(' '));
  try { fn(); } finally { console[method] = original; }
  return captured;
}

interface PinoCall { method: string; obj: Record<string, unknown>; msg: string }

/** Minimal pino-compatible logger that records calls. */
function makePinoSpy(): { logger: ConstructorParameters<typeof PinoReporter>[0]['logger']; calls: PinoCall[] } {
  const calls: PinoCall[] = [];
  return {
    calls,
    logger: {
      info(obj: Record<string, unknown>, msg: string): void { calls.push({ method: 'info', obj, msg }); },
      warn(obj: Record<string, unknown>, msg: string): void { calls.push({ method: 'warn', obj, msg }); },
      error(obj: Record<string, unknown>, msg: string): void { calls.push({ method: 'error', obj, msg }); },
    },
  };
}

// ---------------------------------------------------------------------------
// consoleReporter
// ---------------------------------------------------------------------------

describe('consoleReporter.onLog', () => {
  it('calls console.log', () => {
    const lines = captureConsole('log', () => consoleReporter.onLog(makeSnap()));
    assert.strictEqual(lines.length, 1);
  });

  it('output contains [loopwarden] prefix', () => {
    const lines = captureConsole('log', () => consoleReporter.onLog(makeSnap()));
    assert.ok(lines[0]?.includes('[loopwarden]'));
  });

  it('output contains source name', () => {
    const lines = captureConsole('log', () => consoleReporter.onLog(makeSnap({ source: 'api' })));
    assert.ok(lines[0]?.includes('api'));
  });

  it('output contains all four percentiles', () => {
    const lines = captureConsole('log', () => consoleReporter.onLog(makeSnap()));
    assert.ok(lines[0]?.includes('p50='));
    assert.ok(lines[0]?.includes('p95='));
    assert.ok(lines[0]?.includes('p99='));
    assert.ok(lines[0]?.includes('max='));
  });
});

describe('consoleReporter.onThreshold', () => {
  it('calls console.warn for warn level', () => {
    const lines = captureConsole('warn', () => consoleReporter.onThreshold(makeSnap(), 'warn'));
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0]?.includes('WARN'));
  });

  it('calls console.error for critical level', () => {
    const lines = captureConsole('error', () => consoleReporter.onThreshold(makeSnap(), 'critical'));
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0]?.includes('CRITICAL'));
  });

  it('output contains "threshold breached"', () => {
    const warn = captureConsole('warn', () => consoleReporter.onThreshold(makeSnap(), 'warn'));
    assert.ok(warn[0]?.includes('threshold breached'));
    const crit = captureConsole('error', () => consoleReporter.onThreshold(makeSnap(), 'critical'));
    assert.ok(crit[0]?.includes('threshold breached'));
  });
});

describe('consoleReporter.onRecover', () => {
  it('calls console.log', () => {
    const lines = captureConsole('log', () => consoleReporter.onRecover(makeSnap(), 'warn'));
    assert.strictEqual(lines.length, 1);
  });

  it('output contains "recovered" and level name', () => {
    const lines = captureConsole('log', () => consoleReporter.onRecover(makeSnap(), 'critical'));
    assert.ok(lines[0]?.includes('recovered'));
    assert.ok(lines[0]?.includes('critical'));
  });
});

// ---------------------------------------------------------------------------
// PinoReporter
// ---------------------------------------------------------------------------

describe('PinoReporter.onLog', () => {
  it('calls logger.info', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onLog(makeSnap({ source: 'svc' }));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0]?.method, 'info');
  });

  it('structured data contains all four percentile fields', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onLog(makeSnap({ p50: 1, p95: 2, p99: 3, max: 4 }));
    const obj = calls[0]!.obj;
    assert.strictEqual(obj['p50'], 1);
    assert.strictEqual(obj['p95'], 2);
    assert.strictEqual(obj['p99'], 3);
    assert.strictEqual(obj['max'], 4);
  });

  it('message contains source and p99', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onLog(makeSnap({ source: 'svc', p99: 12.3 }));
    assert.ok(calls[0]!.msg.includes('svc'));
    assert.ok(calls[0]!.msg.includes('p99=12.3ms'));
  });
});

describe('PinoReporter.onThreshold', () => {
  it('calls logger.warn for warn level', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onThreshold(makeSnap(), 'warn');
    assert.strictEqual(calls[0]?.method, 'warn');
  });

  it('calls logger.error for critical level', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onThreshold(makeSnap(), 'critical');
    assert.strictEqual(calls[0]?.method, 'error');
  });

  it('message contains WARN/CRITICAL prefix', () => {
    const { logger, calls } = makePinoSpy();
    const r = new PinoReporter({ logger });
    r.onThreshold(makeSnap(), 'warn');
    assert.ok(calls[0]!.msg.includes('WARN'));
    r.onThreshold(makeSnap(), 'critical');
    assert.ok(calls[1]!.msg.includes('CRITICAL'));
  });

  it('includes traceIds in structured data when present', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onThreshold(makeSnap({ traceIds: ['abc-123', 'def-456'] }), 'warn');
    assert.deepStrictEqual(calls[0]?.obj['traceIds'], ['abc-123', 'def-456']);
  });

  it('does not include traceIds key when absent', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onThreshold(makeSnap(), 'warn');
    assert.ok(!('traceIds' in (calls[0]!.obj)));
  });
});

describe('PinoReporter.onRecover', () => {
  it('calls logger.info', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onRecover(makeSnap(), 'critical');
    assert.strictEqual(calls[0]?.method, 'info');
  });

  it('message contains "recovered" and level', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onRecover(makeSnap({ source: 'svc' }), 'warn');
    assert.ok(calls[0]!.msg.includes('recovered'));
    assert.ok(calls[0]!.msg.includes('warn'));
  });

  it('uses alertLevel key (not level) to avoid pino level collision', () => {
    const { logger, calls } = makePinoSpy();
    new PinoReporter({ logger }).onRecover(makeSnap(), 'critical');
    assert.ok('alertLevel' in calls[0]!.obj);
    assert.ok(!('level' in calls[0]!.obj));
  });
});

// ---------------------------------------------------------------------------
// PrometheusReporter
// PrometheusReporter's constructor calls require('prom-client') internally —
// that bare require works in CJS but not in ESM. We load it from the compiled
// CJS dist so we test the actual published artefact for this reactor.
// ---------------------------------------------------------------------------

describe('PrometheusReporter', async () => {
  const { PrometheusReporter: PromReporter } = await import('../../dist/reactors/prometheus.cjs') as unknown as typeof import('../reactors/prometheus.js');
  const { Registry } = require('prom-client') as typeof import('prom-client');

  type MetricEntry = { name: string; values: Array<{ labels: Record<string, string>; value: number }> };

  async function getMetrics(registry: InstanceType<typeof Registry>): Promise<MetricEntry[]> {
    return registry.getMetricsAsJSON() as unknown as Promise<MetricEntry[]>;
  }

  it('onLog sets gauge values for all four percentiles', async () => {
    const registry = new Registry();
    const r = new PromReporter({ registry });
    r.onLog(makeSnap({ source: 'svc', p50: 1, p95: 2, p99: 3, max: 4 }));

    const metrics = await getMetrics(registry);
    const lagGauge = metrics.find((m) => m.name.endsWith('_lag_ms'));
    assert.ok(lagGauge !== undefined, 'lag gauge not found');

    const byPercentile = Object.fromEntries(lagGauge.values.map((v) => [v.labels['percentile'], v.value]));
    assert.strictEqual(byPercentile['p50'], 1);
    assert.strictEqual(byPercentile['p95'], 2);
    assert.strictEqual(byPercentile['p99'], 3);
    assert.strictEqual(byPercentile['max'], 4);
  });

  it('onThreshold sets alert gauge to 1', async () => {
    const registry = new Registry();
    const r = new PromReporter({ registry });
    r.onThreshold(makeSnap({ source: 'svc' }), 'warn');

    const metrics = await getMetrics(registry);
    const alertGauge = metrics.find((m) => m.name.endsWith('_alert_active'));
    assert.ok(alertGauge !== undefined);
    const warnVal = alertGauge.values.find((v) => v.labels['level'] === 'warn');
    assert.strictEqual(warnVal?.value, 1);
  });

  it('onRecover sets alert gauge back to 0', async () => {
    const registry = new Registry();
    const r = new PromReporter({ registry });
    r.onThreshold(makeSnap({ source: 'svc' }), 'critical');
    r.onRecover(makeSnap({ source: 'svc' }), 'critical');

    const metrics = await getMetrics(registry);
    const alertGauge = metrics.find((m) => m.name.endsWith('_alert_active'));
    assert.ok(alertGauge !== undefined);
    const critVal = alertGauge.values.find((v) => v.labels['level'] === 'critical');
    assert.strictEqual(critVal?.value, 0);
  });

  it('respects custom prefix option', async () => {
    const registry = new Registry();
    new PromReporter({ registry, prefix: 'my_app' });
    const metrics = await getMetrics(registry);
    assert.ok(metrics.some((m) => m.name === 'my_app_lag_ms'));
    assert.ok(metrics.some((m) => m.name === 'my_app_alert_active'));
  });
});

// ---------------------------------------------------------------------------
// SentryReporter — structural stub (avoids importing the full SDK)
// ---------------------------------------------------------------------------

describe('SentryReporter', () => {
  type Breadcrumb = Record<string, unknown>;
  type Capture = { msg: string; level: string };

  function makeSentrySpy(): {
    sentry: ConstructorParameters<typeof SentryReporter>[0]['sentry'];
    breadcrumbs: Breadcrumb[];
    captures: Capture[];
  } {
    const breadcrumbs: Breadcrumb[] = [];
    const captures: Capture[] = [];
    // Cast via unknown — SentryReporter only calls addBreadcrumb / captureMessage
    const sentry = {
      addBreadcrumb: (b: Breadcrumb) => breadcrumbs.push(b),
      captureMessage: (msg: string, level: string) => captures.push({ msg, level }),
    } as unknown as ConstructorParameters<typeof SentryReporter>[0]['sentry'];
    return { sentry, breadcrumbs, captures };
  }

  it('onLog adds a breadcrumb with level=info', () => {
    const { sentry, breadcrumbs } = makeSentrySpy();
    new SentryReporter({ sentry }).onLog(makeSnap({ source: 'svc', p99: 5.5 }));
    assert.strictEqual(breadcrumbs.length, 1);
    assert.strictEqual(breadcrumbs[0]?.['level'], 'info');
    assert.ok((breadcrumbs[0]?.['message'] as string).includes('svc'));
  });

  it('onThreshold adds breadcrumb and captureMessage at captureAtLevel=critical', () => {
    const { sentry, breadcrumbs, captures } = makeSentrySpy();
    new SentryReporter({ sentry, captureAtLevel: 'critical' }).onThreshold(makeSnap({ source: 'svc' }), 'critical');
    assert.strictEqual(breadcrumbs.length, 1);
    assert.strictEqual(captures.length, 1);
    assert.ok(captures[0]?.msg.includes('svc'));
    assert.strictEqual(captures[0]?.level, 'error');
  });

  it('onThreshold at warn only leaves breadcrumb when captureAtLevel=critical', () => {
    const { sentry, breadcrumbs, captures } = makeSentrySpy();
    new SentryReporter({ sentry, captureAtLevel: 'critical' }).onThreshold(makeSnap(), 'warn');
    assert.strictEqual(breadcrumbs.length, 1);
    assert.strictEqual(captures.length, 0);
  });

  it('captureAtLevel defaults to critical', () => {
    const { sentry, captures } = makeSentrySpy();
    new SentryReporter({ sentry }).onThreshold(makeSnap(), 'critical');
    assert.strictEqual(captures.length, 1);
  });

  it('breadcrumb level is "warning" for warn threshold (Sentry convention)', () => {
    const { sentry, breadcrumbs } = makeSentrySpy();
    new SentryReporter({ sentry }).onThreshold(makeSnap(), 'warn');
    assert.strictEqual(breadcrumbs[0]?.['level'], 'warning');
  });

  it('breadcrumb level is "error" for critical threshold', () => {
    const { sentry, breadcrumbs } = makeSentrySpy();
    new SentryReporter({ sentry }).onThreshold(makeSnap(), 'critical');
    assert.strictEqual(breadcrumbs[0]?.['level'], 'error');
  });
});
