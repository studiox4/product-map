import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Archive, Copy, Mail, Send, UserPlus } from 'lucide-react';
import { useActiveProject } from '@/lib/project';
import { appRoutes } from '@/lib/routes';
import {
  apiErrorMessage,
  projectsListKey,
  useAddMember,
  useArchiveProject,
  useCreateInvite,
  useProjectInvites,
  useProjectMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMember,
  useUpdateProject,
  type ProjectMember,
} from '@/lib/api';
import type { Invite, MemberRole } from '@productmap/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@productmap/ui';

const ROLE_OPTIONS: MemberRole[] = ['owner', 'editor', 'viewer'];

const selectClass =
  'rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Settings → Project tab. Owners manage rename / members / invites / delete;
 * viewers see a read-only project name, the members list, and nothing they
 * cannot do. The API enforces the same gates (403/404); the UI mirrors them.
 */
export function ProjectTab() {
  const { projectId, role, projects } = useActiveProject();
  const project = projects.find((p) => p.id === projectId) ?? null;
  const isOwner = role === 'owner';

  if (!projectId || !project) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-ink">
          No active project.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {isOwner ? (
        <>
          <RenameCard projectId={projectId} name={project.name} />
          <SlugCard projectId={projectId} name={project.name} slug={project.slug} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
              {project.name}
            </CardTitle>
            <CardDescription>Only owners can manage this project.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <MembersCard projectId={projectId} isOwner={isOwner} />

      {isOwner ? (
        <>
          <InvitesCard projectId={projectId} />
          <DangerZone projectId={projectId} name={project.name} />
        </>
      ) : null}
    </div>
  );
}

function RenameCard({ projectId, name }: { projectId: string; name: string }) {
  const [value, setValue] = useState(name);
  const qc = useQueryClient();
  const updateProject = useUpdateProject();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next || next === name || updateProject.isPending) return;
    updateProject.mutate(
      { id: projectId, name: next },
      {
        onSuccess: () => {
          // Refresh the project list so the switcher + active-project provider
          // reflect the new name (useUpdateProject only touches overview).
          qc.invalidateQueries({ queryKey: projectsListKey });
          toast.success('Project renamed');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not rename project.')),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          Project name
        </CardTitle>
        <CardDescription>Rename this project.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-xl"
              required
            />
          </div>
          <Button type="submit" disabled={updateProject.isPending} variant="secondary">
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Client-side mirror of the API's slugify (apps/api/src/lib/slug.ts). */
function slugifyClient(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'project';
}

function SlugCard({ projectId, name, slug }: { projectId: string; name: string; slug: string }) {
  const [value, setValue] = useState(slug ?? '');
  const qc = useQueryClient();
  const updateProject = useUpdateProject();
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 60;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!valid || next === slug || updateProject.isPending) return;
    updateProject.mutate(
      { id: projectId, slug: next },
      {
        onSuccess: () => {
          // Refresh the project list so the switcher, Overview nav link, and
          // /app/p/:slug resolution pick up the new slug.
          qc.invalidateQueries({ queryKey: projectsListKey });
          toast.success('Project URL updated');
        },
        onError: (err) =>
          toast.error(apiErrorMessage(err, 'Could not update the URL — that slug may be taken.')),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          Project URL
        </CardTitle>
        <CardDescription>
          The slug in this project’s address: <span className="font-mono">/app/p/{value || '…'}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              id="project-slug"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-xl font-mono"
              required
            />
            {!valid && value.length > 0 ? (
              <p className="text-xs text-destructive">
                Use lowercase letters, numbers, and hyphens only.
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={updateProject.isPending || !valid} variant="secondary">
              Save URL
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setValue(slugifyClient(name))}
            >
              Regenerate from name
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MembersCard({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data: members, isLoading } = useProjectMembers(projectId);

  return (
    <div className="space-y-6">
      {isOwner ? <AddMemberForm projectId={projectId} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
            Members
          </CardTitle>
          <CardDescription>
            {isOwner
              ? 'Change roles or remove people from this project.'
              : 'People with access to this project.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-ink">Loading…</p>
          ) : (
            <ul className="divide-y divide-border">
              {(members ?? []).map((m) => (
                <MemberRow key={m.userId} projectId={projectId} member={m} isOwner={isOwner} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddMemberForm({ projectId }: { projectId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const addMember = useAddMember(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (addMember.isPending) return;
    addMember.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          setEmail('');
          setRole('editor');
          toast.success('Member added');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not add member.')),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          Add member
        </CardTitle>
        <CardDescription>Add an existing workspace user by email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex max-w-lg flex-wrap items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="add-member-email">Email</Label>
            <Input
              id="add-member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="rounded-xl"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-member-role">Role</Label>
            <select
              id="add-member-role"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className={selectClass}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={addMember.isPending} variant="secondary">
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  projectId,
  member,
  isOwner,
}: {
  projectId: string;
  member: ProjectMember;
  isOwner: boolean;
}) {
  const updateMember = useUpdateMember(projectId);
  const removeMember = useRemoveMember(projectId);
  const busy = updateMember.isPending || removeMember.isPending;

  function changeRole(role: MemberRole) {
    if (role === member.role) return;
    updateMember.mutate(
      { userId: member.userId, role },
      {
        onSuccess: () => toast.success(`${member.name} is now ${role}`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not change role.')),
      },
    );
  }

  function remove() {
    removeMember.mutate(member.userId, {
      onSuccess: () => toast.success(`${member.name} removed`),
      onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove member.')),
    });
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{member.name}</p>
        {!isOwner ? <p className="text-xs text-muted-ink capitalize">{member.role}</p> : null}
      </div>
      {isOwner ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            aria-label={`Role for ${member.name}`}
            value={member.role}
            disabled={busy}
            onChange={(e) => changeRole(e.target.value as MemberRole)}
            className={selectClass}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={remove}
            aria-label={`Remove ${member.name}`}
            className="text-destructive hover:text-destructive"
          >
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function InvitesCard({ projectId }: { projectId: string }) {
  const { data: invites, isLoading } = useProjectInvites(projectId);
  const [lastLink, setLastLink] = useState<{ url: string; emailWanted: boolean; sent: boolean } | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <GenerateInviteForm projectId={projectId} onCreated={setLastLink} />

      {lastLink ? <InviteLinkCallout link={lastLink} onDismiss={() => setLastLink(null)} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
            Pending invites
          </CardTitle>
          <CardDescription>Outstanding invite links. Revoke to disable them.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-ink">Loading…</p>
          ) : (invites ?? []).length === 0 ? (
            <p className="text-sm text-muted-ink">No pending invites.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(invites ?? []).map((inv) => (
                <InviteRow key={inv.token} projectId={projectId} invite={inv} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GenerateInviteForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (link: { url: string; emailWanted: boolean; sent: boolean }) => void;
}) {
  const [role, setRole] = useState<MemberRole>('editor');
  const [email, setEmail] = useState('');
  const createInvite = useCreateInvite(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (createInvite.isPending) return;
    const trimmed = email.trim();
    createInvite.mutate(
      { role, ...(trimmed ? { email: trimmed } : {}) },
      {
        onSuccess: (res) => {
          onCreated({
            url: `${location.origin}/invite/${res.token}`,
            emailWanted: !!trimmed,
            sent: res.emailSent,
          });
          setEmail('');
          setRole('editor');
          toast.success('Invite created');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not create invite.')),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          Generate invite
        </CardTitle>
        <CardDescription>
          Create a shareable invite link. Add an email to bind the invite (and send it if SMTP is
          configured).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex max-w-lg flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className={selectClass}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-email">Email (optional)</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="rounded-xl"
            />
          </div>
          <Button type="submit" disabled={createInvite.isPending} variant="secondary">
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            Generate
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function InviteLinkCallout({
  link,
  onDismiss,
}: {
  link: { url: string; emailWanted: boolean; sent: boolean };
  onDismiss: () => void;
}) {
  function copy() {
    void navigator.clipboard.writeText(link.url).then(() => toast.success('Copied to clipboard'));
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p className="mb-1 font-medium text-amber-900 dark:text-amber-200">
        Invite link — share this to grant access.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-amber-100 px-2 py-1 font-mono text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          {link.url}
        </code>
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      {link.emailWanted && !link.sent ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
          Email not configured — share this link manually.
        </p>
      ) : null}
    </div>
  );
}

function InviteRow({ projectId, invite }: { projectId: string; invite: Invite }) {
  const revokeInvite = useRevokeInvite(projectId);

  function revoke() {
    revokeInvite.mutate(invite.token, {
      onSuccess: () => toast.success('Invite revoked'),
      onError: (err) => toast.error(apiErrorMessage(err, 'Could not revoke invite.')),
    });
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink capitalize">{invite.role}</span>
          {invite.email ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-ink">
              <Mail className="h-3 w-3" aria-hidden />
              {invite.email}
            </span>
          ) : (
            <span className="text-xs text-muted-ink">link only</span>
          )}
        </div>
        <p className="truncate font-mono text-xs text-muted-ink">{invite.token}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={revokeInvite.isPending}
        onClick={revoke}
        aria-label={`Revoke invite ${invite.token}`}
        className="text-destructive hover:text-destructive"
      >
        Revoke
      </Button>
    </li>
  );
}

function DangerZone({ projectId, name }: { projectId: string; name: string }) {
  const archiveProject = useArchiveProject();
  const navigate = useNavigate();

  function handleArchive() {
    if (archiveProject.isPending) return;
    if (!window.confirm(`Archive "${name}"? You can restore it from the dashboard.`)) return;
    archiveProject.mutate(projectId, {
      onSuccess: () => {
        toast.success('Project archived');
        navigate(appRoutes.dashboard);
      },
      onError: (err) => toast.error(apiErrorMessage(err, 'Could not archive project.')),
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-destructive">
          Danger zone
        </CardTitle>
        <CardDescription>
          Archiving a project hides it from your dashboard. You can restore it any time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          disabled={archiveProject.isPending}
          onClick={handleArchive}
        >
          <Archive className="mr-1.5 h-4 w-4" aria-hidden />
          Archive project
        </Button>
      </CardContent>
    </Card>
  );
}

export default ProjectTab;
