# Provenance

Stores ask whoever submits the artwork to confirm they own it. This is the record.

## The mark

| | |
| --- | --- |
| Artwork | The ceciCela seal (two-faced): `seal.svg` and every file derived from it |
| Made in | A Claude design canvas, "Ceci · Cela Seal", owned by the ceciCela author: https://claude.ai/artifact/BGj55WuVZMZmR67gRM2kPf |
| Artboard | Page 2, "Two-faced seal — master and scale check" (`project/Artboard-cps7.dc.html`), canvas version 1792921080-3993 |
| Brief | `logo_prompts.md` rev 2, Prompt 2 "Ceci / Cela (two faces, one hood)", kept in the ceciCela Project |
| How it was made | Drawn as vector paths in the canvas (hand-placed shapes), not generated as a raster image and not traced from one |
| Likeness | No real person is depicted; the period cues are silhouette only (French hood, ruff, pearls) |
| Date | 2026-10-25 |

The alternate in `portrait/` comes from the same canvas, page 1, "Seal — master and scale check" (`project/Main.dc.html`), the same date, from Prompt 1 "The Seal".

## The lettering

| | |
| --- | --- |
| Typeface | Jost SemiBold (weight 600), version 3.710 |
| Source | Cloudflare cdnjs, fontsource-jost 5.3.0: `https://cdnjs.cloudflare.com/ajax/libs/fontsource-jost/5.3.0/files/jost-latin-600-normal.woff` |
| SHA-256 | `30aa823efb48c1ef8f90119f61039d8c58071f2e30a3d7fa130414f81f80a095` |
| License | SIL Open Font License 1.1 (Jost, The Jost Project Authors). Outlining glyphs into a logo is permitted under the OFL; the font itself is not redistributed here. |

The ring letters (C E C I, C E L A) were converted to outlines from that file, each centred on its rotated position as the canvas sets it (66 px for the portrait seal, 80 px for the two-faced seal, in a 1000-unit view box).

## Export

2026-10-25: the canvas's CSS classes were converted to SVG presentation attributes (ink `#111111`, paper `#ffffff`, reversed for `-dark`). The outline variants use a luminance mask, so paper areas are transparent. PNGs were rendered with headless Chromium (Playwright) from the outlined SVGs. The social banner's text is Jost 500 and 600 loaded from the same cdnjs package.

| File | Edits after export |
| --- | --- |
| all | none |
