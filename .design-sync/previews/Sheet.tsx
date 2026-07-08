import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@productmap/ui';

export const Default = () => (
  <Sheet defaultOpen>
    <SheetTrigger asChild>
      <Button variant="outline">Menu</Button>
    </SheetTrigger>
    <SheetContent side="left" style={{ width: 280 }}>
      <SheetHeader>
        <SheetTitle>Menu</SheetTitle>
        <SheetDescription>Jump to any planning surface.</SheetDescription>
      </SheetHeader>
    </SheetContent>
  </Sheet>
);
