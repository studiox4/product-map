# Product Map — Pivot mark assets

Canonical geometry (viewBox `0 0 120 120`):
- Front face (shadow): `M28 38 L60 28 L60 92 L28 102 Z` — `#1D4ED8`
- Back face (lit, receding): `M60 28 L88 42 L88 88 L60 92 Z` — `#5E97F6`
- The two face tones meet at `x=60`; that tone step is the crease (no separate line → background-independent).

## Files
| File | Use |
|------|-----|
| `icon.svg` | primary two-tone mark |
| `icon-mono.svg` | single colour (ink `#16171C`, back at 62% opacity) |
| `icon-reversed.svg` | white, for dark surfaces |
| `lockup-horizontal.svg` | mark + wordmark (outline the text before shipping) |

## Wordmark
Sora 800, tracking −0.03em. "Product" = ink `#16171C`, "Map" = cobalt `#1D4ED8` (the two faces, in type).

## Favicon set
Rasterize `icon.svg` to: 16, 32, 180 (apple-touch), 512 (maskable — keep ~20% safe padding).

## Palette
- Cobalt / shadow `#1D4ED8` · Cobalt / lit `#5E97F6` · Ink `#16171C` · Paper `#F6F5F1`

## Motion
Back face `scaleX 0.06 → 1` from crease origin (x=60); 600ms reveal + 200ms settle; `cubic-bezier(.2,.75,.2,1)`.
