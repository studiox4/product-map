## Setup

No provider wrapper is required — these are unstyled-by-default Radix primitives styled with Tailwind utility classes baked into `className`. Just import and use.

Dark mode: add the `dark` class to any ancestor element (usually `<html>`). All color tokens below are dual-defined for `:root` and `.dark`.

## Styling idiom: Tailwind utilities + CSS custom properties

Components style themselves via Tailwind classes (e.g. `bg-primary`, `rounded-2xl`, `shadow-card`) that resolve through CSS custom properties, not hard-coded colors. When composing your own layout around these components, match the vocabulary:

**Brand tokens** (`--pm-*`, used directly as Tailwind color/shadow utilities):
- `text-ink` / `text-body-ink` / `text-muted-ink` — primary/secondary/tertiary text
- `bg-action` / `text-action` / `bg-action-soft` — the brand accent (indigo), plus `sage`, `warm`, `cool` as secondary accent families (each with a `DEFAULT`/`-soft` pair, e.g. `bg-sage`, `bg-sage-soft`)
- `bg-surface` (cards), `bg-wash` (hover fill), `bg-inset` (input fill), `bg-panel` (subtle panel)
- `border-line` / `border-line-strong` / `border-line-dash` — hairline borders
- `shadow-card` / `shadow-card-hover` / `shadow-sm-card` — the standard elevation set

**shadcn-style tokens** (HSL triples, used via `bg-primary`, `bg-background`, `bg-destructive`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-popover`, `bg-card`, each with a `-foreground` pair): standard shadcn/ui vocabulary, present for compatibility with the underlying component internals.

**Radius**: `--radius` (0.75rem) drives `rounded-lg`/`rounded-md`/`rounded-sm`. Most components use fuller radii (`rounded-2xl`, `rounded-full`) for a softer, pill-heavy look — match that, don't default to sharp corners.

**Fonts**: `font-display` (Bricolage Grotesque, for headings) and the default `font-sans` (Schibsted Grotesk, for body text) — both loaded remotely via Google Fonts.

## Where the truth lives

Read `styles.css` (and its `@import` closure) for the full token list before styling — it's the actual compiled Tailwind output plus the brand `:root`/`.dark` variable definitions. Per-component `.prompt.md` files show real composition examples ported from this app.

## Composition patterns

- **Compound components compose together**, never standalone: `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`; `Dialog` + `DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`; same pattern for `Sheet`, `DropdownMenu`, `Select`, `Command`.
- **Status/priority pills**: don't reach for `Badge` alone for domain status — this app pairs a small `cn()`-built pill (bg + text color from a status→token map) for feature/doc statuses, and reserves `Badge` for generic labels (e.g. "Beta").
- Overlay components (`Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Select`) are all built on Radix primitives — full keyboard/focus/portal behavior included, no extra wiring needed.

```tsx
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@productmap/ui';

<Card style={{ maxWidth: 360 }}>
  <CardHeader>
    <CardTitle>Public intake form</CardTitle>
    <CardDescription>Collect ideas from customers without asking them to sign in.</CardDescription>
  </CardHeader>
  <CardContent>
    <Button size="sm">Configure</Button>
  </CardContent>
</Card>
```
