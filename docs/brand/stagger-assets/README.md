# Product Map — Stagger mark assets (CHOSEN MARK)

Canonical geometry (viewBox `0 0 120 120`): 4 task bars, height 14, row pitch 22 (y=22/44/66/88), pill caps (r=7). Staggered starts + lengths = the gantt; alternating tones = two streams.

| Bar | x | y | width |
|-----|---|---|-------|
| 1 | 18 | 22 | 66 |
| 2 | 34 | 44 | 48 |
| 3 | 18 | 66 | 38 |
| 4 | 44 | 88 | 52 |

## Files
| File | Use |
|------|-----|
| `icon.svg` | primary two-tone (shadow + lit streams) |
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
Each bar slides in from the left to its start position, 90ms stagger top→bottom, 520ms each, `cubic-bezier(.2,.75,.2,1)` — the plan fills in.

## Don't
Don't align all bars to one edge (kills the gantt read), don't even out the lengths, don't rotate, don't stretch, don't recolor off-brand.
