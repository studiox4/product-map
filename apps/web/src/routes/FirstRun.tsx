import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Map } from 'lucide-react';
import { useCreateProject, apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * First-run gate (shown by AuthedShell when the caller has no memberships).
 * Creates the caller's first project; on success useCreateProject invalidates
 * the ['projects'] query, the ActiveProjectProvider re-selects, and the app
 * renders the shell normally.
 */
export default function FirstRun() {
  const create = useCreateProject();
  const [name, setName] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      { onError: (err) => toast.error(apiErrorMessage(err, 'Could not create project.')) },
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-action">
            <Map className="h-5 w-5" aria-hidden />
            <span className="font-display text-sm font-semibold">ProductMap</span>
          </div>
          <CardTitle>Create your first project</CardTitle>
          <CardDescription>
            Projects keep your features, ideas, and roadmap together. Name yours to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My App"
                autoFocus
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={create.isPending || name.trim().length === 0}
            >
              {create.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
