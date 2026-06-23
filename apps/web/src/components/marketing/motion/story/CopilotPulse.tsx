// apps/web/src/components/marketing/motion/story/CopilotPulse.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

/** Four-point spark that pulses — the AI copilot accent. */
export function CopilotPulse({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="AI copilot spark">
      <m.path
        d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z"
        fill="#6D63F0"
        style={{ transformOrigin: '24px 24px' }}
        initial={animate ? { scale: 0.8, opacity: 0.7 } : false}
        animate={animate ? { scale: [0.9, 1.06, 0.9], opacity: [0.8, 1, 0.8] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}
