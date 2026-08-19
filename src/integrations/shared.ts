import type { AlertLevel } from '../core/types.js';

/**
 * Shared state for load-shedding across HTTP integrations.
 * Updated by your watchEventLoop onThreshold / onRecover handlers.
 *
 * Use `raise(level)` / `lower(level)` in onThreshold / onRecover to avoid
 * bare `if (level === 'critical')` checks in your own code.
 * `setOverloaded(boolean)` is kept for backward compatibility and manual control.
 */
export class OverloadState {
  #overloaded = false;
  static readonly #TRIGGER_LEVELS: ReadonlySet<AlertLevel> = new Set(['critical']);

  get isOverloaded(): boolean {
    return this.#overloaded;
  }

  setOverloaded(value: boolean): void {
    this.#overloaded = value;
  }

  /** Set overloaded if `level` is a trigger level (currently: `'critical'`). */
  raise(level: AlertLevel): void {
    this.#overloaded ||= OverloadState.#TRIGGER_LEVELS.has(level);
  }

  /** Clear overloaded if `level` is a trigger level (currently: `'critical'`). */
  lower(level: AlertLevel): void {
    if (OverloadState.#TRIGGER_LEVELS.has(level)) this.#overloaded = false;
  }
}
