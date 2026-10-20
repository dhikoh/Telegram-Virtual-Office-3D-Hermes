# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Fase 3 (Integrasi Profil Hermes — Dua Dunia Tersambung: Sub-task 3.1 s/d 3.4)** — Selesai & Terverifikasi penuh per 2026-10-20.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**922 tests passed across 88 test files**).
- **Fitur Baru Fase 3 (Lengkap):**
  * **Fase 3a:** Migrasi database `011_agent_provisioning.sql` dengan kolom `provision_state`, `provision_error`, dan `provisioned_at` pada tabel `agents`, skema Zod `AgentProvisionStateSchema`, dan method `AgentRepository.updateProvisionState()`.
  * **Fase 3b:** Service `provisionAgentProfile` di `apps/server/src/services/hermes/provisioner.ts` dengan eksekusi `execFile` aman (tanpa shell injection), penanganan profil Hermes mandiri dengan generator `SOUL.md` 9 seksi (identitas, batasan, gaya bahasa, tools), sanitasi profile slug, dan idempotensi.
  * **Fase 3c:** Endpoint `POST /api/agents/:id/provision` dan integrasi auto-provisioning di `POST /api/hiring/:id/mark-hired` saat kandidat diterima kerja.
  * **Fase 3d:** Service `runProvisionBackfill` (`apps/server/src/services/hermes/backfill.ts`), script CLI `scripts/provision-backfill.ts` (`npm run provision:backfill -- --dry-run`), unit test suite, dan perbaikan candidate discovery di `apps/server/src/db/migrator.ts`.

---

## 2. Fokus & Prioritas Kerja Aktif
- Seluruh 4 sub-task pada Fase 3 telah selesai dan teruji secara menyeluruh.
- Menunggu persetujuan atau instruksi langkah berikutnya dari user.

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
