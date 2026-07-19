/**
 * A tiny failure-tolerant serial queue for renderer lifecycle transitions.
 *
 * Callers retain the returned task (and its rejection) while the internal tail
 * always recovers, so one failed pack cannot prevent a later pack from loading.
 */
export class AsyncTransitionQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  enqueue(operation) {
    if (typeof operation !== "function") {
      throw new TypeError("AsyncTransitionQueue.enqueue requires a function.");
    }
    const task = this.tail.catch(() => undefined).then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }

  idle() {
    return this.tail;
  }
}
