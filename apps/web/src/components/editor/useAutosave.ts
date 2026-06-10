import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveOptions {
  /** Debounce window in ms before a scheduled save fires. Default 800. */
  delay?: number;
  /** Delay in ms before retrying a failed save. Default 3000. */
  retryDelay?: number;
}

export interface Autosave<T> {
  state: AutosaveState;
  /** Queue a value to be saved after the debounce window. Resets the timer. */
  schedule: (value: T) => void;
  /** Save any pending value immediately. */
  flush: () => Promise<void>;
}

/**
 * Debounced autosave with automatic retry on failure.
 * Keeps the latest scheduled value only — one PATCH per typing burst.
 * Never drops data: a failed save flips to `error` and retries with the
 * latest pending value until it succeeds.
 */
export function useAutosave<T>(
  save: (value: T) => Promise<unknown>,
  options: AutosaveOptions = {},
): Autosave<T> {
  const { delay = 800, retryDelay = 3000 } = options;
  const [state, setState] = useState<AutosaveState>('idle');
  const pendingRef = useRef<{ value: T } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const setStateSafe = useCallback((s: AutosaveState) => {
    if (mountedRef.current) setState(s);
  }, []);

  const runSave = useCallback(async () => {
    if (savingRef.current) return;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    savingRef.current = true;
    setStateSafe('saving');
    try {
      await saveRef.current(pending.value);
      savingRef.current = false;
      if (pendingRef.current) {
        // new edits arrived mid-save — save them next
        void runSave();
      } else {
        setStateSafe('saved');
      }
    } catch {
      savingRef.current = false;
      // keep the failed value pending unless newer edits superseded it
      if (!pendingRef.current) pendingRef.current = pending;
      setStateSafe('error');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void runSave(), retryDelay);
    }
  }, [retryDelay, setStateSafe]);

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void runSave(), delay);
    },
    [delay, runSave],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await runSave();
  }, [runSave]);

  return { state, schedule, flush };
}
