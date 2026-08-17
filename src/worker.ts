import { parentPort } from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';
import { watchEventLoop, type WatchOptions, type WatchHandle } from './core/watch.js';
import type { AlertLevel, LoopSnapshot } from './core/types.js';

const CHANNEL = '__loopwarden' as const;

type WireMessage =
  | { channel: typeof CHANNEL; kind: 'log'; snapshot: LoopSnapshot }
  | { channel: typeof CHANNEL; kind: 'threshold'; snapshot: LoopSnapshot; level: AlertLevel }
  | { channel: typeof CHANNEL; kind: 'recover'; snapshot: LoopSnapshot; level: AlertLevel };

export type WorkerWatchOptions = Omit<WatchOptions, 'onLog' | 'onThreshold' | 'onRecover'>;

/**
 * Call this INSIDE a worker_thread file. Reports snapshots to the parent
 * via postMessage using the same options/thresholds as the main-thread API.
 * Requires `parentPort` to exist (i.e. must run inside a Worker).
 */
export function reportEventLoopToParent(opts: WorkerWatchOptions = {}): WatchHandle {
  if (!parentPort) {
    throw new Error('loopwarden: reportEventLoopToParent() must be called inside a worker_thread');
  }
  const port = parentPort;

  return watchEventLoop({
    ...opts,
    onLog: (snapshot) => port.postMessage({ channel: CHANNEL, kind: 'log', snapshot } satisfies WireMessage),
    onThreshold: (snapshot, level) =>
      port.postMessage({ channel: CHANNEL, kind: 'threshold', snapshot, level } satisfies WireMessage),
    onRecover: (snapshot, level) =>
      port.postMessage({ channel: CHANNEL, kind: 'recover', snapshot, level } satisfies WireMessage),
  });
}

export interface PipeHandlers {
  onLog?: (snapshot: LoopSnapshot) => void;
  onThreshold?: (snapshot: LoopSnapshot, level: AlertLevel) => void;
  onRecover?: (snapshot: LoopSnapshot, level: AlertLevel) => void;
}

/**
 * Call this on the MAIN thread side to receive snapshots from a worker
 * that called reportEventLoopToParent(). Filters out unrelated messages
 * automatically, so it's safe to use alongside your own message protocol.
 */
export function pipeFromWorker(worker: Worker, handlers: PipeHandlers): () => void {
  const listener = (msg: unknown) => {
    if (!isWireMessage(msg)) return;
    if (msg.kind === 'log') handlers.onLog?.(msg.snapshot);
    else if (msg.kind === 'threshold') handlers.onThreshold?.(msg.snapshot, msg.level);
    else if (msg.kind === 'recover') handlers.onRecover?.(msg.snapshot, msg.level);
  };
  worker.on('message', listener);
  return () => worker.off('message', listener);
}

function isWireMessage(msg: unknown): msg is WireMessage {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).channel === CHANNEL;
}
