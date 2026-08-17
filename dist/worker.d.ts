import { Worker } from 'node:worker_threads';
import { a as WatchOptions, W as WatchHandle } from './watch-DJoTnbht.js';
import { L as LoopSnapshot, A as AlertLevel } from './types-BOkHjJO2.js';

type WorkerWatchOptions = Omit<WatchOptions, 'onLog' | 'onThreshold' | 'onRecover'>;
/**
 * Call this INSIDE a worker_thread file. Reports snapshots to the parent
 * via postMessage using the same options/thresholds as the main-thread API.
 * Requires `parentPort` to exist (i.e. must run inside a Worker).
 */
declare function reportEventLoopToParent(opts?: WorkerWatchOptions): WatchHandle;
interface PipeHandlers {
    onLog?: (snapshot: LoopSnapshot) => void;
    onThreshold?: (snapshot: LoopSnapshot, level: AlertLevel) => void;
    onRecover?: (snapshot: LoopSnapshot, level: AlertLevel) => void;
}
/**
 * Call this on the MAIN thread side to receive snapshots from a worker
 * that called reportEventLoopToParent(). Filters out unrelated messages
 * automatically, so it's safe to use alongside your own message protocol.
 */
declare function pipeFromWorker(worker: Worker, handlers: PipeHandlers): () => void;

export { type PipeHandlers, type WorkerWatchOptions, pipeFromWorker, reportEventLoopToParent };
