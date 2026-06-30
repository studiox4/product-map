export interface JobHandler<T = unknown> {
  (payload: T): Promise<void>;
}

// IMPLEMENTATION CAVEATS for paid-edition authors (do not remove):
// (a) Type-safety gap: `registerWorker<T>` and `enqueue<T>` share only a
//     string `name` key — the generic T is not linked across calls. Nothing
//     prevents enqueuing `{x: 1}` for a worker registered with `{y: string}`.
//     A paid edition must own type-safety (e.g. a discriminated-union job
//     registry that ties payload type to job name at the call sites).
// (b) Fire-and-forget `schedule`: the default in-process implementation would
//     run deferred handlers via `setTimeout` with no await. A rejecting
//     scheduled handler becomes an unhandled promise rejection. A real
//     implementation must add durability and error handling.
// (c) Replaceable seam: this interface ships as a contract only. The paid
//     edition supplies its own durable `JobQueue` implementation; nothing in
//     the open-core wires `JobQueue` into production request paths today.
export interface JobQueue {
  registerWorker<T>(name: string, handler: JobHandler<T>): void;
  enqueue<T>(name: string, payload: T): Promise<void>;
  schedule<T>(name: string, payload: T, delayMs: number): Promise<void>;
}
