# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.2] - 2026-08-18

### Fixed
- `LoopSnapshot.traceIds` never captured request IDs set via `traceMiddleware` (Express) or the Fastify `onRequest` hook. Root cause: `withTraceId(id, label, () => next())` wraps a synchronous function, so `result instanceof Promise` is false and the registry cleanup fires immediately — before any async request work runs. Fixed by adding `_addTraceToRegistries()` low-level API and binding registry lifetime to the actual HTTP response lifecycle (`res.on('finish'/'close')` for Express; `onResponse` hook for Fastify).
- Aborted connections no longer leak trace IDs in the watcher registry (`res.on('close')` covers client-abort path).

### Added
- `_addTraceToRegistries(traceId)` — internal low-level export for explicit registry lifecycle management (used by framework integrations)
- Regression tests: in-flight traceIds capture, post-response cleanup, ALS context across await chain

## [1.2.1] - 2026-08-17

### Fixed
- ALS singleton duplication when tsup `splitting: false` caused each entry point to bundle its own `AsyncLocalStorage` instance; `traceMiddleware` wrote to a different ALS than `getCurrentTrace()` read from. Fixed by switching to `splitting: true` so all entry points share the same chunk.

## [1.2.0] - 2026-08-17

### Added
- `loopwarden/express` — Express integration: `traceMiddleware` wraps requests in `withTraceId` context; `sheddingMiddleware` returns 503 when the event loop is overloaded. No `express` runtime dependency (structural duck-typing).
- `loopwarden/fastify` — Fastify integration: `loopwardenPlugin` registers an `onRequest` hook for trace-id propagation and an optional `preHandler` hook for load shedding. No `fastify` runtime dependency.
- `loopwarden/nestjs` — NestJS integration without decorators: `createTraceMiddleware` returns a NestJS-compatible middleware function; `createLoopwardenService` returns an object with `onModuleInit`/`onModuleDestroy` lifecycle methods that start/stop `watchEventLoop`. No `@nestjs/common` runtime dependency.
- GitHub Actions CI workflow (Node 18.x / 20.x matrix, tsc, build, tests, knip)
- CI status badge in README

## [1.1.2] - 2026-08-17

### Changed
- README: clarified `event-loop-delay` (mafintosh) as a low-level primitive with no alerting, percentiles, worker_thread support, or exporters
- README: added "Diagnosing a spike" section showing how to combine snapshot fields with `v8.getHeapStatistics()` in `onThreshold`

## [1.1.1] - 2026-08-17

### Fixed
- `withTraceId` with async functions: `traceId` was removed from the active registry immediately after `als.run()` returned a Promise (synchronous `finally`), before any async work ran. Now detects Promise return and defers cleanup via `result.finally()`, so `traceIds` in snapshots correctly includes IDs for the full duration of async request handlers.

## [1.1.0] - 2026-08-17

### Added
- `traceIds: string[]` in `LoopSnapshot` — all request trace IDs active during the sampling interval, collected automatically via a per-watcher `Set` that `withTraceId` registers into
- `_registerTraceRegistry()` internal API for watcher ↔ trace coordination
- `handle.stop()` now unregisters the watcher from the trace registry (no leaks)

### Changed
- `LoopSnapshot.traceId?: string` replaced by `LoopSnapshot.traceIds?: string[]` (breaking change)
- `dist/` added to `.gitignore` (build artifact, not for VCS)

### Removed
- `LoopSnapshot.traceId` (replaced by `traceIds`)

## [1.0.1] - 2026-08-17

### Changed
- Complete rename from `loop-guard` to `loopwarden` in all runtime strings, wire protocol channel (`__loopwarden`), OTel meter name, and error messages
- README: expanded comparison section to include `event-loop-delay` (mafintosh)
- README: switched to dynamic shields.io badges after initial publication

### Fixed
- `package-lock.json` still had `name: "loop-guard"` after rename; regenerated

## [1.0.0] - 2026-08-17

### Added
- `watchEventLoop()` — native `perf_hooks.monitorEventLoopDelay` histogram watcher with p50/p95/p99/max percentiles, two-level warn/critical alerts, independent debounce per level, and recovery notifications
- `withTraceId()` / `getCurrentTrace()` — `AsyncLocalStorage`-based request correlation
- `reportEventLoopToParent()` / `pipeFromWorker()` — worker_thread support
- `consoleReporter` — zero-dependency built-in reporter
- `PrometheusReporter` — prom-client 15 exporter (`loopwarden/prometheus`)
- `SentryReporter` — `@sentry/node` exporter (`loopwarden/sentry`)
- `OtelReporter` — `@opentelemetry/api` exporter (`loopwarden/otel`)
- `PinoReporter` — structured pino logger exporter (`loopwarden/pino`)
- Dual ESM/CJS output with TypeScript declarations
- `node:test` test suite (57 tests across trace, watch, reactors, worker)
- MIT license

[Unreleased]: https://github.com/brylenko/loopwarden/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/brylenko/loopwarden/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/brylenko/loopwarden/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/brylenko/loopwarden/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/brylenko/loopwarden/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/brylenko/loopwarden/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/brylenko/loopwarden/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/brylenko/loopwarden/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/brylenko/loopwarden/releases/tag/v1.0.0
