import { useState, type FormEvent } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { Plan } from '@productmap/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PlanSwitcherProps {
  plans: Plan[];
  /** null = the real roadmap ("Current"). */
  activePlanId: string | null;
  onSelect: (planId: string | null) => void;
  /** "+ New plan" — snapshots the current schedule under this name. */
  onCreate: (name: string) => void;
  creating?: boolean;
  onRename: (planId: string, name: string) => void;
  onDelete: (planId: string) => void;
}

const pillBase =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring';
const pillOn = 'border-transparent bg-action-soft text-action';
const pillOff = 'border-line text-body-ink hover:bg-surface/60 hover:text-ink';

/**
 * Scenario plan switcher (dream tier 2 §6): "Current" + saved plans +
 * "+ New plan". Selecting a plan enters scenario mode; ⋯ renames/deletes.
 */
export function PlanSwitcher({
  plans,
  activePlanId,
  onSelect,
  onCreate,
  creating,
  onRename,
  onDelete,
}: PlanSwitcherProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<Plan | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function submitNew(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    onCreate(name);
    setNewName('');
    setNewOpen(false);
  }

  function submitRename(e: FormEvent) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!renaming || !name) return;
    onRename(renaming.id, name);
    setRenaming(null);
  }

  return (
    <div data-testid="plan-switcher" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="plan-pill-current"
        aria-pressed={activePlanId === null}
        onClick={() => onSelect(null)}
        className={`${pillBase} ${activePlanId === null ? pillOn : pillOff}`}
      >
        Current
      </button>

      {plans.map((plan) => {
        const active = plan.id === activePlanId;
        return (
          <div
            key={plan.id}
            className={`flex h-8 shrink-0 items-center rounded-full border pl-3 pr-1 transition-all duration-150 ease-out ${
              active ? pillOn : pillOff.replace('hover:bg-surface/60 ', '')
            }`}
          >
            <button
              type="button"
              data-testid={`plan-pill-${plan.id}`}
              aria-pressed={active}
              onClick={() => onSelect(plan.id)}
              className="max-w-44 truncate text-xs font-medium outline-none focus-visible:underline"
              title={plan.name}
            >
              {plan.name}
              {plan.status === 'applied' && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-60">applied</span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid={`plan-menu-${plan.id}`}
                  aria-label={`Plan options for ${plan.name}`}
                  className="ml-1 flex h-6 w-6 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out hover:bg-surface/80 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-testid={`plan-rename-${plan.id}`}
                  onSelect={() => {
                    setRenameValue(plan.name);
                    setRenaming(plan);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`plan-delete-${plan.id}`}
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDelete(plan.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      <button
        type="button"
        data-testid="plan-new"
        onClick={() => setNewOpen(true)}
        className={`${pillBase} ${pillOff} border-dashed`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        New plan
      </button>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New scenario plan</DialogTitle>
            <DialogDescription>
              Snapshots the current schedule into a draft you can reshape without touching the real
              roadmap.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNew} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Q4 stretch"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                className="rounded-full"
                disabled={!newName.trim() || creating}
              >
                Create plan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename plan</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRename} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan-rename">Name</Label>
              <Input
                id="plan-rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full" disabled={!renameValue.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
