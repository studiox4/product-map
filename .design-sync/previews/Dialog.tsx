import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@productmap/ui';

export const Default = () => (
  <Dialog defaultOpen>
    <DialogTrigger asChild>
      <Button variant="outline">Delete feature</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete "Public roadmap embed"?</DialogTitle>
        <DialogDescription>
          This removes the feature and its history. Comments and votes are deleted too. This can't be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
