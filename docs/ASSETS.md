# 3D Scene Assets Catalog (Rule 9.4 & REQ-109)

This document lists every asset, geometric primitive, and material utilized by the **Hermes Virtual Office 3D View**. In compliance with **Rule 9.4** and Strict Content Security Policy (CSP), **zero external assets, remote CDNs, or third-party hosted textures** are loaded.

---

## 1. Asset Strategy & Zero Remote Dependencies

- **Remote CDN Assets**: None (Blocked by CSP).
- **External Network Requests for 3D**: None.
- **Procedural Geometric Primitives**: All office architecture, desks, agent avatars, and status rings are constructed purely from Three.js built-in primitives (`BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `PlaneGeometry`, `RingGeometry`).
- **Local CC0 GLB Props (Tahap 13)**: Decorative furniture (bookcase, chair, lamp, sofa, plant, table) loads from bundled CC0 GLB files in `apps/web/public/assets/3d/furniture/` — served by the app's own origin, lazily fetched via a dynamic-import `GLTFLoader`, purely additive: a failed load renders nothing and the procedural scene remains complete (see section 4).
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
| **Agent Character** | `CapsuleGeometry(0.3, 0.5)` (body) + `SphereGeometry(0.24)` (head) | Metallic robot chassis with glowing visor and department badge color | `getAgentPlacement` in shared |
| **Status Ring** | `RingGeometry(0.48, 0.58)` | Emissive glowing ring on floor: cyan (thinking), green (working), amber (approval), red (error), grey (idle/offline) | Normalized agent status |
| **Floating Name Tag** | HTML Sprite (capped to visible, max 20) | Glassmorphism badge with agent name, status pill, and current tool name | Agent store state |

---

## 3. Bundle & Size Verification

- **Remote Asset Payload**: **0 KB**
- **Local Static Assets in /public**: **~407 KB** — 6 furniture GLBs (42.5 KB total) + 1 staged character GLB (345 KB) + licence texts; served as static files, never bundled into a JS chunk (Rule 9.2)
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

**Not yet wired (honest gap):** `character/knight.glb` is committed but unused — agent avatars remain procedural robot capsules (section 2). The **KayKit Character Animations** pack could not be downloaded programmatically (itch.io requires a browser/manual download); reattempt manually before wiring 3D avatars.

**Loader rules** (`office-3d/loadFurnitureModels.ts`): `GLTFLoader` via dynamic `import()` (never rides the Office3D code chunk), fetch only after the scene mounts (first paint untouched), ECO/low-power mode fetches nothing, and **any failure resolves to `null`** so the primitive scene stays intact.
