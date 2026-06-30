import type { JobQueue, JobHandler } from '@productmap/sdk';

// Default in-process queue. Minimal by design: runs jobs in the current
// process, no durability. The paid edition can register a durable impl later.
export function createInProcessJobQueue(): JobQueue {
  const workers = new Map<string, JobHandler<never>>();

  function handlerFor(name: string): JobHandler<never> {
    const h = workers.get(name);
    if (!h) throw new Error(`No worker registered for job: ${name}`);
    return h;
  }

  return {
    registerWorker(name, handler) {
      workers.set(name, handler as JobHandler<never>);
    },
    async enqueue(name, payload) {
      await handlerFor(name)(payload as never);
    },
    async schedule(name, payload, delayMs) {
      const handler = handlerFor(name); // validate now, before deferring
      setTimeout(() => { void handler(payload as never); }, delayMs);
    },
  };
}
