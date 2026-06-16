import { useState } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { USER_COLORS, MIN_PASSWORD_LENGTH, type User } from '@productmap/shared';
import { useMe, useUpdateUser, useChangePassword, useLogout, apiErrorMessage } from '@/lib/api';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Settings → Profile tab (settings spec): rename yourself and pick an avatar
 * color from USER_COLORS, with a live avatar preview.
 */
export function ProfileTab() {
  const { data: me } = useMe();

  if (!me) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  return <ProfileForm key={me.id} me={me} />;
}

function ProfileForm({ me }: { me: User }) {
  const [name, setName] = useState(me.name);
  const updateUser = useUpdateUser();

  const trimmed = name.trim();
  const nameDirty = trimmed.length > 0 && trimmed !== me.name;

  function saveName() {
    if (!nameDirty || updateUser.isPending) return;
    updateUser.mutate(
      { id: me.id, name: trimmed },
      {
        onSuccess: () => toast.success('Name updated'),
        onError: () => toast.error("Couldn't update your name"),
      },
    );
  }

  function pickColor(color: string) {
    if (color === me.color || updateUser.isPending) return;
    updateUser.mutate(
      { id: me.id, color },
      {
        onSuccess: () => toast.success('Avatar color updated'),
        onError: () => toast.error("Couldn't update your color"),
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
            Profile
          </CardTitle>
          <CardDescription>
            How you appear on the board, in comments and in activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <span aria-label="Avatar preview">
              <UserAvatar
                user={{ name: trimmed || me.name, color: me.color }}
                className="h-12 w-12 text-base"
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{trimmed || me.name}</p>
              <p className="text-xs text-muted-ink">Live preview</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name">Your name</Label>
            <div className="flex max-w-md items-center gap-2">
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                }}
                className="rounded-xl"
              />
              <Button
                onClick={saveName}
                disabled={!nameDirty || updateUser.isPending}
                variant="secondary"
              >
                Save name
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-body-ink">Avatar color</span>
            <div role="group" aria-label="Avatar color" className="flex items-center gap-2">
              {USER_COLORS.map((color) => {
                const selected = color === me.color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => pickColor(color)}
                    aria-label={`Use color ${color}`}
                    aria-pressed={selected}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full outline-none transition-transform duration-150 ease-out hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected && 'ring-2 ring-ring ring-offset-2',
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {selected ? <Check className="h-4 w-4 text-white" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordCard />
      <SignOutCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const changePassword = useChangePassword();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (changePassword.isPending) return;
    setSuccessMsg(null);
    setErrorMsg(null);
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setSuccessMsg('Password updated.');
          setCurrentPassword('');
          setNewPassword('');
        },
        onError: (err) => {
          setErrorMsg(apiErrorMessage(err, 'Could not change password.'));
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          Change password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="rounded-xl"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              className="rounded-xl"
              required
            />
            <p className="text-xs text-muted-ink">Minimum {MIN_PASSWORD_LENGTH} characters.</p>
          </div>
          {successMsg ? (
            <p className="text-sm text-green-600">{successMsg}</p>
          ) : null}
          {errorMsg ? (
            <p className="text-sm text-destructive">{errorMsg}</p>
          ) : null}
          <Button type="submit" disabled={changePassword.isPending} variant="secondary">
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SignOutCard() {
  const logout = useLogout();

  function handleSignOut() {
    logout.mutate(undefined, {
      onSettled: () => {
        window.location.assign('/login');
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
          Sign out
        </CardTitle>
        <CardDescription>Sign out of this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={handleSignOut}
          disabled={logout.isPending}
          variant="destructive"
        >
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

export default ProfileTab;
