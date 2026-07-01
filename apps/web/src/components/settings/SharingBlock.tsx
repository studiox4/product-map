import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2 } from 'lucide-react';
import type { ShareSections } from '@productmap/shared';
import { ApiError, useCreateShare, useRevokeShare } from '@/lib/api';
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@productmap/ui';

/** Local persistence so the link survives reloads (no list endpoint). */
export const SHARE_URL_KEY = 'pmShareUrl';

const selectClass =
  'rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

const SECTION_LABELS: { key: keyof ShareSections; label: string; hint: string }[] = [
  { key: 'roadmap', label: 'Roadmap timeline', hint: 'The scheduled gantt view' },
  { key: 'board', label: 'Now / Next / Later', hint: 'Horizon columns' },
  { key: 'changelog', label: 'Changelog', hint: 'Shipped releases' },
];

const EXPIRY_OPTIONS: { value: 7 | 30 | 90 | null; label: string }[] = [
  { value: null, label: 'Never expires' },
  { value: 7, label: 'In 7 days' },
  { value: 30, label: 'In 30 days' },
  { value: 90, label: 'In 90 days' },
];

function storedShareUrl(): string | null {
  try {
    return localStorage.getItem(SHARE_URL_KEY);
  } catch {
    return null;
  }
}

function persistShareUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(SHARE_URL_KEY, url);
    else localStorage.removeItem(SHARE_URL_KEY);
  } catch {
    // private mode etc — link still works for the session
  }
}

/**
 * Settings → Workspace → Sharing (dream tier D8): mint a public read-only
 * roadmap link with selective sections + optional expiry, copy it, revoke it.
 * One active link at a time client-side; change config by revoking + re-minting.
 */
export function SharingBlock() {
  const [shareUrl, setShareUrl] = useState<string | null>(storedShareUrl);
  const [copied, setCopied] = useState(false);
  const [sections, setSections] = useState<ShareSections>({
    roadmap: true,
    board: true,
    changelog: true,
  });
  const [expiresInDays, setExpiresInDays] = useState<7 | 30 | 90 | null>(null);
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();

  const absoluteUrl = shareUrl ? `${window.location.origin}${shareUrl}` : null;
  const token = shareUrl?.split('/').pop() ?? null;
  const noSectionChosen = !sections.roadmap && !sections.board && !sections.changelog;

  function toggleSection(key: keyof ShareSections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function create() {
    if (createShare.isPending || noSectionChosen) return;
    createShare.mutate(
      { sections, expiresInDays },
      {
        onSuccess: ({ url }) => {
          setShareUrl(url);
          persistShareUrl(url);
          toast.success('Share link created');
        },
        onError: () => toast.error("Couldn't create the share link"),
      },
    );
  }

  function revoke() {
    if (!token || revokeShare.isPending) return;
    revokeShare.mutate(token, {
      onSuccess: () => {
        setShareUrl(null);
        persistShareUrl(null);
        toast.success('Share link revoked — the page now shows a 404');
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          // Already revoked elsewhere — clear the stale local copy.
          setShareUrl(null);
          persistShareUrl(null);
          toast.success('Share link was already revoked');
          return;
        }
        toast.error("Couldn't revoke the share link");
      },
    });
  }

  async function copy() {
    if (!absoluteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy — select the link text instead");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
          <Link2 className="h-4 w-4" aria-hidden />
          Sharing
        </CardTitle>
        <CardDescription>
          A public, read-only page — no sign-in needed. Choose what's visible and
          an optional expiry. Revoking the link breaks it immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {absoluteUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={absoluteUrl}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="max-w-md rounded-xl font-mono text-xs"
            />
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={revoke}
              disabled={revokeShare.isPending}
            >
              Revoke link
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-ink">Visible sections</legend>
              {SECTION_LABELS.map(({ key, label, hint }) => (
                <label key={key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => toggleSection(key)}
                    className="mt-0.5 h-4 w-4 rounded border-input text-action focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm">
                    <span className="text-ink">{label}</span>
                    <span className="ml-2 text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
              {noSectionChosen && (
                <p className="text-xs text-destructive">Pick at least one section.</p>
              )}
            </fieldset>
            <div className="max-w-xs space-y-2">
              <Label htmlFor="share-expiry">Expiry</Label>
              <select
                id="share-expiry"
                value={expiresInDays ?? 'never'}
                onChange={(e) =>
                  setExpiresInDays(
                    e.target.value === 'never'
                      ? null
                      : (Number(e.target.value) as 7 | 30 | 90),
                  )
                }
                className={selectClass}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? 'never'}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={create}
              disabled={createShare.isPending || noSectionChosen}
            >
              <Link2 aria-hidden />
              Create share link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SharingBlock;
