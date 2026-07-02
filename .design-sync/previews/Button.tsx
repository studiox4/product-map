import { Button } from '@productmap/ui';
import { Plus } from 'lucide-react';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <Button variant="default">Save changes</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="outline">Preview</Button>
    <Button variant="destructive">Delete</Button>
    <Button variant="ghost">Dismiss</Button>
    <Button variant="link">Learn more</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
    <Button size="icon" aria-label="Add feature">
      <Plus className="h-4 w-4" />
    </Button>
  </div>
);

export const Disabled = () => <Button disabled>Publishing…</Button>;
