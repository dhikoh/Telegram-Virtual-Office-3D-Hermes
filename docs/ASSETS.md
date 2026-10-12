# 3D Scene Assets Catalog (Rule 9.4 & REQ-109)

This document lists every asset, geometric primitive, and material utilized by the **Hermes Virtual Office 3D View**. In compliance with **Rule 9.4** and Strict Content Security Policy (CSP), **zero external assets, remote CDNs, or third-party hosted textures** are loaded.

---

## 1. Asset Strategy & Zero Remote Dependencies

- **Remote CDN Assets**: None (Blocked by CSP).
- **External Network Requests for 3D**: None.
- **Procedural Geometric Primitives**: All office architecture, desks, chairs, avatars, and status rings are constructed purely from Three.js built-in primitives (`BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `PlaneGeometry`, `RingGeometry`).
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
- **Local Static Assets in /public**: **0 KB** (100% procedural WebGL geometries)
- **Draw Call Optimization**: Furniture (desks & chairs) rendered via InstancedMesh or lightweight composite groups targeting `< 150 draw calls`.
