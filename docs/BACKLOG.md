# Product Backlog & Out-of-Scope Ideas (C8)

> **Rule C8**: Do exactly what the specification states. Feature ideas or architectural extensions outside the immediate spec are recorded here for post-v1 evaluation, rather than introduced into active sprint code.

---

## 1. Post-v1 Feature Ideas

- **[BL-001] Peer-to-Peer Agent Communications**: Direct agent-to-agent delegation without intermediate orchestrator dispatching.
- **[BL-002] Multi-Tenant Organization Support**: Ability to manage multiple separate Telegram Mini App offices with distinct Telegram bot credentials and SQLite databases.
- **[BL-003] Automated VPS Profile Provisioning**: Direct SSH or Ansible agent profile creation on the VPS host (currently deliberately disabled in v1 for security; owner runs commands manually via the Hiring Package).
- **[BL-004] Voice Note Task Assignments**: Speech-to-text integration allowing the CEO to assign tasks via Telegram voice messages.
- **[BL-005] Biometric Approval Confirmations**: Native WebAuthn / FaceID confirmation for high-stakes financial approvals inside the Mini App.
- **[BL-006] Camoufox Anti-Detect Browsing**: Considered 2026-10-14 and deferred by owner; verified NOT installed on the VPS (pip/pipx/cache/processes clean). Revisit only if the built-in agent browser is blocked by a target site and RAM headroom is measured on the KVM 2 box.
- **[BL-007] Office Asset Refresh (lantai, dinding, pot, setup kantor)**: Deferred by owner 2026-10-15 and explicitly ranked *below* core office functionality — do not open this thread while any core stage or gate is red; revisit once the office is stable end-to-end. What it would take, for the day it is picked up: (a) lantai & dinding are **procedural today** (`packages/shared/src/roomVariants.ts` colours + `office-3d/Furniture.tsx` boxes/glazing), so a colour change needs no file at all and automatically updates both the 2D plan and the 3D scene; (b) real floor/wall *textures* need seamless PNG tiles (~512×512, < 100 KB each, self-hosted per Rule 9.4); (c) props such as the pot need CC0, self-contained, low-poly `.glb` with no rig, authored at **1 unit ≈ 1 m** — `preparePropForScene` re-origins but never rescales, and every prop is multiplied by `PROP_SCALE = 1.25`; (d) keep the pack identical to the existing `furniture/` GLBs (Kenney Furniture Kit, CC0) so the flat style stays coherent, and remember the loader forces `roughness 0.85 / metalness 0.02`, so glossy or glassy materials will not survive; (e) desk layout ("setup kantor") is pure data in `packages/shared/src/layout.ts`, no asset download involved.
