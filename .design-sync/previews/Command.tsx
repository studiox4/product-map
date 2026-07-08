import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@productmap/ui';

export const Default = () => (
  <Command style={{ width: 360, border: '1px solid var(--pm-line, #e5e5e5)' }}>
    <CommandInput placeholder="Search features, docs, releases…" />
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Features">
        <CommandItem>Public roadmap embed</CommandItem>
        <CommandItem>In-app notifications</CommandItem>
      </CommandGroup>
      <CommandGroup heading="Releases">
        <CommandItem>v2.4 — Notifications</CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);
