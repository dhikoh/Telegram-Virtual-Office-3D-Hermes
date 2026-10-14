# Provenance — 2D street tiles (`*.png` in this folder)

## Source

| | |
| --- | --- |
| Pack | **RPG Urban Pack 1.0** |
| Author | **Kenney** — www.kenney.nl |
| Licence | **CC0 1.0 — Creative Commons Zero, public domain dedication** |
| Licence URL | <https://creativecommons.org/publicdomain/zero/1.0/> |
| Licence text (verbatim, as shipped) | `LICENSE-Kenney.txt` |
| Archive as received | `kenney_rpg-urban-pack.zip` (306 630 bytes, 497 entries) |
| Download date | 2026-10-14 (archive mtime 09:18 +07:00) |
| Files taken from the archive | `Tiles/tile_NNNN.png` (9 files) + `License.txt` only. `Tilemap/*.png`, `Preview.png`, `Sample.png` and the 477 other tile files were **not** extracted — nothing from the pack ships except the nine tiles below and the licence. |
| Editing | none. The PNGs are byte-identical copies of the entries in the zip; no re-encode, no resize, no recolour. |

## Tile index → file

`Tilemap/tilemap.png` is 458×305 px: **27 columns × 18 rows** of 16×16 tiles
with 1 px gutters, so `index = row * 27 + col` (row-major, same order as the
`Tiles/tile_NNNN.png` files).

| Atlas index | Row × Col | Source file | Shipped file | Bytes | What it shows (verified from the pixels) |
| --- | --- | --- | --- | --- | --- |
| 441 | r16 × c9 | `Tiles/tile_0441.png` | `road-asphalt.png` | 140 | Plain dark slate-blue asphalt `#5C6278`, sparse noise specks only, fully opaque, no marking |
| 433 | r16 × c1 | `Tiles/tile_0433.png` | `road-lane-dash.png` | 147 | Asphalt + one lavender-white `#A09CCA` dash, rows 7–8 × cols 3–12 |
| 406 | r15 × c1 | `Tiles/tile_0406.png` | `road-edge-top.png` | 156 | Asphalt + unbroken lavender-white line across the full width on row 2 |
| 460 | r17 × c1 | `Tiles/tile_0460.png` | `road-edge-bottom.png` | 152 | Asphalt + unbroken lavender-white line across the full width on row 13 |
| 63 | r2 × c9 | `Tiles/tile_0063.png` | `sidewalk-slab.png` | 138 | Pale lavender-grey paving `#AAA8BD`: flat rows 0–9, 4 px checker rows 10–14, dark `#69717B` gutter/kerb row 15 |
| 164 | r6 × c2 | `Tiles/tile_0164.png` | `prop-street-lamp.png` | 146 | Street lamp — pole at the right, curved arm, rectangular light head (178 transparent px) |
| 291 | r10 × c21 | `Tiles/tile_0291.png` | `prop-tree-planter.png` | 206 | Small tree with teal canopy in a tan planter box |
| 238 | r8 × c22 | `Tiles/tile_0238.png` | `prop-bush.png` | 198 | Rounded teal bush/canopy with highlight |
| 251 | r9 × c8 | `Tiles/tile_0251.png` | `prop-hydrant.png` | 188 | Red `#C2504D` fire hydrant with a lavender band across the middle |

**Total: 9 PNGs = 1 471 bytes; the folder (incl. this file and the licence) is
about 2.7 KB** — far under the 150 KB budget. The manifest that Map.tsx reads
is `apps/web/src/lib/streetTiles.ts`.

## How each index was identified

1. The atlas and all 486 individual tiles were decoded from the PNG data
   (indexed colour, bit depths 1/2/4/8, sub-byte scanlines un-packed, filters
   0–4 un-filtered) — no eyeballing from a thumbnail.
2. Signature pass over the whole atlas: opaque pixel count, dominant colour,
   coverage, per-row "marking" rows (a row where ≥ 93 % of the pixels are
   lighter than the asphalt), per-row runs of 5–14 marking pixels (dashes),
   and tiles that mix paving with asphalt colours.
3. Every pick was then rendered at 14× nearest-neighbour and inspected, which
   is what separated `road-edge-top` (line on row 2) from
   `road-edge-bottom` (line on row 13) from `road-lane-dash` (line on rows
   7–8, only 10 px wide) — the three asphalt variants look identical at a
   glance.
4. Cross-check: each shipped PNG was decoded again and compared pixel-for-
   pixel with the crop taken from `Tilemap/tilemap.png` at
   `x = col * 17, y = row * 17` — 9/9 identical, which also proves the
   `index = row * 27 + col` mapping.

### Rejected (and why)

| Index | Rejected because |
| --- | --- |
| 405, 432, 435, 459 | zebra crossings (two full-width stripe bands), not lane markings |
| 414, 415 | asphalt whose solid line sits on row 1 — flush with the tile edge, so tiling it would double the line |
| 407 | lane dash *plus* a vertical seam at cols 7–8 (junction marking), not a plain dash |
| 468, 466, 467 | plain asphalt, but with stray lavender pixels at the top-left corner; 441 is the clean one |
| 8, 10, 11, 12, 13, 15, 62, 64, 65, 69 | paving with wall edges — would paint a dark wall line across the sidewalk |
| 36 | paving with literally one colour (100 % `#AAA8BD`) — no pixel art to show |
| 245 (bench), 333 (mailbox) | valid props, left out so the strip stays quiet; easy to add later |
| — | **No standalone kerb tile exists in this pack**: no opaque tile mixes paving with asphalt, and the only light→dark horizontal step band anywhere in the atlas is 225 (a dock/water edge). The kerb therefore comes from row 15 of `sidewalk-slab.png` plus the flat curb face that was already in `Map.tsx`. |

## Where it is used

`apps/web/src/components/office/Map.tsx` → `StreetStrip`:

* `sidewalk-slab.png` tiles the near sidewalk (y 354–366) with
  `patternTransform="translate(0 14)"` so the dark gutter row lands on y = 365
  and the checker band on y = 360–364; a second pattern with
  `translate(0 15)` tiles the far sidewalk (y 414–420) with the gutter row on
  y = 414.
* `road-asphalt.png` fills the whole road (y 366–414) on the same 16 px grid
  (tile tops at 366 / 382 / 398).
* `road-edge-top.png` paints the kerb line on y = 368, `road-lane-dash.png`
  the dashed centre line on y = 389–390 (exactly where the flat white dashes
  used to sit), `road-edge-bottom.png` the far edge line on y = 411.
* The four props stand on the curb line, 12 px tall (16 → 12 keeps the aspect),
  drawn **before** the vehicles so a passing bus is never covered.

**Fallback:** every flat rect that was there before (sidewalk `#D2D8E2`, road
`#B9C0CD`, curb `#8A97A9`, the eight white lane dashes) is still drawn first,
underneath the tiled layer. A `<pattern>` whose `<image>` fails to load
renders nothing, so a 404 shows the old flat street instead of a hole.

## Verification

* 9/9 PNGs byte-identical to the zip entries, 16×16, PNG signature valid.
* Locked by `apps/web/src/components/office/__tests__/street-tiles.test.ts`:
  file existence + size, lane geometry constants, licence and provenance
  content, no `http` URL in the tile module.
