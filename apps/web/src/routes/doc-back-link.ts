import type { DocumentMeta } from '@productmap/shared';
import { appRoutes } from '@/lib/routes';

/**
 * Editor toolbar back-link for a doc's owning surface (dream tier 2):
 * feature-owned docs go back to the board panel, idea-owned docs (pitch
 * pre-promotion) back to the inbox with "← Idea: <title>", anything else
 * (e.g. release notes whose owner isn't loaded here) falls back to the library.
 */
export function docBackLink(
  doc: Pick<DocumentMeta, 'featureId' | 'ideaId'>,
  titles: { featureTitle?: string; ideaTitle?: string } = {},
): { href: string; label: string } {
  if (doc.featureId) {
    return {
      href: `${appRoutes.board}?feature=${doc.featureId}`,
      label: titles.featureTitle ?? 'Back to board',
    };
  }
  if (doc.ideaId) {
    return {
      href: `${appRoutes.inbox}?idea=${doc.ideaId}`,
      label: `Idea: ${titles.ideaTitle ?? '…'}`,
    };
  }
  return { href: appRoutes.docs, label: 'All docs' };
}
