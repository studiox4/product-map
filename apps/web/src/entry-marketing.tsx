import { renderToString } from 'react-dom/server';
import MarketingPage from '@/routes/Marketing';

export { MARKETING_SITE_URL, META_TITLE, META_DESCRIPTION, OG_IMAGE_PATH } from '@/lib/marketing';

/** Returns the static HTML string for the marketing page body. */
export function render(): string {
  return renderToString(<MarketingPage />);
}
