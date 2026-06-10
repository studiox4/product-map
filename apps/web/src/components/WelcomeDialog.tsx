import { useEffect, useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getStoredUserId,
  setStoredUserId,
  useCreateUser,
  useUsers,
} from '@/lib/api';

/**
 * First-run identity prompt (no auth — demo).
 * - No pmUserId and no users → ask for a name, POST /api/users, store the id.
 * - Users exist but no pmUserId → silently adopt the first user.
 * - pmUserId stored → renders nothing.
 */
export function WelcomeDialog() {
  const { data: users } = useUsers();
  const createUser = useCreateUser();
  const [userId, setUserId] = useState<string | null>(getStoredUserId);
  const [name, setName] = useState('');

  useEffect(() => {
    if (userId || !users || users.length === 0) return;
    setStoredUserId(users[0].id);
    setUserId(users[0].id);
  }, [userId, users]);

  const open = !userId && users !== undefined && users.length === 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createUser.isPending) return;
    createUser.mutate(
      { name: trimmed },
      {
        onSuccess: (user) => {
          setStoredUserId(user.id);
          setUserId(user.id);
        },
      },
    );
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold tracking-tight text-ink">
            Welcome to ProductMap
          </DialogTitle>
          <DialogDescription>
            Add your name so features, docs and activity are attributed to you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="welcome-name">Your name</Label>
            <Input
              id="welcome-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Corban"
              autoFocus
              autoComplete="name"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!name.trim() || createUser.isPending}>
              {createUser.isPending ? 'Saving…' : 'Get started'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default WelcomeDialog;
