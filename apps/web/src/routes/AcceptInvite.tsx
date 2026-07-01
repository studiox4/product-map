import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite, useInvitePreview, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';
import { appRoutes } from '@/lib/routes';

/** Centered card chrome shared by every terminal state of the accept page. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-md px-6 py-10">
        <div className="mx-auto mt-24 rounded-2xl bg-card p-10 text-center shadow-card">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Accept-invite page (`/invite/:token`). Previews the invite and, when the
 * caller is authenticated, lets them join the project. Logged-out callers are
 * bounced to `/login?next=/invite/:token`. Does its own auth check (the route
 * is a sibling of `/share/:token`, outside the active-project gate).
 */
export default function AcceptInvite() {
  const { token = '' } = useParams();
  const { me, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();

  // While auth resolves, render nothing (avoids a redirect flash).
  if (authLoading) return null;

  // Not authenticated → carry the return target via Login's `?next=` param.
  if (!me) return <Navigate to={`/login?next=/invite/${token}`} replace />;

  if (preview.isLoading) {
    return (
      <Card>
        <Skeleton className="mx-auto h-7 w-48" />
        <Skeleton className="mx-auto mt-4 h-4 w-32" />
        <Skeleton className="mx-auto mt-8 h-10 w-32 rounded-md" />
      </Card>
    );
  }

  if (preview.isError) {
    return (
      <Card>
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">
          Invite not found or revoked.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invite link is no longer valid. Ask the project owner for a new one.
        </p>
      </Card>
    );
  }

  const data = preview.data!;

  if (data.expired) {
    return (
      <Card>
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">
          This invite has expired.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the project owner to send you a fresh invite.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
        {data.projectName}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You've been invited to join as {data.role}.
      </p>
      <div className="mt-8">
        <Button
          disabled={accept.isPending}
          onClick={() =>
            accept.mutate(token, {
              onSuccess: ({ projectId }) => {
                localStorage.setItem('pm.activeProjectId', projectId);
                navigate(appRoutes.dashboard);
              },
            })
          }
        >
          Accept
        </Button>
      </div>
      {accept.isError && (
        <p className="mt-3 text-sm text-red-600">
          {apiErrorMessage(accept.error, "Couldn't accept this invite.")}
        </p>
      )}
    </Card>
  );
}
