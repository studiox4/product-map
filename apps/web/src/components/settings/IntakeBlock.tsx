import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Inbox } from 'lucide-react';
import { ApiError, useCreateIntake, useRevokeShare } from '@/lib/api';
import { useProjectId } from '@/lib/project';
import { Button, Input, Label, Textarea, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@productmap/ui';

/** Per-project localStorage key so links survive reloads (no list endpoint). */
export const intakeUrlKey = (projectId: string) => `pmIntakeUrl:${projectId}`;

function storedIntakeUrl(projectId: string): string | null {
  try {
    return localStorage.getItem(intakeUrlKey(projectId));
  } catch {
    return null;
  }
}

function persistIntakeUrl(projectId: string, url: string | null) {
  try {
    if (url) localStorage.setItem(intakeUrlKey(projectId), url);
    else localStorage.removeItem(intakeUrlKey(projectId));
  } catch {
    // private mode etc — link still works for the session
  }
}

/**
 * Settings → Workspace → Public idea intake: mint a /p/<token>/submit URL
 * with intro copy + moderation toggle, copy it, revoke it.
 */
export function IntakeBlock() {
  const projectId = useProjectId();
  const createIntake = useCreateIntake();
  const revoke = useRevokeShare();
  const [introMd, setIntroMd] = useState('');
  const [moderation, setModeration] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore persisted link on mount (or when project changes).
  useEffect(() => {
    setUrl(storedIntakeUrl(projectId));
  }, [projectId]);

  // Token is the 3rd path segment of /p/<token>/submit
  const token = url ? url.split('/')[2] : null;
  const absoluteUrl = url ? `${window.location.origin}${url}` : null;

  function create() {
    if (createIntake.isPending) return;
    createIntake.mutate(
      { introMd, moderation, expiresInDays: null },
      {
        onSuccess: ({ url: minted }) => {
          setUrl(minted);
          persistIntakeUrl(projectId, minted);
          toast.success('Intake link created');
        },
        onError: () => toast.error("Couldn't create the intake link"),
      },
    );
  }

  function revokeLink() {
    if (!token || revoke.isPending) return;
    revoke.mutate(token, {
      onSuccess: () => {
        setUrl(null);
        persistIntakeUrl(projectId, null);
        toast.success('Intake link revoked');
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          setUrl(null);
          persistIntakeUrl(projectId, null);
          return;
        }
        toast.error("Couldn't revoke the intake link");
      },
    });
  }

  async function copy() {
    if (!absoluteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy — select the link text instead");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
          <Inbox className="h-4 w-4" aria-hidden />
          Public idea intake
        </CardTitle>
        <CardDescription>
          A public form anyone can use to submit an idea to this project. No
          sign-in required. Revoking breaks the link immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {absoluteUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={absoluteUrl}
              aria-label="Intake link"
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
              onClick={revokeLink}
              disabled={revoke.isPending}
            >
              Revoke link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="intake-intro">Intro copy</Label>
              <Textarea
                id="intake-intro"
                value={introMd}
                onChange={(e) => setIntroMd(e.target.value)}
                maxLength={2000}
                placeholder="Tell visitors what kind of ideas you want."
                className="max-w-xl rounded-xl"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={moderation}
                onChange={(e) => setModeration(e.target.checked)}
                className="h-4 w-4 rounded border-input text-action focus:ring-2 focus:ring-ring"
              />
              Hold submissions for approval before they reach the inbox
            </label>
            <Button onClick={create} disabled={createIntake.isPending}>
              <Inbox aria-hidden />
              Create intake link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default IntakeBlock;
