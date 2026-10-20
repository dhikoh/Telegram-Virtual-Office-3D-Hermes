# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Fase 3b (Service Hermes Provisioner & SOUL.md)** — Selesai & Terverifikasi penuh per 2026-10-20.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**905 tests passed across 86 test files**).
- **Fitur Baru Fase 3b:**
  * Implementasi service `provisionAgentProfile` (`apps/server/src/services/hermes/provisioner.ts`) yang idempoten.
  * Sanitasi nama profil aman (`sanitizeProfileSlug`) dan resolusi profil idempoten (`resolveAgentProfileName`).
  * Penyusunan berkas `SOUL.md` berstandar 9 seksi dengan identitas khusus agen dan integrasi daftar skill aktif.
  * Eksekusi aman `execFile` ke CLI `hermes profile create` (mencegah shell injection), toleransi profil yang sudah ada, dan penulisan berkas direktori profil atomik.
  * Unit test suite komprehensif (`apps/server/src/services/hermes/provisioner.test.ts` - 10 tests passed) memverifikasi lifecycle, idempotensi, dan error handling.

---

## 2. Fokus & Prioritas Kerja Aktif
- Menjaga kepatuhan mutlak terhadap 3 Hukum Mutlak (Zero-Gap, Strict Single Sub-Task, Memory Sync).
- Prioritas berikutnya: **Sub-task 3.3 (Endpoint `POST /api/agents/:id/provision` & Integrasi Hiring Auto-Provision)** — mengekspos endpoint rute manual / re-provision dan mengaitkan auto-provisioning saat penerimaan agen baru di `POST /api/hiring/:id/mark-hired`.

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
