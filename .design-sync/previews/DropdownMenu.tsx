import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@productmap/ui';

export const Default = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Plan</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>Planning surfaces</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Board</DropdownMenuItem>
      <DropdownMenuItem>Roadmap</DropdownMenuItem>
      <DropdownMenuItem>Releases</DropdownMenuItem>
      <DropdownMenuItem>Outcomes</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
