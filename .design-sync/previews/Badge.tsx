import { Badge } from '@productmap/ui';

export const Default = () => <Badge>Shipped</Badge>;

export const Variants = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <Badge variant="default">In progress</Badge>
    <Badge variant="secondary">Planned</Badge>
    <Badge variant="destructive">Blocked</Badge>
    <Badge variant="outline">Draft</Badge>
  </div>
);
