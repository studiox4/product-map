import MarketingNav from '@/components/marketing/MarketingNav';
import Hero from '@/components/marketing/Hero';
import FeatureHighlights from '@/components/marketing/FeatureHighlights';
import ScreenshotStrip from '@/components/marketing/ScreenshotStrip';
import EthosBand from '@/components/marketing/EthosBand';
import GitHubStars from '@/components/marketing/GitHubStars';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { MotionProvider } from '@/components/marketing/motion/MotionProvider';

/**
 * Presentational marketing landing. NO router hooks, NO react-query, NO
 * providers — so it client-renders bare at `/` and SSR-prerenders with no
 * hydration mismatch. The only runtime fetch is the GitHub stars (GitHubStars),
 * a mount-effect; the nav is fully static and routes to the no-auth /demo.
 */
export default function Marketing() {
  return (
    <MotionProvider>
      <div className="min-h-screen bg-background text-foreground">
        <MarketingNav />
        <main>
          <Hero />
          <FeatureHighlights />
          <ScreenshotStrip />
          <EthosBand />
          <GitHubStars />
        </main>
        <MarketingFooter />
      </div>
    </MotionProvider>
  );
}
