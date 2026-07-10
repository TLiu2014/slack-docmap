# DocMap brand assets

| File | Use |
| --- | --- |
| `docmap-icon.svg` | Master app icon (square, scalable). Also copied to `ui/public/docmap-icon.svg` for the favicon + header logo. |
| `docmap-icon-512.png` | 512×512 raster — **upload this as the Slack app icon** (Slack requires PNG/JPG, min 512²). |
| `docmap-icon-1024.png` | 1024×1024 raster for high-DPI / larger listings. |
| `docmap-logo.svg` | Compact brand lockup: icon + "DocMap" wordmark on a dark gradient card. |
| `docmap-logo-tagline.svg` | Compact brand lockup: icon + "Slack DocMap" wordmark on a dark gradient card (Slack app-directory / contextual use). |
| `docmap-brand.svg` / `docmap-brand.png` | Wide brand thumbnail (1200×630): icon + wordmark + value-prop subtitle + meta line, over a dark glow/grid backdrop. Social/OG card. Copied to `ui/public/brand-thumbnail.png`. |
| `docmap-brand-clean.svg` / `docmap-brand-clean.png` | Clean wide thumbnail (1200×630): icon + wordmark + subtitle only, centered. Copied to `ui/public/brand-thumbnail-clean.png`. |

## Palette

- Icon gradient: `#6366F1` → `#4338CA` (indigo)
- Lockup background gradient: `#1E1B4B` → `#111524` (dark indigo)
- Thumbnail backdrop: `#0A0D18` base + `#6366F1` radial glow + faint white grid
- Accent (document text lines / theme): `#4F46E5`
- Subtitle text: `#A5B4FC` (indigo-300)
- Document fold: `#C7D2FE` (indigo-200)
- Wordmark: `#FFFFFF` (white, on the dark background)

Wordmark typeface: **Inter** (700 wordmark, 600 subtitle, 500 tags).

## Regenerating the PNGs

The icon is shape-only and rasterizes cleanly with any SVG renderer:

```bash
pnpm dlx sharp-cli --input assets/brand/docmap-icon.svg --output assets/brand/docmap-icon-512.png resize 512 512
pnpm dlx sharp-cli --input assets/brand/docmap-icon.svg --output assets/brand/docmap-icon-1024.png resize 1024 1024
```

The wide brand thumbnails use live `Inter` text. `sharp`/`librsvg` doesn't reliably
load Inter, so render them with `@resvg/resvg-js` and the Inter TTFs (weights
500/600/700). Any renderer that can load the Inter font family at those weights
produces the same result; then copy the PNGs into `ui/public/`:

```bash
cp assets/brand/docmap-brand.png       ui/public/brand-thumbnail.png
cp assets/brand/docmap-brand-clean.png ui/public/brand-thumbnail-clean.png
```
