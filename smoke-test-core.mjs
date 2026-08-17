/**
 * Smoke test for core watchEventLoop + trace API + worker exports.
 * Imports only from compiled dist/.
 */
import { watchEventLoop, withTraceId, getCurrentTrace, consoleReporter } from './dist/index.js';
import { reportEventLoopToParent, pipeFromWorker } from './dist/worker.js';

let passed = 0;
let failed = 0;
function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ---- Exports exist ----------------------------------------------------------
console.log('\n--- index.ts exports ---');
assert('watchEventLoop is a function', typeof watchEventLoop === 'function');
assert('withTraceId is a function', typeof withTraceId === 'function');
assert('getCurrentTrace is a function', typeof getCurrentTrace === 'function');
assert('consoleReporter.onLog is a function', typeof consoleReporter.onLog === 'function');
assert('consoleReporter.onThreshold is a function', typeof consoleReporter.onThreshold === 'function');
assert('consoleReporter.onRecover is a function', typeof consoleReporter.onRecover === 'function');

// _getTraceStorage must NOT be exported (was dead code, now removed)
const indexExports = await import('./dist/index.js');
assert('_getTraceStorage is NOT exported', !('_getTraceStorage' in indexExports));

console.log('\n--- worker.ts exports ---');
assert('reportEventLoopToParent is a function', typeof reportEventLoopToParent === 'function');
assert('pipeFromWorker is a function', typeof pipeFromWorker === 'function');

// ---- watchEventLoop runtime test --------------------------------------------
console.log('\n--- watchEventLoop runtime ---');
const snapshots = [];
const thresholds = [];
const recoveries = [];

const handle = watchEventLoop({
  source: 'smoke-test',
  intervalMs: 50,
  warn: { ms: 999999 },       // unreachable threshold — just tests wiring
  onLog: (s) => snapshots.push(s),
  onThreshold: (s, l) => thresholds.push({ s, l }),
  onRecover: (s, l) => recoveries.push({ s, l }),
});

await new Promise((r) => setTimeout(r, 180));
handle.stop();

assert('received at least 2 snapshots', snapshots.length >= 2);
assert('snapshot has source field', snapshots[0]?.source === 'smoke-test');
assert('snapshot has numeric p99', typeof snapshots[0]?.p99 === 'number');
assert('snapshot has numeric p50', typeof snapshots[0]?.p50 === 'number');
assert('snapshot has memory field', snapshots[0]?.memory !== undefined);
assert('snapshot has timestamp', typeof snapshots[0]?.timestamp === 'number');

// ---- withTraceId / getCurrentTrace ------------------------------------------
console.log('\n--- trace context ---');
let traceIdSeen;
withTraceId('req-abc', 'http-handler', () => {
  traceIdSeen = getCurrentTrace()?.traceId;
});
assert('withTraceId propagates traceId', traceIdSeen === 'req-abc');
assert('getCurrentTrace outside context returns undefined', getCurrentTrace() === undefined);

// ---- reactor subpath exports ------------------------------------------------
console.log('\n--- subpath reactor exports ---');
const { PrometheusReporter } = await import('./dist/reactors/prometheus.js');
const { SentryReporter } = await import('./dist/reactors/sentry.js');
const { OtelReporter } = await import('./dist/reactors/otel.js');
const { PinoReporter } = await import('./dist/reactors/pino.js');
assert('PrometheusReporter exists', typeof PrometheusReporter === 'function');
assert('SentryReporter exists', typeof SentryReporter === 'function');
assert('OtelReporter exists', typeof OtelReporter === 'function');
assert('PinoReporter exists', typeof PinoReporter === 'function');

// ---- summary ----------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
