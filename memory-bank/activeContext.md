# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Fase 3c (Endpoint Provisioning & Auto-Provisioning Hiring)** — Selesai & Terverifikasi penuh per 2026-10-20.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**920 tests passed across 87 test files**).
- **Fitur Baru Fase 3c:**
  * Endpoint `POST /api/agents/:id/provision` terdaftar di Fastify dan didefinisikan secara resmi di `packages/shared/src/endpoints.ts`, memfasilitasi provision manual maupun re-provisioning idempoten.
  * Integrasi auto-provisioning di `POST /api/hiring/:id/mark-hired`: saat kandidat diterima, profil Hermes dibuat otomatis dengan `SOUL.md` (menggunakan draft `soul_md` atau generate profil 9 seksi), status langsung beralih ke `ready`, dan tercatat di audit log.
  * Integration test suite baru (`apps/server/src/fase3-provisioning.test.ts` - 15 tests) menguji rute provisioning, validasi input, 404 handling, idempotensi, dan auto-provisioning alur hiring.

---

## 2. Fokus & Prioritas Kerja Aktif
- Menjaga kepatuhan mutlak terhadap 3 Hukum Mutlak (Zero-Gap, Strict Single Sub-Task, Memory Sync).
- Prioritas berikutnya: **Sub-task 3.4 (Script Backfill `scripts/provision-backfill.ts` & Pengkaitan Profil Chat)** — pembuatan script migrasi/backfill dengan opsi `--dry-run` untuk mem-provision seluruh agen yang ada saat ini (Bagas, Orion, Aura, dll.) ke profil masing-masing, serta verifikasi pemisahan sesi chat antar-agen.

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
