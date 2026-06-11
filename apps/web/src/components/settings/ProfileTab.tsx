import { useState } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { USER_COLORS, type User } from '@productmap/shared';
import { useMe, useUpdateUser } from '@/lib/api';
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
  const { me } = useMe();

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
  );
}

export default ProfileTab;
