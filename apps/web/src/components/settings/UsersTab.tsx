import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useAdminUsers,
  useAdminCreateUser,
  useAdminUpdateUser,
  apiErrorMessage,
  type AdminUser,
} from '@/lib/api';
import { Button } from '@productmap/ui';
import { Input } from '@productmap/ui';
import { Label } from '@productmap/ui';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@productmap/ui';

/**
 * Settings → Users tab (admin-only): list, create, and manage workspace users.
 */
export function UsersTab() {
  const { me } = useAuth();

  if (me?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-ink">
          Only admins can manage users.
        </CardContent>
      </Card>
    );
  }

  return <UsersManager />;
}

function TempPasswordCallout({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  function copy() {
    void navigator.clipboard.writeText(password).then(() => toast.success('Copied to clipboard'));
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p className="mb-1 font-medium text-amber-900 dark:text-amber-200">
        Temporary password — share this once, it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-amber-100 px-2 py-1 font-mono text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          {password}
        </code>
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function UsersManager() {
  const { data: users, isLoading } = useAdminUsers();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <NewUserCard onTempPassword={setTempPassword} />

      {tempPassword ? (
        <TempPasswordCallout password={tempPassword} onDismiss={() => setTempPassword(null)} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
            Team members
          </CardTitle>
          <CardDescription>
            Manage roles, deactivate members, or reset passwords.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-ink">Loading…</p>
          ) : (
            <ul className="divide-y divide-border">
              {(users ?? []).map((user) => (
                <UserRow key={user.id} user={user} onTempPassword={setTempPassword} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewUserCard({ onTempPassword }: { onTempPassword: (pw: string) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const createUser = useAdminCreateUser();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (createUser.isPending) return;
    setErrorMsg(null);
    createUser.mutate(
      { email: email.trim(), name: name.trim(), role },
      {
        onSuccess: ({ tempPassword }) => {
          onTempPassword(tempPassword);
          setEmail('');
          setName('');
          setRole('member');
          toast.success('User created');
        },
        onError: (err) => {
          setErrorMsg(apiErrorMessage(err, 'Could not create user.'));
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          New user
        </CardTitle>
        <CardDescription>
          Invite someone to the workspace. A temporary password will be generated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="rounded-xl"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-name">Name</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-role">Role</Label>
            <select
              id="new-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {errorMsg ? (
            <p className="text-sm text-destructive">{errorMsg}</p>
          ) : null}
          <Button type="submit" disabled={createUser.isPending} variant="secondary">
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Create user
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UserRow({
  user,
  onTempPassword,
}: {
  user: AdminUser;
  onTempPassword: (pw: string) => void;
}) {
  const updateUser = useAdminUpdateUser();

  function toggleRole() {
    const next = user.role === 'admin' ? 'member' : 'admin';
    updateUser.mutate(
      { id: user.id, role: next },
      {
        onSuccess: () => toast.success(`${user.name} is now ${next}`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not update role.')),
      },
    );
  }

  function deactivate() {
    updateUser.mutate(
      { id: user.id, isActive: false },
      {
        onSuccess: () => toast.success(`${user.name} deactivated`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not deactivate user.')),
      },
    );
  }

  function reactivate() {
    updateUser.mutate(
      { id: user.id, isActive: true },
      {
        onSuccess: () => toast.success(`${user.name} reactivated`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not reactivate user.')),
      },
    );
  }

  function resetPassword() {
    updateUser.mutate(
      { id: user.id, resetPassword: true },
      {
        onSuccess: ({ tempPassword }) => {
          if (tempPassword) onTempPassword(tempPassword);
          toast.success('Password reset');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not reset password.')),
      },
    );
  }

  const busy = updateUser.isPending;

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          {!user.isActive && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-ink">
              Deactivated
            </span>
          )}
        </div>
        {user.email ? (
          <p className="truncate text-xs text-muted-ink">{user.email}</p>
        ) : null}
        <p className="text-xs text-muted-ink capitalize">{user.role}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={toggleRole}
          aria-label={`Toggle role for ${user.name}`}
        >
          {user.role === 'admin' ? 'Make member' : 'Make admin'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={resetPassword}
          aria-label={`Reset password for ${user.name}`}
        >
          Reset pw
        </Button>
        {user.isActive ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={deactivate}
            aria-label={`Deactivate ${user.name}`}
            className="text-destructive hover:text-destructive"
          >
            Deactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={reactivate}
            aria-label={`Reactivate ${user.name}`}
          >
            Reactivate
          </Button>
        )}
      </div>
    </li>
  );
}

export default UsersTab;
