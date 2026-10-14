# 3D Scene Assets Catalog (Rule 9.4 & REQ-109)

This document lists every asset, geometric primitive, and material utilized by the **Hermes Virtual Office 3D View**. In compliance with **Rule 9.4** and Strict Content Security Policy (CSP), **zero external assets, remote CDNs, or third-party hosted textures** are loaded.

---

## 1. Asset Strategy & Zero Remote Dependencies

- **Remote CDN Assets**: None (Blocked by CSP).
- **External Network Requests for 3D**: None.
- **Procedural Geometric Primitives**: All office architecture, desks, agent avatars, and status rings are constructed purely from Three.js built-in primitives (`BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `PlaneGeometry`, `RingGeometry`).
- **Local CC0 GLB Props (Tahap 13)**: Decorative furniture (bookcase, chair, lamp, sofa, plant, table) loads from bundled CC0 GLB files in `apps/web/public/assets/3d/furniture/` — served by the app's own origin, lazily fetched via a dynamic-import `GLTFLoader`, purely additive: a failed load renders nothing and the procedural scene remains complete (see section 4).
- **Local CC0 GLB Characters (Tahap 17)**: 12 self-contained GLBs from Kenney *Mini Characters 1.0* (CC0 1.0) in `apps/web/public/assets/3d/character/` — same origin, lazy `GLTFLoader`, 12 files / 3,172,424 B (3.05 MiB), largest 284,604 B; an agent's model is `avatar_style.character` when it is a known id, otherwise the department default, and a failed load falls back to the procedural robot, so the scene never depends on a model (see section 5).
- **Materials**: Standard Three.js `MeshStandardMaterial` and `MeshBasicMaterial` with tailored cyberpunk neon emissive parameters.

---

## 2. Catalog of Scene Objects & Primitives

| Object Name | Geometric Primitives | Material & Visual Styling | Shared Layout Source |
|---|---|---|---|
| **Floor Grid** | `PlaneGeometry(24, 26)` | Dark metallic background (`#070B14`) with procedural neon cyan wireframe grid lines | `packages/shared/src/layout.ts` |
| **Department Rooms (8x)** | `BoxGeometry(4.8, 0.05, 4)` | Glass surface `MeshStandardMaterial` with room-specific emissive neon perimeter edges | `ROOM_LAYOUTS` in shared |
| **Approval Gate** | `BoxGeometry(3.5, 0.05, 1.8)` | Caution stripes with warning amber glow (`#FBBF24`) | `APPROVAL_GATE` in shared |
| **Central Lounge** | `BoxGeometry(6, 0.05, 9)` | Violet glow carpet (`#8B5CF6`, opacity 0.15) | `LOUNGE_AREA` in shared |
| **Desks (Instanced)** | `BoxGeometry(1.6, 0.6, 0.8)` (top) + `CylinderGeometry` (legs) | Sleek dark glass surface (`#111827`) with cyan accent trim | `ROOM_LAYOUTS[*].desk3d` |
| **Lounge Sofas (Instanced)** | `BoxGeometry(1.4, 0.4, 0.7)` | Dark violet cushions with soft rounded corners | `LOUNGE_SLOTS` in shared |
| **Agent Character (Tahap 17)** | GLB skinned character, one per agent (`character/character-{female,male}-{a..f}.glb`, Kenney) with animated `idle`/`walk`/`sit`; **fallback**: `CylinderGeometry(0.26, 0.22, 0.5)` (body) + `SphereGeometry(0.2)` (head) | GLB: `MeshStandardMaterial` (roughness 0.8, metalness 0.0 — the pack's own texture, no tint) + department status ring; fallback: pale toy chassis, glowing visor, department badge colour | `characterModelFor()` in `office-3d/glbCharacter.ts` (`CHARACTER_MODEL_IDS` + `DEPARTMENT_DEFAULT_MODEL` from shared) |
| **Status Ring** | `RingGeometry(0.42, 0.54)` | Emissive glowing ring on floor: cyan (thinking), green (working), amber (approval), red (error), grey (idle/offline) | Normalized agent status |
| **Floating Name Tag** | HTML Sprite (capped to visible, max 20) | Glassmorphism badge with agent name, status pill, current tool name, and the agent's last chat line as a one-line bubble (Tahap 17, expires after `SPEECH_TTL_MS`) | Agent store state |

---

## 3. Bundle & Size Verification

- **Remote Asset Payload**: **0 KB**
- **Local Static Assets in /public**: **~3.2 MB** — 6 furniture GLBs (42.5 KB total) + 12 character GLBs (Kenney Mini Characters, 3,172,424 B / 3.05 MiB, largest 284,604 B) + 9 street PNGs (1.5 KB) + licence/provenance texts; served as static files, never bundled into a JS chunk (Rule 9.2)
- **Draw Call Optimization**: Furniture (desks & chairs) rendered via InstancedMesh or lightweight composite groups targeting `< 150 draw calls`.

---

## 4. CC0 GLB Props (Tahap 13 — provenance, Rule R3)

All files are **Creative Commons Zero (CC0 1.0)**, downloaded 2026-10-14 from the authors' official distribution channels, optimised locally (meshopt/draco-style compression + material strip), and committed to this repository. **Zero remote/CDN requests at runtime** (Rule 9.4).

| File | Size | Pack | Author | Licence | Source |
|---|---|---|---|---|---|
| `furniture/bookcaseOpen.glb` | 12.5 KB | Furniture Kit | Kenney | CC0 | https://kenney.nl/assets/furniture-kit |
| `furniture/chairModernCushion.glb` | 5.5 KB | Furniture Kit | Kenney | CC0 | https://kenney.nl/assets/furniture-kit |
| `furniture/lampRoundFloor.glb` | 4.8 KB | Furniture Kit | Kenney | CC0 | https://kenney.nl/assets/furniture-kit |
| `furniture/loungeSofa.glb` | 7.3 KB | Furniture Kit | Kenney | CC0 | https://kenney.nl/assets/furniture-kit |
| `furniture/pottedPlant.glb` | 5.5 KB | Furniture Kit | Kenney | CC0 | https://kenney.nl/assets/furniture-kit |
| `furniture/sideTable.glb` | 6.3 KB | Furniture Kit | Kenney | CC0 | https://kenney.nl/assets/furniture-kit |

Licence text is committed alongside the models: `furniture/LICENSE-Kenney.txt`.

---

## 5. CC0 Character GLBs (Tahap 17 — provenance, Rule R3)

Source: Kenney **Mini Characters 1.0** (released 17-07-2024), CC0 1.0, <https://creativecommons.org/publicdomain/zero/1.0/> — twelve characters in `apps/web/public/assets/3d/character/`, downloaded 2026-10-14 from the author's official distribution link. **Zero remote/CDN requests at runtime** (Rule 9.4).

| File | Bytes | Default for | Author | Licence |
|---|---|---|---|---|
| `character/character-male-a.glb` | 258,072 | Command | Kenney | CC0 |
| `character/character-female-a.glb` | 284,604 | Social | Kenney | CC0 |
| `character/character-female-b.glb` | 263,300 | Marketing | Kenney | CC0 |
| `character/character-male-b.glb` | 258,492 | Sales | Kenney | CC0 |
| `character/character-male-c.glb` | 274,260 | Analytics | Kenney | CC0 |
| `character/character-female-c.glb` | 263,200 | Finance | Kenney | CC0 |
| `character/character-male-d.glb` | 256,348 | Support | Kenney | CC0 |
| `character/character-female-d.glb` | 269,920 | HR | Kenney | CC0 |
| `character/character-female-e.glb` | 259,172 | — (pickable) | Kenney | CC0 |
| `character/character-female-f.glb` | 270,648 | — (pickable) | Kenney | CC0 |
| `character/character-male-e.glb` | 253,864 | — (pickable) | Kenney | CC0 |
| `character/character-male-f.glb` | 260,544 | — (pickable) | Kenney | CC0 |

**Total: 12 files, 3,172,424 B (3.05 MiB), largest 284,604 B.** Each committed file is the original Kenney GLB with **exactly one string replaced** — `images[0].uri` changed from the relative path `Textures/colormap.png` to the same 8,706 bytes as a base64 `data:` URI — so a single `fetch()` + `GLTFLoader.parse()` on the app's own origin loads the whole model (Rule 9.4). Geometry, UVs, materials, rig and all 32 clips are untouched; there is no external `.bin` and no decoder extension. Height in bind pose is 0.67–0.78 units, normalised to 1.0 by the loader.

Licence + provenance committed next to the models: `character/LICENSE-Kenney.txt`, `character/PROVENANCE.md` (source, licence URL, download date, the one edit made, per-file sizes and sha256 prefixes, reproduce snippet).

**Identity rule** (`office-3d/glbCharacter.ts`): `characterModelFor(department, avatar_style)` returns `avatar_style.character` when it is one of the 12 ids in `CHARACTER_MODEL_IDS` (shared, also validated server-side), otherwise the department default from `DEPARTMENT_DEFAULT_MODEL`, otherwise `null` → procedural robot. The same function feeds the 3D character and the 2D name label, so both views name the same model.

**Why the previous pack was replaced:** Tahap 15 shipped 8 Quaternius characters with near-black untextured materials (`Skin` = 0.013) that read as black pawns. They — plus the never-wired `knight.glb` and both old licence files — were removed in the same commit. The rationale and measurements are recorded in `character/PROVENANCE.md`.

**Loader rules** (`office-3d/loadCharacterModels.ts`): `GLTFLoader` and `SkeletonUtils` via dynamic `import()` (never ride the Office3D code chunk), models fetched from `/public` only after the scene mounts, one shared promise per model id (a failed fetch is cached, never retried in a loop), ECO/low-power fetches nothing, and **any failure resolves to `null`** so `Agent3D` keeps rendering the procedural robot.

**Loader rules** (`office-3d/loadFurnitureModels.ts`): `GLTFLoader` via dynamic `import()` (never rides the Office3D code chunk), fetch only after the scene mounts (first paint untouched), ECO/low-power mode fetches nothing, and **any failure resolves to `null`** so the primitive scene stays intact.

---

## 6. CC0 2D Street Tiles (Tahap 16 — provenance, Rule R3)

Source: Kenney **RPG Urban Pack 1.0**, CC0 1.0, <https://kenney.nl/assets/rpg-urban-pack> — nine 16 px tiles for the street strip in the 2D floor plan (`apps/web/public/assets/2d/street/`). **Zero remote/CDN requests at runtime** (Rule 9.4): static files on the app's own origin, referenced from `apps/web/src/lib/streetTiles.ts`.

| File | Bytes | Atlas index | Shows |
|---|---|---|---|
| `road-asphalt.png` | 140 | 441 | Plain asphalt `#5C6278` |
| `road-lane-dash.png` | 147 | 433 | Asphalt + one lane dash |
| `road-edge-top.png` | 156 | 406 | Asphalt + unbroken edge line (row 2) |
| `road-edge-bottom.png` | 152 | 460 | Asphalt + unbroken edge line (row 13) |
| `sidewalk-slab.png` | 138 | 63 | Paving + 4 px checker + dark gutter row |
| `prop-street-lamp.png` | 146 | 164 | Street lamp |
| `prop-tree-planter.png` | 206 | 291 | Tree in a planter |
| `prop-bush.png` | 198 | 238 | Bush / canopy |
| `prop-hydrant.png` | 188 | 251 | Fire hydrant |

**Total: 9 PNGs = 1,471 B (folder ≈ 2.7 KB).** Files are **byte-identical copies** of `Tiles/tile_NNNN.png` from `kenney_rpg-urban-pack.zip` — nothing re-encoded, resized or recoloured; the remaining 477 tiles and the pack previews were not extracted. Licence text and full provenance (archive size, mtime, atlas row/column per index, how each index was identified, the tiles that were rejected) are committed alongside: `LICENSE-Kenney.txt`, `PROVENANCE.md`.

**Rendering** (`Map.tsx` → `<pattern>` 16 px, `imageRendering: 'pixelated'`): the flat street rectangles are still drawn **first**, so a missing PNG renders nothing and the previous flat street shows through; props are drawn before the vehicle fleet so a passing vehicle is never covered, and the strip geometry (y 354–414) is unchanged — the floor plan above is untouched. 14 tests in `apps/web/src/components/office/__tests__/street-tiles.test.ts`; Map chunk 42.99 KB gzip (budget ≤ 222 KB).
