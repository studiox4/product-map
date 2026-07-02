import { Input, Label } from '@productmap/ui';

export const Default = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
    <Label htmlFor="feature-title">Feature title</Label>
    <Input id="feature-title" placeholder="Public roadmap embed" />
  </div>
);

export const Disabled = () => <Input disabled defaultValue="Read-only slug" style={{ width: 280 }} />;
