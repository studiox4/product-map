import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useCreateProject, apiErrorMessage } from '@/lib/api';
import { useActiveProject } from '@/lib/project';
import { appRoutes } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Create-project dialog driven by the `?new=1` search param (the switcher's
 * "New project…" link). On success the new project becomes active and the
 * `new` param is cleared; the ['projects'] invalidation re-lists. First-run
 * (zero-project) users get FirstRun instead — this only fires for callers who
 * already have at least one project.
 */
export function NewProjectDialog() {
  const [params, setParams] = useSearchParams();
  const open = params.get('new') === '1';
  const navigate = useNavigate();
  const { setProjectId } = useActiveProject();
  const create = useCreateProject();
  const [name, setName] = useState('');

  function close() {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
    setName('');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (project) => {
          setProjectId(project.id);
          setName('');
          navigate(appRoutes.dashboard, { replace: true });
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not create project.')),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>
            Projects keep your features, ideas, and roadmap together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={create.isPending || name.trim().length === 0}
            >
              {create.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default NewProjectDialog;
