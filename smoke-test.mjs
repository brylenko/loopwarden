/**
 * Smoke test — imports from compiled dist/, exercises both new reactors.
 * Run: node smoke-test.mjs
 */
import { consoleReporter } from './dist/index.js';
import { PinoReporter } from './dist/reactors/pino.js';
import pino from 'pino';

// ---- helpers ----------------------------------------------------------------
const snap = (source, p99 = 12.3) => ({
  source,
  timestamp: Date.now(),
  p50: 5.1,
  p95: 9.8,
  p99,
  max: p99 + 5,
});

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

// ---- consoleReporter --------------------------------------------------------
console.log('\n--- consoleReporter ---');

const logs = [];
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...a) => logs.push({ level: 'log', msg: a.join(' ') });
console.warn = (...a) => logs.push({ level: 'warn', msg: a.join(' ') });
console.error = (...a) => logs.push({ level: 'error', msg: a.join(' ') });

consoleReporter.onLog(snap('main'));
consoleReporter.onThreshold(snap('main', 80), 'warn');
consoleReporter.onThreshold(snap('main', 200), 'critical');
consoleReporter.onRecover(snap('main', 9), 'warn');

console.log = origLog;
console.warn = origWarn;
console.error = origError;

// Print what was captured
for (const e of logs) origLog(`  [${e.level}] ${e.msg}`);

assert('onLog uses console.log', logs[0]?.level === 'log');
assert('onLog contains [loopwarden]', logs[0]?.msg.includes('[loopwarden]'));
assert('onLog contains p99=', logs[0]?.msg.includes('p99='));
assert('onThreshold warn uses console.warn', logs[1]?.level === 'warn');
assert('onThreshold warn contains WARN', logs[1]?.msg.includes('WARN'));
assert('onThreshold critical uses console.error', logs[2]?.level === 'error');
assert('onThreshold critical contains CRITICAL', logs[2]?.msg.includes('CRITICAL'));
assert('onRecover uses console.log', logs[3]?.level === 'log');
assert('onRecover contains "recovered"', logs[3]?.msg.includes('recovered'));

// ---- PinoReporter -----------------------------------------------------------
console.log('\n--- PinoReporter ---');

const pinoLogs = [];
const logger = pino({ level: 'trace' }, {
  write(line) { pinoLogs.push(JSON.parse(line)); },
});

const reporter = new PinoReporter({ logger });

reporter.onLog(snap('api'));
reporter.onThreshold(snap('api', 90), 'warn');
reporter.onThreshold(snap('api', 210), 'critical');
reporter.onRecover(snap('api', 8), 'critical');

for (const e of pinoLogs) origLog(`  [level=${e.level}] ${e.msg}`);

// pino levels: 30=info, 40=warn, 50=error
assert('onLog uses info (30)', pinoLogs[0]?.level === 30);
assert('onLog msg contains source', pinoLogs[0]?.msg.includes('api'));
assert('onLog msg contains p99=', pinoLogs[0]?.msg.includes('p99='));
assert('onLog has structured p99 field', typeof pinoLogs[0]?.p99 === 'number');
assert('onThreshold warn uses warn (40)', pinoLogs[1]?.level === 40);
assert('onThreshold warn msg contains WARN', pinoLogs[1]?.msg.includes('WARN'));
assert('onThreshold critical uses error (50)', pinoLogs[2]?.level === 50);
assert('onThreshold critical msg contains CRITICAL', pinoLogs[2]?.msg.includes('CRITICAL'));
assert('onRecover uses info (30)', pinoLogs[3]?.level === 30);
assert('onRecover msg contains "recovered"', pinoLogs[3]?.msg.includes('recovered'));

// ---- summary ----------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
