import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2 } from 'lucide-react';
import { ApiError, useCreateShare, useRevokeShare } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** Local persistence so the link survives reloads (no list endpoint). */
export const SHARE_URL_KEY = 'pmShareUrl';

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
 * roadmap link, copy it, revoke it. One active link at a time client-side.
 */
export function SharingBlock() {
  const [shareUrl, setShareUrl] = useState<string | null>(storedShareUrl);
  const [copied, setCopied] = useState(false);
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();

  const absoluteUrl = shareUrl ? `${window.location.origin}${shareUrl}` : null;
  const token = shareUrl?.split('/').pop() ?? null;

  function create() {
    if (createShare.isPending) return;
    createShare.mutate(undefined, {
      onSuccess: ({ url }) => {
        setShareUrl(url);
        persistShareUrl(url);
        toast.success('Share link created');
      },
      onError: () => toast.error("Couldn't create the share link"),
    });
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
          A public, read-only roadmap page — no sign-in needed. Revoking the
          link breaks it immediately.
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
          <Button onClick={create} disabled={createShare.isPending}>
            <Link2 aria-hidden />
            Create share link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default SharingBlock;
