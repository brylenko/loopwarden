import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { reportEventLoopToParent, pipeFromWorker } from '../worker.js';
import type { AlertLevel, LoopSnapshot } from '../core/types.js';

describe('reportEventLoopToParent', () => {
  it('throws when called outside a worker thread', () => {
    assert.throws(
      () => reportEventLoopToParent(),
      /reportEventLoopToParent\(\) must be called inside a worker_thread/,
    );
  });
});

describe('pipeFromWorker', () => {
  it('receives onLog messages from a worker and returns a cleanup fn', async () => {
    // Inline worker script that calls reportEventLoopToParent, waits one tick, then exits.
    const workerCode = `
      import { reportEventLoopToParent } from ${JSON.stringify(new URL('../worker.js', import.meta.url).href)};
      const handle = reportEventLoopToParent({ source: 'w-test', intervalMs: 30 });
      setTimeout(() => { handle.stop(); }, 80);
    `;

    const worker = new Worker(workerCode, { eval: true });
    const snapshots: LoopSnapshot[] = [];

    const unlisten = pipeFromWorker(worker, {
      onLog: (s) => snapshots.push(s),
    });

    await new Promise<void>((resolve, reject) => {
      worker.once('exit', resolve);
      worker.once('error', reject);
    });

    unlisten();

    assert.ok(snapshots.length >= 1, `expected snapshots from worker, got ${snapshots.length}`);
    assert.strictEqual(snapshots[0]?.source, 'w-test');
    assert.strictEqual(typeof snapshots[0]?.p99, 'number');
  });

  it('ignores messages from unrelated protocols', async () => {
    // Worker that sends an unrelated message first, then a real loopwarden one.
    const workerCode = `
      import { parentPort } from 'node:worker_threads';
      import { reportEventLoopToParent } from ${JSON.stringify(new URL('../worker.js', import.meta.url).href)};
      parentPort.postMessage({ channel: 'something-else', data: 42 });
      const handle = reportEventLoopToParent({ source: 'filter-test', intervalMs: 30 });
      setTimeout(() => { handle.stop(); }, 80);
    `;

    const worker = new Worker(workerCode, { eval: true });
    const snapshots: LoopSnapshot[] = [];
    const rawMessages: unknown[] = [];

    worker.on('message', (m) => rawMessages.push(m));
    pipeFromWorker(worker, { onLog: (s) => snapshots.push(s) });

    await new Promise<void>((resolve, reject) => {
      worker.once('exit', resolve);
      worker.once('error', reject);
    });

    assert.ok(rawMessages.length >= 2, 'expected at least 2 raw messages');
    // Only loopwarden messages should reach onLog
    assert.ok(snapshots.every((s) => s.source === 'filter-test'));
  });

  it('onThreshold and onRecover callbacks are wired through', async () => {
    const workerCode = `
      import { reportEventLoopToParent } from ${JSON.stringify(new URL('../worker.js', import.meta.url).href)};
      const handle = reportEventLoopToParent({ source: 'thresh-test', intervalMs: 30, warn: { ms: 0 } });
      setTimeout(() => { handle.stop(); }, 100);
    `;

    const worker = new Worker(workerCode, { eval: true });
    const thresholds: Array<[LoopSnapshot, AlertLevel]> = [];

    pipeFromWorker(worker, {
      onLog: () => { /* noop */ },
      onThreshold: (s, l) => thresholds.push([s, l]),
    });

    await new Promise<void>((resolve, reject) => {
      worker.once('exit', resolve);
      worker.once('error', reject);
    });

    assert.ok(thresholds.length >= 1, `expected threshold events, got ${thresholds.length}`);
    assert.strictEqual(thresholds[0]?.[1], 'warn');
    assert.strictEqual(thresholds[0]?.[0].source, 'thresh-test');
  });
});
