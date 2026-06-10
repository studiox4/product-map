import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from './useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires save once per burst with the latest value after the debounce window', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, { delay: 800 }));

    act(() => {
      result.current.schedule({ v: 1 });
      result.current.schedule({ v: 2 });
      result.current.schedule({ v: 3 });
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ v: 3 });
    expect(result.current.state).toBe('saved');
  });

  it('debounce resets when schedule is called again before the window elapses', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, { delay: 800 }));

    act(() => {
      result.current.schedule({ v: 1 });
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.schedule({ v: 2 });
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ v: 2 });
  });

  it('enters error state on failure and retries until success', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useAutosave(save, { delay: 800, retryDelay: 3000 }),
    );

    act(() => {
      result.current.schedule({ v: 1 });
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('error');

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ v: 1 });
    expect(result.current.state).toBe('saved');
  });

  it('flush saves a pending value immediately', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, { delay: 800 }));

    act(() => {
      result.current.schedule({ v: 9 });
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ v: 9 });
    expect(result.current.state).toBe('saved');
  });
});
