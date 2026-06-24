import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/** Wraps the marketing tree so `m.*` components lazy-load DOM animation
 *  features. Keeps the landing bundle small (no full `motion` import). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
