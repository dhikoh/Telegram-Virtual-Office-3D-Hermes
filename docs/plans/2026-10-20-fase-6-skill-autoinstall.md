# Rencana Implementasi: Fase 6 — Skill Auto-Install & Catalog Synchronization (Migrasi-Proof)

## 1. Konteks & Tujuan
Sesuai `docs/plans/2026-10-19-hermes-miniapp-integration.md`:
- **Masalah:** Saat aplikasi dipasang di server baru (fresh VM / Coolify / migrasi host), profil agen dan gateway Hermes tidak secara otomatis memiliki skill kustom bisnis (`prospecting`, `marketing-plan`, `brand`, `sales-enablement`).
- **Solusi:**
  1. Katalog skill kustom disimpan di dalam repo (`skills/<slug>/SKILL.md`) agar ikut berpindah bersama repositori kode.
  2. Service `SkillSynchronizer` membandingkan katalog skill lokal repo dengan skill yang terpasang di gateway/host (`~/.hermes/skills/`).
  3. Kemampuan auto-install: sinkronisasi berkas skill ke target direktori skill Hermes secara atomik dan idempoten.
  4. Endpoint REST:
     - `GET /api/skills/sync/status`: Status perbandingan skill repo vs gateway.
     - `POST /api/skills/sync`: Eksekusi sinkronisasi/auto-install skill yang belum terpasang.
  5. Pencatatan audit log `skill.auto_sync` untuk transparansi aktivitas sistem.

---

## 2. Struktur Sub-Task Fase 6

### Sub-task 6.1: Katalog Skill Repo & Shared Schemas
- Buat folder katalog skill resmi di repo:
  * `skills/prospecting/SKILL.md` (Lead discovery, ICP qualification, cold outreach draft).
  * `skills/marketing-plan/SKILL.md` (Go-to-market strategy, channel mix, budget projection).
  * `skills/brand/SKILL.md` (Brand identity, tone of voice, visual direction).
  * `skills/sales-enablement/SKILL.md` (Pitch deck outline, objection handling, battlecard).
- Perbarui `@hermes-office/shared`:
  * Tambahkan schema `SkillSyncStatusSchema` dan tipe `SkillSyncStatus`, `SkillSyncResult`.
  * Daftarkan endpoint `GET /api/skills/sync/status` dan `POST /api/skills/sync` di `packages/shared/src/endpoints.ts`.
- Verifikasi typecheck & gap-check.

### Sub-task 6.2: Service SkillSynchronizer (Backend Core)
- Buat `apps/server/src/services/hermes/skill-sync.ts`:
  * `readLocalSkillCatalog()`: Membaca seluruh skill dari direktori `skills/`.
  * `resolveHermesSkillsDir()`: Menentukan direktori `~/.hermes/skills/` (dengan dukungan override).
  * `checkSkillSyncStatus()`: Membandingkan skill lokal dengan gateway (`client.listSkills()`) dan filesystem.
  * `syncSkills()`: Menyalin skill yang belum terpasang ke direktori target secara atomik, aman, dan idempoten.
- Buat test suite `apps/server/src/services/hermes/skill-sync.test.ts`.

### Sub-task 6.3: Endpoint API, Audit Log & UI Integration
- Tambahkan route di `apps/server/src/routes/skills.ts`:
  * `GET /api/skills/sync/status`
  * `POST /api/skills/sync`
- Tambahkan helper method di frontend `apps/web/src/services/api.ts`:
  * `api.getSkillSyncStatus()`
  * `api.syncSkills()`
- Verifikasi komprehensif:
  * `npm run typecheck`
  * `npm run gap-check`
  * `npm test`
  * `npm run build`
- Sinkronisasi Memory Bank & commit per sub-task.
