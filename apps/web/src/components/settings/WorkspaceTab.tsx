import { useState } from 'react';
import { toast } from 'sonner';
import { Download, TriangleAlert } from 'lucide-react';
import type { Project } from '@productmap/shared';
import { useOverview, useResetDemo, useUpdateProject, apiPath, type ProjectUpdateInput } from '@/lib/api';
import { useProjectId } from '@/lib/project';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SharingBlock } from '@/components/settings/SharingBlock';
import { demoReady } from '@/demo/demoState';

/**
 * Settings → Workspace tab (settings spec): product name + vision (PATCH
 * product), export download, and a confirm-gated demo-data reset.
 */
export function WorkspaceTab() {
  const { data } = useOverview();
  const product = data?.project;

  if (!product) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  // Keyed so drafts re-initialise if the product changes (e.g. after a reset).
  return <WorkspaceForm key={product.id} product={product} />;
}

function WorkspaceForm({ product }: { product: Project }) {
  const pid = useProjectId();
  const [name, setName] = useState(product.name);
  const [vision, setVision] = useState(product.vision);
  const updateProduct = useUpdateProject();

  const patch: ProjectUpdateInput = {};
  if (name.trim() && name.trim() !== product.name) patch.name = name.trim();
  if (vision.trim() !== product.vision) patch.vision = vision.trim();
  const dirty = Object.keys(patch).length > 0;

  function save() {
    if (!dirty || updateProduct.isPending) return;
    updateProduct.mutate(
      { id: product.id, ...patch },
      {
        onSuccess: () => toast.success('Workspace saved'),
        onError: () => toast.error("Couldn't save the workspace — restored"),
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
            Workspace
          </CardTitle>
          <CardDescription>
            The product name and vision shown across the overview and exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Product name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-md rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-vision">Vision</Label>
            <Input
              id="workspace-vision"
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder="What is this product for?"
              className="max-w-xl rounded-xl"
            />
          </div>
          <Button onClick={save} disabled={!dirty || updateProduct.isPending}>
            Save changes
          </Button>
        </CardContent>
      </Card>

      {/* Export downloads via a real `<a href>` against the live origin, which
          the in-page demo backend can't serve — hide it in demo. */}
      {demoReady() ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold tracking-tight text-ink">
              Export
            </CardTitle>
            <CardDescription>
              Download every document as markdown, zipped by feature.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href={apiPath(pid, 'export.zip')} download>
                <Download aria-hidden />
                Export workspace
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sharing block owned by the share/settings task (dream tier D8). */}
      <SharingBlock />

      <DangerZone />
    </div>
  );
}

function DangerZone() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const resetDemo = useResetDemo();

  function confirmReset() {
    if (resetDemo.isPending) return;
    resetDemo.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast.success('Demo data reset — workspace restored to the seed');
      },
      onError: () => {
        setConfirmOpen(false);
        toast.error("Couldn't reset the demo data");
      },
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-destructive">
          <TriangleAlert className="h-4 w-4" aria-hidden />
          Danger zone
        </CardTitle>
        <CardDescription>
          Wipes every feature, doc, comment and vote, then restores the demo seed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Reset demo data
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold tracking-tight text-ink">
              Reset demo data?
            </DialogTitle>
            <DialogDescription>
              This permanently replaces everything in the workspace with the
              original demo seed. There is no undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReset}
              disabled={resetDemo.isPending}
            >
              Yes, reset everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default WorkspaceTab;
