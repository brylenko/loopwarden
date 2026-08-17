# loopwarden

[![CI](https://github.com/brylenko/loopwarden/actions/workflows/ci.yml/badge.svg)](https://github.com/brylenko/loopwarden/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/loopwarden)](https://www.npmjs.com/package/loopwarden)
[![license](https://img.shields.io/npm/l/loopwarden)](LICENSE)
[![node](https://img.shields.io/node/v/loopwarden)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/loopwarden)](https://www.npmjs.com/package/loopwarden)
[![types](https://img.shields.io/badge/types-TypeScript-blue)](src/core/types.ts)

Native Node.js event-loop lag monitoring using `perf_hooks.monitorEventLoopDelay` —
percentile-based, debounced two-level alerts, worker_thread support, and
pluggable exporters (Prometheus, Sentry, OpenTelemetry, Pino). Zero mandatory
dependencies; exporters are optional peer deps loaded only if you use them.

## Why not toobusy-js / event-loop-lag / event-loop-delay?

toobusy-js, event-loop-lag, and loopbench poll the event loop with
`setInterval` and expose a single lag number — no percentiles, no TS types,
last published years ago. event-loop-delay (mafintosh) is more modern and also uses the native
histogram API, but it is a low-level primitive: one accumulated delay
counter, no percentiles, no alerting, no worker_thread support, no
exporters — you build everything on top yourself.

`loopwarden` uses the same native histogram API, but adds what all of the
above are missing: p50/p95/p99/max percentiles instead of one number,
two-level warn/critical alerts with independent debounce and recovery
notifications, first-class worker_thread support so you can tell *which*
thread degraded, and drop-in exporters for Prometheus, Sentry, OpenTelemetry,
and Pino. Ships with TypeScript types and dual ESM/CJS output.

## Install

```
npm install loopwarden
```

## Quick start

```ts
import { watchEventLoop } from 'loopwarden';

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
import { reportEventLoopToParent } from 'loopwarden/worker';
reportEventLoopToParent({ source: 'auth-controller', warn: { ms: 50 } });
```

```ts
// on the main thread
import { pipeFromWorker } from 'loopwarden/worker';
pipeFromWorker(worker, {
  onLog: (s) => logger.info(s),
  onThreshold: (s, level) => alerting.notify(level, s),
});
```

## Console reporter (zero dependencies)

```ts
import { watchEventLoop, consoleReporter } from 'loopwarden';

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
[loopwarden] main p50=2.1ms p95=8.4ms p99=12.3ms max=17.3ms
[loopwarden] WARN threshold breached — main p50=… p99=80.0ms max=85.0ms
[loopwarden] CRITICAL threshold breached — main p50=… p99=200.0ms max=205.0ms
[loopwarden] recovered from warn — main p50=… p99=9.0ms max=14.0ms
```

## Exporters

```ts
import { PrometheusReporter } from 'loopwarden/prometheus';
import { SentryReporter } from 'loopwarden/sentry';
import { OtelReporter } from 'loopwarden/otel';
import { PinoReporter } from 'loopwarden/pino';
```

Each requires its corresponding peer dependency (`prom-client`,
`@sentry/node`, `@opentelemetry/api`, `pino`) — install only what you use.

### Pino

```ts
import pino from 'pino';
import { watchEventLoop } from 'loopwarden';
import { PinoReporter } from 'loopwarden/pino';

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

### Express

```ts
import express from 'express';
import { watchEventLoop } from 'loopwarden';
import { OverloadState, traceMiddleware, sheddingMiddleware } from 'loopwarden/express';

const app = express();
const state = new OverloadState();

// Wrap every request in a trace context (reads x-request-id or generates a UUID)
app.use(traceMiddleware({ label: 'api' }));

// Return 503 immediately while the loop is overloaded
app.use(sheddingMiddleware({ state, message: 'Service temporarily unavailable' }));

watchEventLoop({
  warn: { ms: 50 },
  critical: { ms: 100 },
  onLog: (snap) => console.log(snap),
  onThreshold: (_snap, level) => { if (level === 'critical') state.setOverloaded(true); },
  onRecover: () => state.setOverloaded(false),
});
```

### Fastify

```ts
import Fastify from 'fastify';
import { watchEventLoop } from 'loopwarden';
import { OverloadState, loopwardenPlugin } from 'loopwarden/fastify';

const fastify = Fastify();
const state = new OverloadState();

await fastify.register(loopwardenPlugin, {
  header: 'x-request-id',
  label: 'api',
  shedding: { state, message: 'Service temporarily unavailable' },
});

watchEventLoop({
  warn: { ms: 50 },
  critical: { ms: 100 },
  onLog: (snap) => fastify.log.info(snap, 'event-loop tick'),
  onThreshold: (_snap, level) => { if (level === 'critical') state.setOverloaded(true); },
  onRecover: () => state.setOverloaded(false),
});
```

### NestJS

No decorators required — wire up with factory functions:

```ts
// main.ts / app.module.ts
import { NestFactory } from '@nestjs/core';
import { watchEventLoop } from 'loopwarden';
import { createTraceMiddleware, createLoopwardenService, OverloadState } from 'loopwarden/nestjs';

// 1. Start the event-loop watcher as a lifecycle-aware service
const state = new OverloadState();
const loopService = createLoopwardenService({
  warn: { ms: 50 },
  critical: { ms: 100 },
  onLog: (snap) => console.log('[loop]', snap.p99),
  onThreshold: (_snap, level) => { if (level === 'critical') state.setOverloaded(true); },
  onRecover: () => state.setOverloaded(false),
});

loopService.onModuleInit();   // or call inside AppModule.onModuleInit()

// 2. Apply trace middleware in your module's configure() method
// app.module.ts:
//   configure(consumer: MiddlewareConsumer) {
//     consumer.apply(createTraceMiddleware({ label: 'api' })).forRoutes('*');
//   }
```

## Request correlation

```ts
import { withTraceId } from 'loopwarden';

app.use((req, res, next) => withTraceId(req.id, 'http-controller', () => next()));
```

Every `LoopSnapshot` includes `traceIds: string[]` — all requests that were
active during that sampling interval. No extra setup needed beyond wrapping
your request handler with `withTraceId`. Uses `AsyncLocalStorage` (no legacy
async_hooks callbacks), so overhead is negligible.

## Diagnosing a spike

When `onThreshold` fires you already have percentiles, active trace IDs, and
memory in the snapshot. Combine them with V8 heap stats for a full picture
without any extra dependencies:

```ts
import v8 from 'node:v8';
import { watchEventLoop } from 'loopwarden';

watchEventLoop({
  warn: { ms: 50 },
  critical: { ms: 100 },
  onLog: (snap) => logger.info(snap, 'event-loop tick'),
  onThreshold: (snap, level) => {
    const heap = v8.getHeapStatistics();
    logger.warn({
      level,
      p99: snap.p99,
      max: snap.max,
      traceIds: snap.traceIds,          // which requests were active
      memory: snap.memory,              // rss / heapUsed / heapTotal
      heapSizeLimit: heap.heap_size_limit,
      externalMB: (heap.external_memory / 1024 / 1024).toFixed(1),
      stack: snap.stack,                // sync stack at breach moment
    }, `[loopwarden] ${level} spike`);
  },
});
```

`snap.traceIds` lists every request ID that was inside a `withTraceId` context
during the sampling interval — cross-reference against your access log to find
the culprit.

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
