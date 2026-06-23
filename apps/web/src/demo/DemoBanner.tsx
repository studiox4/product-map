import { Link } from 'react-router-dom';
import { demoReady } from './demoState';

/**
 * Slim persistent strip shown at the very top of the authed shell while the
 * in-page demo runtime is live. Reminds the visitor that nothing persists and
 * points them at sign-up. Imports ONLY the lightweight `demoState` leaf, so it
 * stays out of the heavy demo chunk.
 */
export default function DemoBanner() {
  if (!demoReady()) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-action px-4 py-1.5 text-center text-xs font-medium text-white">
      <span>Demo mode — nothing you do is saved.</span>
      <Link
        to="/register"
        className="rounded-full bg-white/15 px-3 py-0.5 font-semibold underline-offset-2 outline-none transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/60"
      >
        Sign up to keep your work
      </Link>
    </div>
  );
}
