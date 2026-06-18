# Product Map — Brand & Logo

The logo exploration and brand assets for Product Map. **Chosen mark: Stagger** — four staggered gantt bars (a roadmap laid out over time), two indigo tones for two work streams.

## View the exploration
Open `index.html` (the hub) in a browser, or serve the folder:
```bash
cd docs/brand && python3 -m http.server   # → http://localhost:8000
```
`index.html` links the versioned rounds `logo-concepts-1.html … -13.html`:
- **1–5** foundations, color variants, designer takes, map metaphor (parked), product-native directions
- **6–8** conceptual round, ten forms, finalist face-off (in-context + motion)
- **9 / 10** full identity systems for the two runners-up (Pivot, Forward)
- **11–12** roadmap takes + "can the bars spell PM?"
- **13** ✓ **Stagger — the chosen identity system** (construction, clearspace, lockups, color, motion, misuse, exports)

## Production assets
The mark ships from `apps/web/` (favicons in `apps/web/public/`, `BrandMark.tsx` in the nav). Source SVGs live here:

| Folder | |
|--------|--|
| `stagger-assets/` | **✓ chosen** — `icon.svg`, `icon-mono.svg`, `icon-reversed.svg`, `lockup-horizontal.svg` + README (geometry, palette, motion) |
| `pivot-assets/` | runner-up (folded plan-sheet) |
| `forward-assets/` | runner-up (bars → arrow) |

## Brand basics (Stagger)
- **Palette:** indigo shadow `#4338CA` · indigo lit `#6D63F0` · ink `#16171C` · paper `#F6F5F1`
- **Wordmark:** Sora 800, tracking −0.03em; "Product" in ink, "Map" in indigo (the two streams)
- **Geometry:** 4 bars, height 14, row pitch 22, starts 18/34/18/44, lengths 66/48/38/52, pill caps — viewBox `0 0 120 120`

Generated with the [`logo-design`](../../) skill (mono-first, dual-read, real construction, reduction-tested).
