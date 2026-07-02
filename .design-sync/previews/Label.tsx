import { Input, Label } from '@productmap/ui';

export const Default = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 260 }}>
    <Label htmlFor="release-name">Release name</Label>
    <Input id="release-name" placeholder="v2.4 — Notifications" />
  </div>
);
