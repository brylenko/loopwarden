# loop-guard

[![npm](https://img.shields.io/npm/v/loop-guard)](https://www.npmjs.com/package/loop-guard)
[![license](https://img.shields.io/npm/l/loop-guard)](LICENSE)
[![node](https://img.shields.io/node/v/loop-guard)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/loop-guard)](https://www.npmjs.com/package/loop-guard)
[![types](https://img.shields.io/badge/types-TypeScript-blue)](src/core/types.ts)

Native Node.js event-loop lag monitoring using `perf_hooks.monitorEventLoopDelay` —
percentile-based, debounced two-level alerts, worker_thread support, and
pluggable exporters (Prometheus, Sentry, OpenTelemetry, Pino). Zero mandatory
dependencies; exporters are optional peer deps loaded only if you use them.

## Why not toobusy-js / event-loop-lag?

Those libraries poll the event loop with `setInterval` and expose a single
lag number. `loop-guard` uses Node's native histogram API instead (lower
overhead, no self-induced polling noise), exposes p50/p95/p99/max instead of
one number, ships with TypeScript types and dual ESM/CJS output, and has
first-class worker_thread support so you can tell *which* thread degraded.

## Install

```
npm install loop-guard
```

## Quick start

```ts
import { watchEventLoop } from 'loop-guard';

const handle = watchEventLoop({
  intervalMs: 1000,
  metric: 'p99',
  warn: { ms: 50, debounceMs: 10_000 },
  critical: { ms: 100, debounceMs: 30_000 },
  onLog: (snapshot) => logger.info(snapshot, 'event loop'),
  onThreshold: (snapshot, level) => alerting.notify(level, snapshot),
  onRecover: (snapshot, level) => logger.info(`${level} recovered`),
});

// later
handle.stop();
```

## Worker threads

```ts
// inside your worker file
import { reportEventLoopToParent } from 'loop-guard/worker';
reportEventLoopToParent({ source: 'auth-controller', warn: { ms: 50 } });
```

```ts
// on the main thread
import { pipeFromWorker } from 'loop-guard/worker';
pipeFromWorker(worker, {
  onLog: (s) => logger.info(s),
  onThreshold: (s, level) => alerting.notify(level, s),
});
```

## Console reporter (zero dependencies)

```ts
import { watchEventLoop, consoleReporter } from 'loop-guard';

watchEventLoop({
  warn: { ms: 50 },
  critical: { ms: 100 },
  onLog: consoleReporter.onLog,
  onThreshold: consoleReporter.onThreshold,
  onRecover: consoleReporter.onRecover,
});
```

Output looks like:

```
[loop-guard] main p50=2.1ms p95=8.4ms p99=12.3ms max=17.3ms
[loop-guard] WARN threshold breached — main p50=… p99=80.0ms max=85.0ms
[loop-guard] CRITICAL threshold breached — main p50=… p99=200.0ms max=205.0ms
[loop-guard] recovered from warn — main p50=… p99=9.0ms max=14.0ms
```

## Exporters

```ts
import { PrometheusReporter } from 'loop-guard/prometheus';
import { SentryReporter } from 'loop-guard/sentry';
import { OtelReporter } from 'loop-guard/otel';
import { PinoReporter } from 'loop-guard/pino';
```

Each requires its corresponding peer dependency (`prom-client`,
`@sentry/node`, `@opentelemetry/api`, `pino`) — install only what you use.

### Pino

```ts
import pino from 'pino';
import { watchEventLoop } from 'loop-guard';
import { PinoReporter } from 'loop-guard/pino';

const logger = pino();
const reporter = new PinoReporter({ logger });

watchEventLoop({
  warn: { ms: 50 },
  critical: { ms: 100 },
  onLog: reporter.onLog,
  onThreshold: reporter.onThreshold,
  onRecover: reporter.onRecover,
});
```

`onLog` emits at `info`, `onThreshold` at `warn`/`error` depending on level,
and `onRecover` at `info`. All calls include the full snapshot as structured
fields alongside the message.

## Request correlation

```ts
import { withTraceId, getCurrentTrace } from 'loop-guard';

app.use((req, res, next) => withTraceId(req.id, 'http-controller', () => next()));
```

Every `LoopSnapshot` includes `traceId` when the sample was taken inside a
`withTraceId` context. This uses `AsyncLocalStorage` (no legacy async_hooks callbacks), so overhead is negligible.

## Two-level alerts with debounce

```ts
watchEventLoop({
  warn: { ms: 50, debounceMs: 10_000 },     // re-fire at most every 10s
  critical: { ms: 100, debounceMs: 30_000 }, // re-fire at most every 30s
  onThreshold: (snapshot, level) => { /* ... */ },
  onRecover: (snapshot, level) => { /* fires once when back under threshold */ },
  onLog: (snapshot) => { /* fires every tick regardless */ },
});
```

## License

MIT
