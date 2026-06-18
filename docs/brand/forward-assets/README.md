# Product Map — Forward mark assets

Canonical geometry (viewBox `0 0 120 120`): 5 roadmap bars, height 12.5, pitch 18, left edge x=26, lengths 34·55·76·55·34 (symmetric peak → ► arrow). Pill caps (r=6.25). Centre bar = the lit "next".

## Files
| File | Use |
|------|-----|
| `icon.svg` | primary two-tone (deep bars + lit centre) |
| `icon-mono.svg` | single colour (ink `#16171C`) |
| `icon-reversed.svg` | white, for dark surfaces |
| `lockup-horizontal.svg` | mark + wordmark (outline text before shipping) |

## Wordmark
Sora 800, tracking −0.03em. "Product" = ink `#16171C`, "Map" = indigo `#4338CA`.

## Favicon set
Rasterize `icon.svg` to: 16, 32, 180 (apple-touch), 512 (maskable, ~20% safe padding).

## Palette
- Indigo / shadow `#4338CA` · Indigo / lit `#6D63F0` · Ink `#16171C` · Paper `#F6F5F1`

## Motion
Each bar slides in from the left, 80ms stagger top→bottom, 500ms each, `cubic-bezier(.2,.75,.2,1)` — the bars assemble into the arrow.
