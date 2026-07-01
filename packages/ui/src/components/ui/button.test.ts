import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';

describe('buttonVariants', () => {
  it('defaults to variant=default size=default', () => {
    const classes = buttonVariants();
    expect(classes).toContain('bg-primary');
    expect(classes).toContain('h-9');
  });

  it('applies the requested variant and size', () => {
    const classes = buttonVariants({ variant: 'destructive', size: 'lg' });
    expect(classes).toContain('bg-destructive');
    expect(classes).toContain('h-10');
  });
});
