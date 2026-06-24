import { m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEntrance } from './useEntrance';

interface RevealProps {
  children: ReactNode;
  /** stagger offset in seconds */
  delay?: number;
  /** initial y offset in px */
  y?: number;
  className?: string;
}

/**
 * Below-the-fold scroll reveal. SSR-safe: until mount (useEntrance) the element
 * has NO hidden initial, so the prerender ships it visible. After mount it adopts
 * the hidden state and animates in on viewport entry. Reduced motion → static.
 */
export function Reveal({ children, delay = 0, y = 16, className }: RevealProps) {
  const entered = useEntrance();
  const reduce = useReducedMotion();

  if (!entered || reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
