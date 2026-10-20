# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `fase/6-skill-autoinstall`.
- **Fase Terakhir Diselesaikan:** **Fase 6 (Skill Auto-Install & Catalog Synchronization — Migrasi-Proof)**.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**989 tests passed across 95 test files**).
  * `npm run build`: Production bundle berhasil dibangun (`dist/` clean).
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
- **Fase 6 (Skill Auto-Install & Catalog Synchronization) telah selesai 100%.**
- Menunggu arahan pengguna untuk fase atau penyempurnaan selanjutnya.

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
