# 3D Scene Assets Catalog (Rule 9.4 & REQ-109)

This document lists every asset, geometric primitive, and material utilized by the **Hermes Virtual Office 3D View**. In compliance with **Rule 9.4** and Strict Content Security Policy (CSP), **zero external assets, remote CDNs, or third-party hosted textures** are loaded.

---

## 1. Asset Strategy & Zero Remote Dependencies

- **Remote CDN Assets**: None (Blocked by CSP).
- **External Network Requests for 3D**: None.
- **Procedural Geometric Primitives**: All office architecture, desks, agent avatars, and status rings are constructed purely from Three.js built-in primitives (`BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `PlaneGeometry`, `RingGeometry`).
- **Local CC0 GLB Props (Tahap 13)**: Decorative furniture (bookcase, chair, lamp, sofa, plant, table) loads from bundled CC0 GLB files in `apps/web/public/assets/3d/furniture/` — served by the app's own origin, lazily fetched via a dynamic-import `GLTFLoader`, purely additive: a failed load renders nothing and the procedural scene remains complete (see section 4).
- **Local CC0 GLB Characters (Tahap 15)**: One self-contained GLB per department from Quaternius *Ultimate Animated Character Pack* (CC0 1.0) in `apps/web/public/assets/3d/character/` — same origin, lazy `GLTFLoader`, 8 files / 2.39 MiB total; a failed load falls back to the procedural capsule robot, so the scene never depends on a model (see section 5).
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
| **Agent Character (Tahap 15)** | GLB skinned character per department (Quaternius, `character/*.glb`) with animated `Idle`/`SitDown`/`Walk`; **fallback**: `CapsuleGeometry(0.3, 0.5)` (body) + `SphereGeometry(0.24)` (head) | GLB: `MeshStandardMaterial` di-warnai tint status; fallback: metallic robot chassis, glowing visor, department badge colour | `getAgentPlacement` in shared + `CHARACTER_MODELS` in `office-3d/glbCharacter.ts` |
| **Status Ring** | `RingGeometry(0.48, 0.58)` | Emissive glowing ring on floor: cyan (thinking), green (working), amber (approval), red (error), grey (idle/offline) | Normalized agent status |
| **Floating Name Tag** | HTML Sprite (capped to visible, max 20) | Glassmorphism badge with agent name, status pill, and current tool name | Agent store state |

---

## 3. Bundle & Size Verification

- **Remote Asset Payload**: **0 KB**
- **Local Static Assets in /public**: **~2.8 MB** — 6 furniture GLBs (42.5 KB total) + 8 wired character GLBs (2,503,248 B / 2.39 MiB, largest 407.96 KB ≤ 500 KB) + 1 staged character GLB (`knight.glb`, 345 KB, unwired) + licence texts; served as static files, never bundled into a JS chunk (Rule 9.2)
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
| `character/knight.glb` | 345 KB | KayKit Adventurers Character Pack | Kay Lousberg | CC0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |

Licence texts are committed alongside the models: `furniture/LICENSE-Kenney.txt`, `character/LICENSE-KayKit-Adventurers.txt`.

**Not yet wired (honest gap):** `character/knight.glb` (KayKit Adventurers, 345 KB) remains committed but unused — the wired characters are the Quaternius set below. The **KayKit Character Animations** pack could not be downloaded programmatically (itch.io requires a browser/manual download); it is no longer blocking, because Quaternius ships its own `Idle`/`SitDown`/`Walk` clips.

---

## 5. CC0 Character GLBs (Tahap 15 — provenance, Rule R3)

Source: Quaternius **Ultimate Animated Character Pack** (Nov 2019), CC0 1.0, <https://creativecommons.org/publicdomain/zero/1.0/> — one character per department, downloaded 2026-10-14 from the author's distribution channels and converted locally. **Zero remote/CDN requests at runtime** (Rule 9.4).

| File | Size | Department | Author | Licence |
|---|---|---|---|---|
| `character/suitMale.glb` | 326,472 B | Command | Quaternius | CC0 |
| `character/casualFemale.glb` | 328,716 B | Social | Quaternius | CC0 |
| `character/kimonoFemale.glb` | 407,960 B | Marketing | Quaternius | CC0 |
| `character/casual2Male.glb` | 222,628 B | Sales | Quaternius | CC0 |
| `character/oldClassyMale.glb` | 298,016 B | Analytics | Quaternius | CC0 |
| `character/suitFemale.glb` | 336,628 B | Finance | Quaternius | CC0 |
| `character/workerMale.glb` | 199,996 B | Support | Quaternius | CC0 |
| `character/casual3Female.glb` | 382,832 B | HR | Quaternius | CC0 |

**Total: 8 files, 2,503,248 B (2.39 MiB), largest file 407,960 B (≤ 500 KB).** Conversion (gltf-transform 4.5.1, run outside the repo): filter clips → copy → prune → resample → quantize. Result: self-contained GLB (buffers in the `BIN` chunk, **no external `.bin`**), `extensionsRequired` limited to `KHR_mesh_quantization` (no draco/meshopt, so no decoder chunk), exactly the `Idle` / `SitDown` / `Walk` clips, height normalised to 1.0 with feet at `y = 0`.

Licence + provenance committed next to the models: `character/LICENSE-Quaternius.txt`, `character/PROVENANCE.md` (source, licence URL, download date, conversion command, per-file sizes).

**Loader rules** (`office-3d/loadCharacterModels.ts` + `office-3d/glbCharacter.ts`): `GLTFLoader` via dynamic `import()` (never rides the Office3D code chunk), models fetched from `/public` only after the scene mounts, one shared promise per model (a failed fetch is cached, never retried in a loop), and **any failure resolves to `null`** so `Agent3D` keeps rendering the procedural capsule robot.

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
