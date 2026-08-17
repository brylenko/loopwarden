/**
 * Shared state for load-shedding across HTTP integrations.
 * Updated by your watchEventLoop onThreshold / onRecover handlers.
 */
export class OverloadState {
  #overloaded = false;

  get isOverloaded(): boolean {
    return this.#overloaded;
  }

  setOverloaded(value: boolean): void {
    this.#overloaded = value;
  }
}
