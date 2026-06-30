import { describe, it, expect, vi } from 'vitest';
import { createInProcessJobQueue } from './jobs';

describe('in-process job queue', () => {
  it('runs a registered worker on enqueue', async () => {
    const q = createInProcessJobQueue();
    const seen: string[] = [];
    q.registerWorker<{ id: string }>('greet', async (p) => { seen.push(p.id); });
    await q.enqueue('greet', { id: 'x1' });
    expect(seen).toEqual(['x1']);
  });

  it('throws when enqueuing an unregistered job', async () => {
    const q = createInProcessJobQueue();
    await expect(q.enqueue('missing', {})).rejects.toThrow(/missing/);
  });

  it('defers scheduled jobs', async () => {
    vi.useFakeTimers();
    const q = createInProcessJobQueue();
    const fn = vi.fn(async () => {});
    q.registerWorker('later', fn);
    await q.schedule('later', {}, 1000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
