# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Fase 3a (Migrasi 011 Provisioning, Shared Schemas, & Repositori State)** — Selesai & Terverifikasi penuh per 2026-10-20.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**895 tests passed across 85 test files**).
- **Fitur Baru Fase 3a:**
  * Migrasi `011_agent_provisioning.sql` menambahkan kolom `provision_state`, `provision_error`, dan `provisioned_at` pada tabel `agents`.
  * `SCHEMA_SPEC` dan skema Zod `AgentSchema`, `AgentPublicSchema`, `AgentInputSchema` diperbarui dengan enumerasi `AGENT_PROVISION_STATES` (`'unprovisioned'` | `'provisioning'` | `'ready'` | `'failed'`).
  * `AgentRepository.create()` menyimpan atribut provisioning secara default `'unprovisioned'`, dan method baru `updateProvisionState()` menangani transisi status siklus hidup profil Hermes secara idempoten dan type-safe.
  * Serialisasi API `toPublic` menyertakan `provision_state`, `provision_error`, dan `provisioned_at` untuk konsumsi klien web.

---

## 2. Fokus & Prioritas Kerja Aktif
- Menjaga kepatuhan mutlak terhadap 3 Hukum Mutlak (Zero-Gap, Strict Single Sub-Task, Memory Sync).
- Prioritas berikutnya: **Sub-task 3.2 (Service Provisioner: `apps/server/src/services/hermes/provisioner.ts`)** — pembuatan profil Hermes via `execFile` (aman dari shell injection) atau simulasi mock, penyusunan `SOUL.md` terisolasi per agen, dan unit test lengkap.

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
