import confetti from 'canvas-confetti';

/**
 * Micro-delight helpers (signature-set spec 1.4).
 * All motion is fire-and-forget, ≤500ms, transform/opacity only, and every
 * entry point no-ops when the user prefers reduced motion.
 */

/** Spring-feel settle for drag drops: slight overshoot then rest. */
export const SPRING_EASING = 'cubic-bezier(.34,1.56,.64,1)';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Soft Studio brand colors for confetti. */
const CONFETTI_COLORS = ['#3b82a0', '#7aa7d9', '#8fae8b', '#d9a87a', '#e6ebf2'];

/**
 * 6-8 emoji particles burst outward from the element, 500ms, fire-and-forget.
 * Absolutely-positioned spans on document.body; removed when done.
 */
export function emojiParticleBurst(el: HTMLElement, emoji: string): void {
  if (prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const count = 6 + Math.floor(Math.random() * 3); // 6-8

  for (let i = 0; i < count; i += 1) {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.setAttribute('aria-hidden', 'true');
    span.dataset.delight = 'particle';
    span.style.cssText = [
      'position:fixed',
      `left:${originX}px`,
      `top:${originY}px`,
      'pointer-events:none',
      'z-index:9999',
      'font-size:14px',
      'line-height:1',
      'will-change:transform,opacity',
    ].join(';');
    document.body.appendChild(span);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const distance = 28 + Math.random() * 26;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 12; // slight upward bias

    // jsdom has no Web Animations API — spans are still appended + cleaned up.
    if (typeof span.animate === 'function') {
      span.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1)`,
            opacity: 0,
          },
        ],
        { duration: 500, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
      );
    }
    setTimeout(() => span.remove(), 500);
  }
}

/**
 * Frost shimmer ring for 🧊 Cool: an icy ring expands from the element edge
 * and fades, 400ms, fire-and-forget.
 */
export function frostRing(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const ring = document.createElement('span');
  ring.setAttribute('aria-hidden', 'true');
  ring.dataset.delight = 'frost-ring';
  ring.style.cssText = [
    'position:fixed',
    `left:${rect.left + rect.width / 2}px`,
    `top:${rect.top + rect.height / 2}px`,
    `width:${rect.width + 8}px`,
    `height:${rect.height + 8}px`,
    'pointer-events:none',
    'z-index:9999',
    'border-radius:9999px',
    'border:2px solid #7aa7d9',
    'box-shadow:0 0 12px rgba(122,167,217,0.45)',
    'will-change:transform,opacity',
  ].join(';');
  document.body.appendChild(ring);

  if (typeof ring.animate === 'function') {
    ring.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.9 },
        { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
      ],
      { duration: 400, easing: 'ease-out', fill: 'forwards' },
    );
  }
  setTimeout(() => ring.remove(), 400);
}

/** One-shot confetti for "shipped" — low count, brand colors. */
export function confettiBurst(): void {
  if (prefersReducedMotion()) return;
  try {
    confetti({
      particleCount: 80,
      spread: 70,
      startVelocity: 32,
      origin: { y: 0.65 },
      colors: CONFETTI_COLORS,
      disableForReducedMotion: true,
    });
  } catch {
    // jsdom / no-canvas environments — delight is best-effort
  }
}

export interface HoverPrefetchHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * Debounced hover-prefetch: fires `prefetch` once after the pointer has
 * rested on the element for `delayMs` (default 150ms). Leaving before the
 * debounce elapses cancels; once fired it never fires again (TanStack cache
 * takes over from there).
 */
export function makeHoverPrefetch(prefetch: () => void, delayMs = 150): HoverPrefetchHandlers {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  return {
    onMouseEnter() {
      if (fired || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        prefetch();
      }, delayMs);
    },
    onMouseLeave() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
