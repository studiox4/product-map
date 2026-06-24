import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Renders `value` as a localized integer. On first render (and SSR) it shows the
 * FINAL value (so nothing flashes 0 in prerender / no-JS). After mount, if motion
 * is allowed, it briefly counts up from 0 → value.
 */
export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const dur = 900;
    // NOTE: do not reset to 0 synchronously — the first paint (and SSR) must show
    // the final value. The ramp starts on the first rAF frame, so no-JS / non-
    // animating environments keep the final value.
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  return <>{display.toLocaleString('en-US')}</>;
}
