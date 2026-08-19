/**
 * Smoke test for Express, Fastify, and NestJS integrations.
 * Mix of mock-object tests and real HTTP server tests.
 * Run: node smoke-test-integrations.mjs
 */
import Fastify from 'fastify';
import { watchEventLoop } from './dist/index.js';
import { OverloadState, traceMiddleware, sheddingMiddleware, getCurrentTrace as getTraceExpress } from './dist/integrations/express.js';
import { loopwardenPlugin, getCurrentTrace as getTraceFastify } from './dist/integrations/fastify.js';
import { createTraceMiddleware, createLoopwardenService, getCurrentTrace as getTraceNestJS } from './dist/integrations/nestjs.js';

// ---- helpers ----------------------------------------------------------------
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

function makeReq(headers = {}) {
  return { headers };
}

function makeRes() {
  const res = {
    _code: 200,
    _body: null,
    status(code) { res._code = code; return res; },
    json(body) { res._body = body; },
    send(body) { res._body = body; },
    code(c) { res._code = c; return res; },
    on(_event, _fn) {},
  };
  return res;
}

// ---- 1. traceMiddleware calls next inside withTraceId context ---------------
console.log('\n--- Express: traceMiddleware ---');

{
  const middleware = traceMiddleware({ header: 'x-trace-id', label: 'http-test' });
  const req = makeReq({ 'x-trace-id': 'abc-123' });
  const res = makeRes();
  let traceInsideNext;

  middleware(req, res, () => {
    traceInsideNext = getTraceExpress();
  });

  assert('traceId is propagated into next()', traceInsideNext?.traceId === 'abc-123');
  assert('label is propagated into next()', traceInsideNext?.label === 'http-test');
}

{
  // No header — should generate a UUID
  const middleware = traceMiddleware();
  const req = makeReq({});
  const res = makeRes();
  let traceInsideNext;

  middleware(req, res, () => {
    traceInsideNext = getTraceExpress();
  });

  assert('auto-generated UUID is a non-empty string', typeof traceInsideNext?.traceId === 'string' && traceInsideNext.traceId.length > 0);
  assert('default label is undefined when not specified', traceInsideNext?.label === undefined);
}

// ---- 2. sheddingMiddleware returns 503 / calls next -------------------------
console.log('\n--- Express: sheddingMiddleware ---');

{
  const state = new OverloadState();
  const middleware = sheddingMiddleware({ state, message: 'Too busy' });

  // Not overloaded — should call next
  const res1 = makeRes();
  let nextCalled = false;
  middleware(makeReq(), res1, () => { nextCalled = true; });
  assert('calls next() when not overloaded', nextCalled);
  assert('does not set status 503 when not overloaded', res1._code === 200);

  // Overloaded — should return 503
  state.setOverloaded(true);
  const res2 = makeRes();
  let nextCalledWhenOverloaded = false;
  middleware(makeReq(), res2, () => { nextCalledWhenOverloaded = true; });
  assert('does NOT call next() when overloaded', !nextCalledWhenOverloaded);
  assert('returns 503 when overloaded', res2._code === 503);
  assert('returns JSON body when overloaded', res2._body?.error === 'Too busy');

  // Recovery
  state.setOverloaded(false);
  const res3 = makeRes();
  let nextCalledAfterRecovery = false;
  middleware(makeReq(), res3, () => { nextCalledAfterRecovery = true; });
  assert('calls next() again after recovery', nextCalledAfterRecovery);
}

// ---- 3. loopwardenPlugin registers hooks and shedding works ----------------
console.log('\n--- Fastify: loopwardenPlugin ---');

{
  const state = new OverloadState();
  const hooks = {};
  const mockFastify = {
    addHook(name, fn) {
      hooks[name] = fn;
    },
  };

  let pluginDoneCalled = false;
  loopwardenPlugin(
    mockFastify,
    { header: 'x-req-id', label: 'fastify-test', shedding: { state, message: 'Overloaded' } },
    () => { pluginDoneCalled = true; },
  );

  assert('plugin calls done()', pluginDoneCalled);
  assert('onRequest hook registered', typeof hooks['onRequest'] === 'function');
  assert('preHandler hook registered', typeof hooks['preHandler'] === 'function');

  // onRequest: trace id propagated
  const req = makeReq({ 'x-req-id': 'fastify-trace-1' });
  let traceFromFastify;
  hooks['onRequest'](req, makeRes(), () => {
    traceFromFastify = getTraceFastify();
  });
  assert('Fastify onRequest propagates traceId', traceFromFastify?.traceId === 'fastify-trace-1');
  assert('Fastify onRequest propagates label', traceFromFastify?.label === 'fastify-test');

  // preHandler: not overloaded
  const res1 = makeRes();
  let preHandlerNextCalled = false;
  hooks['preHandler'](makeReq(), res1, () => { preHandlerNextCalled = true; });
  assert('preHandler calls done() when not overloaded', preHandlerNextCalled);

  // preHandler: overloaded
  state.setOverloaded(true);
  const res2 = makeRes();
  let preHandlerNextCalledOverloaded = false;
  hooks['preHandler'](makeReq(), res2, () => { preHandlerNextCalledOverloaded = true; });
  assert('preHandler does NOT call done() when overloaded', !preHandlerNextCalledOverloaded);
  assert('preHandler returns 503 when overloaded', res2._code === 503);
  assert('preHandler sends error body when overloaded', res2._body?.error === 'Overloaded');
}

{
  // Without shedding option
  const hooks2 = {};
  const mockFastify2 = { addHook(name, fn) { hooks2[name] = fn; } };
  loopwardenPlugin(mockFastify2, {}, () => {});
  assert('preHandler NOT registered when shedding not provided', hooks2['preHandler'] === undefined);
  assert('onRequest IS registered even without shedding', typeof hooks2['onRequest'] === 'function');
}

// ---- 4. createLoopwardenService starts/stops cleanly -----------------------
console.log('\n--- NestJS: createLoopwardenService ---');

{
  const snapshots = [];
  const service = createLoopwardenService({
    intervalMs: 50,
    onLog: (snap) => snapshots.push(snap),
  });

  service.onModuleInit();
  assert('onModuleInit() starts the watcher without throwing', true);

  await new Promise((resolve) => setTimeout(resolve, 120));

  service.onModuleDestroy();
  assert('onModuleDestroy() stops the watcher without throwing', true);

  const countAfterStop = snapshots.length;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert('no new snapshots after onModuleDestroy()', snapshots.length === countAfterStop);
  assert('at least one snapshot was collected while running', countAfterStop >= 1);
}

// ---- 5. createTraceMiddleware propagates trace context ---------------------
console.log('\n--- NestJS: createTraceMiddleware ---');

{
  const middleware = createTraceMiddleware({ header: 'x-nest-trace', label: 'nest-test' });
  const req = makeReq({ 'x-nest-trace': 'nest-id-999' });
  const res = makeRes();
  let traceFromNest;

  middleware(req, res, () => {
    traceFromNest = getTraceNestJS();
  });

  assert('NestJS traceId propagated into next()', traceFromNest?.traceId === 'nest-id-999');
  assert('NestJS label propagated into next()', traceFromNest?.label === 'nest-test');
}

{
  // No header — UUID fallback
  const middleware = createTraceMiddleware();
  const req = makeReq({});
  const res = makeRes();
  let traceFromNest;
  middleware(req, res, () => { traceFromNest = getTraceNestJS(); });
  assert('NestJS auto-generates UUID when header absent', typeof traceFromNest?.traceId === 'string' && traceFromNest.traceId.length > 0);
}

// ---- 6. Fastify real server: ALS propagation and traceIds (1.2.3 regression) ----
// This section uses a real Fastify instance to catch the ALS scope boundary bug
// where fastify.register() creates an async child scope that breaks ALS propagation.
// Mock-based tests cannot catch this because they bypass Fastify's plugin machinery.
console.log('\n--- Fastify: real server ALS + traceIds (1.2.3 regression) ---');

{
  const snapshots = [];
  const handle = watchEventLoop({ intervalMs: 150, onLog: s => snapshots.push(s) });

  const fastify = Fastify();
  await fastify.register(loopwardenPlugin, { header: 'x-request-id', label: 'smoke-api' });

  let traceBeforeAwait;
  let traceAfterAwait;

  fastify.get('/smoke', async (_request, reply) => {
    traceBeforeAwait = getTraceFastify();
    await new Promise(r => setTimeout(r, 400));
    traceAfterAwait = getTraceFastify();
    reply.send('ok');
  });

  await fastify.listen({ port: 0 });
  const { port } = fastify.server.address();

  await fetch(`http://localhost:${port}/smoke`, {
    headers: { 'x-request-id': 'smoke-fastify-als-test' },
  });

  // Wait for watcher ticks after response
  await new Promise(r => setTimeout(r, 300));

  assert('getCurrentTrace() is set BEFORE first await in route handler', traceBeforeAwait?.traceId === 'smoke-fastify-als-test');
  assert('getCurrentTrace() is set AFTER await in route handler', traceAfterAwait?.traceId === 'smoke-fastify-als-test');

  const captured = snapshots.some(s => s.traceIds?.includes('smoke-fastify-als-test'));
  assert('LoopSnapshot.traceIds populated during Fastify request', captured);

  const afterSnaps = snapshots.filter(s => !s.traceIds?.includes('smoke-fastify-als-test'));
  // At least one snap after response should not have the trace
  assert('LoopSnapshot.traceIds cleared after Fastify response', afterSnaps.length > 0);

  // Abort test: client disconnects mid-request, traceId must not persist after abort completes.
  // We wait for the abort to fire (>80ms), then take a snapshot baseline, then wait for
  // additional ticks and verify the traceId is gone from all subsequent snapshots.
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 80);
  try {
    await fetch(`http://localhost:${port}/smoke`, {
      headers: { 'x-request-id': 'smoke-fastify-abort-test' },
      signal: ac.signal,
    });
  } catch { /* AbortError expected */ }

  // Wait past the abort handling (onRequestAbort runs cleanup), then check future ticks.
  await new Promise(r => setTimeout(r, 200));
  const snapsAfterAbortHandled = snapshots.length;
  await new Promise(r => setTimeout(r, 400));
  const postAbortSnaps = snapshots.slice(snapsAfterAbortHandled);
  const leaks = postAbortSnaps.some(s => s.traceIds?.includes('smoke-fastify-abort-test'));
  assert('traceId not leaked after Fastify client abort', !leaks);

  handle.stop();
  await fastify.close();
}

// ---- 7. OverloadState: raise/lower -----------------------------------------
console.log('\n--- OverloadState: raise/lower ---');

{
  const state = new OverloadState();
  state.raise('warn');
  assert('raise("warn") does NOT set overloaded', !state.isOverloaded);
  state.raise('critical');
  assert('raise("critical") DOES set overloaded', state.isOverloaded);
  state.lower('warn');
  assert('lower("warn") does NOT clear overloaded', state.isOverloaded);
  state.lower('critical');
  assert('lower("critical") clears overloaded', !state.isOverloaded);

  // Verify setOverloaded still works as before
  state.setOverloaded(true);
  assert('setOverloaded(true) still works', state.isOverloaded);
  state.setOverloaded(false);
  assert('setOverloaded(false) still works', !state.isOverloaded);
}

// ---- summary ----------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
