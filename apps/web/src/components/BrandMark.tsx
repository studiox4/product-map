/**
 * Product Map — "Stagger" brand mark.
 * Four staggered gantt bars (different start times + lengths); two indigo tones = two streams.
 * Geometry is the single source of truth — matches design/stagger-assets/icon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Product Map"
    >
      <rect x="18" y="22" width="66" height="14" rx="7" fill="#4338CA" />
      <rect x="34" y="44" width="48" height="14" rx="7" fill="#6D63F0" />
      <rect x="18" y="66" width="38" height="14" rx="7" fill="#4338CA" />
      <rect x="44" y="88" width="52" height="14" rx="7" fill="#6D63F0" />
    </svg>
  );
}
