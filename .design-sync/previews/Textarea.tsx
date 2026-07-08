import { Label, Textarea } from '@productmap/ui';

export const Default = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 300 }}>
    <Label htmlFor="feature-notes">Notes</Label>
    <Textarea id="feature-notes" placeholder="Why does this matter to customers?" style={{ minHeight: 90 }} />
  </div>
);
