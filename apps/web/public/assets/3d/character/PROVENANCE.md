# Provenance — 3D characters (`*.glb` in this folder)

## Source

| | |
| --- | --- |
| Pack | **Mini Characters 1.0** (released 17-07-2024) |
| Author | **Kenney** — https://kenney.nl |
| Licence | **Creative Commons Zero (CC0 1.0)** — https://creativecommons.org/publicdomain/zero/1.0/ |
| Licence text (verbatim, as shipped) | `LICENSE-Kenney.txt` |
| Asset page | https://kenney.nl/assets/mini-characters |
| Archive (direct link on that page) | `https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip` |
| Download date | 2026-10-14 (2,403,059 bytes) |
| Files taken from the archive | `Models/GLB format/character-*.glb` (12 of 26 GLBs) + `Models/GLB format/Textures/colormap.png`. The FBX / OBJ / MTL folders, the wheelchairs and the `aid-*` props were never extracted |
| Textures | `colormap.png`, 8,706 bytes, **embedded** into every GLB (see "What was changed") |

The pack ships 26 GLBs. Only the 12 human characters are used — the rest
(wheelchairs, canes, glasses, defibrillators) are not part of the office and
are deliberately not committed.

## What was changed (exactly one edit, no conversion)

Each committed file is its original Kenney GLB with **one string replaced**:
`images[0].uri` changed from the external relative path
`Textures/colormap.png` to `data:image/png;base64,.....` — the same 8,706
bytes, base64. That edit is required because the app loads every GLB through a
single `fetch()` + `GLTFLoader.parse()` on the app's own origin; a relative
texture path would 404 (Rule 9.4: no external requests, no CDN).

**Untouched:** geometry, UVs, materials, rig/skinning, all 32 animation clips
and their samplers. Nothing was quantized, pruned, resampled or re-encoded;
there is no external `.bin` and no second file to fetch.

## Why the previous pack was replaced

Tahap 15 shipped 8 characters from Quaternius *Ultimate Animated Character
Pack — Nov 2019*. Those models carry no texture and their materials are
near-black by design (`Skin` = 0.013, `Black` = 0.006 in both the shipped
`.gltf` and the `.mtl`; the pack's own preview renders silhouetted heads), so
in the office they read as black pawns. The user chose a replacement over a
colour patch. The old files (`suitMale.glb`, `casualFemale.glb`,
`kimonoFemale.glb`, `casual2Male.glb`, `oldClassyMale.glb`, `suitFemale.glb`,
`workerMale.glb`, `casual3Female.glb`, plus the never-wired `knight.glb`) were
removed in the same commit.

## Committed files

| File | Entry in the archive | Bytes committed | Bytes in archive | Clips | sha256 (first 16) |
| --- | --- | --- | --- | --- | --- |
| `character-female-a.glb` | `character-female-a.glb` | 284604 | 273448 | 32 | `d11f13e133b41edb` |
| `character-female-b.glb` | `character-female-b.glb` | 263300 | 252140 | 32 | `ddd8d4c93ff0c23d` |
| `character-female-c.glb` | `character-female-c.glb` | 263200 | 252040 | 32 | `a2de16c87b6b75db` |
| `character-female-d.glb` | `character-female-d.glb` | 269920 | 258760 | 32 | `b7bdb3b733e79fee` |
| `character-female-e.glb` | `character-female-e.glb` | 259172 | 248012 | 32 | `849c575318caba9a` |
| `character-female-f.glb` | `character-female-f.glb` | 270648 | 259488 | 32 | `661c0e66d54b1282` |
| `character-male-a.glb` | `character-male-a.glb` | 258072 | 246916 | 32 | `5ed18990d5b1c046` |
| `character-male-b.glb` | `character-male-b.glb` | 258492 | 247332 | 32 | `6635d2e1af92f7ff` |
| `character-male-c.glb` | `character-male-c.glb` | 274260 | 263104 | 32 | `20319a0f8dfa28d3` |
| `character-male-d.glb` | `character-male-d.glb` | 256348 | 245184 | 32 | `838112f1b2914412` |
| `character-male-e.glb` | `character-male-e.glb` | 253864 | 242704 | 32 | `e55b662777293f99` |
| `character-male-f.glb` | `character-male-f.glb` | 260544 | 249388 | 32 | `106315a93a16ef36` |

**Total: 12 files, 3 172 424 bytes (3.05 MiB)** — largest file 284,604 bytes.
Files are fetched **lazily, per character id**, so entering the 3D office pulls
only the characters actually in use (Rule 9.3); the loader falls back to the
procedural robot if any file is missing.

Every GLB carries the same **32 clips**:
`static, idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up,
emote-yes, emote-no, holding-*, attack-*, interact-*, wheelchair-*`.
The app plays three of them — `idle`, `walk`, `sit` — through the alias table
in `apps/web/src/components/office/office-3d/glbCharacter.ts`
(`Idle → idle`, `Walk → walk`, `SitDown → sit`).

## Reproduce

```python
import zipfile, base64

src = "kenney_mini-characters.zip"   # direct link on the asset page above
tex = zipfile.ZipFile(src).read("Models/GLB format/Textures/colormap.png")
uri = "data:image/png;base64," + base64.b64encode(tex).decode()
# for each of the 12 stems: read Models/GLB format/<stem>.glb, walk its chunks,
# set images[0].uri = uri in the JSON chunk, re-chunk with 4-byte padding and
# write. No other field is touched.
```

## Verification performed (2026-10-14)

- magic bytes `glTF`, version 2, exactly one `BIN` chunk, every `buffers[i]`
  has **no `uri`** (self-contained), every `images[i]` is a `data:` URI
- `animations` contains `idle`, `walk` and `sit` in all 12 files
- every file parses as JSON; `extensionsRequired` is empty
- committed byte counts recorded in the table above
