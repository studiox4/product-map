import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@productmap/ui';

export const Default = () => (
  <Select defaultOpen defaultValue="in_progress">
    <SelectTrigger style={{ width: 220 }}>
      <SelectValue placeholder="Status" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="idea">Idea</SelectItem>
      <SelectItem value="planned">Planned</SelectItem>
      <SelectItem value="in_progress">In progress</SelectItem>
      <SelectItem value="shipped">Shipped</SelectItem>
    </SelectContent>
  </Select>
);
