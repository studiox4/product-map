import { Button, Popover, PopoverContent, PopoverTrigger } from '@productmap/ui';

export const Default = () => (
  <Popover defaultOpen>
    <PopoverTrigger asChild>
      <Button variant="outline">Add evidence</Button>
    </PopoverTrigger>
    <PopoverContent>
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Link a source</p>
      <p style={{ fontSize: 13, color: 'inherit', opacity: 0.7 }}>
        Paste a support ticket, doc, or customer quote to back this feature.
      </p>
    </PopoverContent>
  </Popover>
);
