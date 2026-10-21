# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `master` (Seluruh 6 Fase Integrasi berhasil di-merge dari `fase/6-skill-autoinstall`).
- **Fase Terakhir Diselesaikan:** **Integrasi Hermes ↔ Mini App (Fase 1 s/d 6) TUNTAS 100% di Branch Utama**.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace monorepo.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**1005 tests passed across 95 test files**).
  * `npm run build`: Production bundle berhasil dibangun (`dist/` clean, index gzip 120.85 KB, 0 jsxDEV).
- **Perbaikan Terbaru — Hotfix GET /api/cron (2026-10-20)**:
  * Memperbaiki bug 500 `cronExpr.trim is not a function` akibat payload gateway Hermes mengirimkan field `schedule` berupa objek (`{ kind: 'cron', expr: '0 1 * * *', display: '0 1 * * *' }`).
  * Normalisasi aman melalui `readCronExpr` dan pengetatan `formatCronWIB` (return `null` alih-alih melempar error).
  * Validasi runtime boundary dengan `HermesJobGatewaySchema` (Zod `.passthrough()`) di `real.client.ts`.
  * Rute `/api/cron` tetap 200 untuk job dengan jadwal invalid dan mengembalikan 502 jika gateway gagal total.
- **Penyempurnaan Visual & Karakter (2026-10-21)**:
  * **Sub-Task 1 (Selesai)**: Peningkatan display pemilihan karakter 3D di `apps/web/src/components/agent-sheet/AgentSheetProfile.tsx`. Tombol teks polos ("Wanita A", "Pria B") diubah menjadi kartu visual preview lengkap dengan avatar silhouette berbasis gender, badge inisial huruf model (A s/d F), penanda departemen default (Command, Social, Marketing, Sales, Analytics, Finance, Support, HR, Spesialis), dan checkmark seleksi elegan dengan token tema `office-*`.
  * **Sub-Task 2 (Selesai)**: Integrasi Aset 3D Modular KayKit Prototype Bits (`apps/web/public/assets/3d/modular/`) mencakup 10 model GLB self-contained (dinding modular `wall`, jendela kantor `wall_window`, portal `wall_doorway`, partisi `wall_half`, lantai grid `floor_tile`, pilar penyangga `pillar`, meja kerja `table_work`, meja rapat `table_meeting`, pintu `door`, kotak arsip `box_archive`) dengan embedded texture atlas. Loader lazy `loadModularModels.ts`, tata letak modular `GLTModularOffice.tsx` terintegrasi di `Furniture.tsx`, dan penyesuaian sudut pandang kamera (`DEFAULT_FOV = 44`, `MAX_FOV = 65`) di `CameraController.tsx` untuk cakupan kantor yang lebih luas dan siap diekspansi.
  * **Verifikasi Mandiri**: `tsc --build` lolos 100%, 56/56 tes visual & modular kantor hijau (`modular-office`, `window-view`, `character-3d`, `tahap17-identity`, `theme-guard`), dan `gap-check` lolos 8/8 kriteria (Phase 20).
- **Tahap 20 — Endpoint Mode & Auto-Detect Model (BERJALAN, ST-1 selesai 2026-10-20)**:
  * **ST-1 (selesai)**: normalisasi suffix `/v1` di seluruh jalur. Helper `stripApiSuffix()` di `services/hermes/detect.ts` dipakai di jalur tulis (`normalizeBaseUrl`), jalur baca (`resolveAgentBaseUrl` — membetulkan baris lama di SQLite tanpa migrasi), di dalam `probeModels`, dan di `config.ts` (`HERMES_BASE_URL` dinormalisasi sekali supaya health/hiring/skills/klien gateway ikut bersih). Akar masalah terbukti: `https://openrouter.ai/api/v1/v1/models` membalas 404, `/api/v1/models` membalas 200.
  * **Koreksi diri saat implementasi**: suffix `/api/v1` awalnya ikut di daftar sehingga `https://openrouter.ai/api` terpotong jadi `https://openrouter.ai` (kehilangan `/api`) — ditangkap oleh tes yang baru ditulis, lalu dihapus dari daftar.
  * **Verifikasi mandiri**: `tsc --build` exit 0, `vitest run` **1012 test / 95 file hijau** (+5 tes baru), `gap-check` 8/8 (Phase 19).
  * **Tersisa (ST-2 s/d ST-6)**: endpoint read-only `GET /api/agents/:id/models`, toggle UI `Ikuti Server` / `Custom` (kirim `hermes_base_url: ''` eksplisit), panel daftar model auto-detect terurut A-Z (OpenRouter mengembalikan 468 model → perlu filter + cap render), **model prioritas berurutan per agen beserta rantai fallback-nya**, lalu dokumen Tahap 20.
- **Fitur Selesai di Fase 6 (Skill Auto-Install & Catalog Synchronization):**
  * **Katalog Skill Resmi di Repositori (`skills/`)**:
    - `skills/prospecting/SKILL.md`: Prospecting, lead qualification BANT, cold outreach draft.
    - `skills/marketing-plan/SKILL.md`: Go-to-market plan, omnichannel channel mix, ROI/CAC evaluation.
    - `skills/brand/SKILL.md`: Brand identity, tone of voice, touchpoint guidelines.
    - `skills/sales-enablement/SKILL.md`: Sales deck structure, battlecard, objection handling.
  * **Shared Schemas & Endpoints**:
    - Skema Zod `LocalSkillSchema`, `SkillSyncStatusSchema`, dan `SkillSyncResultSchema` di `packages/shared/src/schemas.ts`.
    - Pendaftaran endpoint `GET /api/skills/sync/status` dan `POST /api/skills/sync` di `packages/shared/src/endpoints.ts`.
  * **Service Core `SkillSynchronizer`**:
    - `apps/server/src/services/hermes/skill-sync.ts`: `readLocalSkillCatalog`, `checkSkillSyncStatus`, `syncSkills`.
    - Sinkronisasi berkas skill ke target `~/.hermes/skills/` secara aman, atomik, dan idempoten.
    - Integrasi audit log `skill.auto_sync` di database SQLite.
    - 9 unit tests di `apps/server/src/services/hermes/skill-sync.test.ts` PASS 100%.
  * **Route Handlers Fastify & API Client**:
    - `GET /api/skills/sync/status` & `POST /api/skills/sync` di `apps/server/src/routes/skills.ts`.
    - 15 integration tests di `apps/server/src/routes/skills.test.ts` PASS 100%.
    - Client API frontend `api.getSkillSyncStatus()` dan `api.syncSkills(force)` di `apps/web/src/services/api.ts`.

---

## 2. Fokus & Prioritas Kerja Aktif
- **Tahap 20 (Endpoint Mode & Auto-Detect Model) telah selesai 100%** — `tsc --build` 0, `vitest run` 1124/106 hijau, `gap-check` 8/8 (Phase 20). Isinya: `stripApiSuffix()` (bug `/v1/v1`), endpoint read-only `GET /api/agents/:id/models`, `api.listAgentModels()`, toggle `Ikuti Server`/`Custom`, panel model A-Z, dan prioritas model berurutan + rantai fallback per agen (tanpa migrasi, DEC-051..056, REQ-120..126).
- Menunggu arahan pengguna: perubahan Tahap 20 sudah di-commit dan di-push; langkah berikutnya menunggu arahan (mis. verifikasi di Telegram/VPS atau penyesuaian UI).

---

## 3. Keputusan Teknis Terbaru (Fase 2e)
- **Granular Real-Time Persistence:** Menggunakan `AgentChatRepository` untuk meng-insert user message dan assistant message di awal stream, lalu meng-update akumulasi teks per delta chunk.
- **Resilient Fallback History:** `GET /api/agents/:id/chat` memprioritaskan sesi gateway untuk keselarasan memori LLM, namun secara cerdas menyematkan potongan respon parsial lokal yang belum tersinkronkan ke gateway, serta melakukan fallback 100% ke database lokal jika gateway mengalami error HTTP 502 / network connection refused.
- **Deterministic Incomplete Message Query:** `getLastIncompleteMessage` memeriksa baris asisten paling baru (`ORDER BY created_at DESC, rowid DESC`), memastikan status `can_continue` bebas dari race condition sub-millisecond.

---

## 4. Invarian yang Harus Dijaga
1. Dilarang keras menyisipkan `// TODO`, `// ... rest of code`, atau fungsi kosong.
2. Setiap kali menulis endpoint baru atau tabel baru, wajib memperbarui `scripts/gap-check.ts` dan fixtures-nya agar status gap-check tetap hijau.
3. Seluruh string baru yang ditampilkan di UI wajib dimasukkan ke dictionary lokalisasi `en` dan `id`.
4. Kerjakan HANYA SATU sub-task dalam satu siklus, lalu berhenti untuk konfirmasi.
