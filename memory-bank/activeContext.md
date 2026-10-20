# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `fase/4-task-visibility` (Dibuat per 2026-10-20 dari branch `fase/3-integrasi-profil`).
- **Fase Terakhir Diselesaikan:** **FASE 4 LENGKAP — Task & Run Visibility (Fase 4a, 4b, 4c)**.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**945 tests passed across 91 test files**).
- **Fitur Selesai di Fase 4c:**
  * Endpoint `GET /api/tasks` mendukung query filter `?source=all|manual|chat`, `agent_id`, dan `status`.
  * Endpoint `GET /api/tasks/:id/events` mengembalikan riwayat urut `run_events` (`task_id`, `run_id`, array `events` dengan payload terurai).
  * Definisi endpoint terdaftar di `packages/shared/src/endpoints.ts` dan tipe `TaskEventsResponse`, `TaskTimelineEvent` di `types.ts`.
  * Peningkatan UI `Tasks.tsx`: Filter pills interaktif (`Semua`, `Langsung`, `Dari Chat`), badge sumber (`💬 Chat Auto-Task` vs `📋 Direct`), badge tool calls (`🔧 X tool(s)`), serta tombol cepat `Timeline` dan `Hasil`.
  * Peningkatan modal `TaskResultModal.tsx`: Tab switcher ("Hasil Output" vs "Timeline Run"), visualisasi jejak node timeline event interaktif dengan format waktu dan ringkasan payload, daftar artefak berkas dengan tombol unduh.
  * Dukungan i18n lengkap untuk namespace `tasks` di Bahasa Indonesia dan English (lolos verifikasi C3c).
  * Test suite `apps/server/src/routes/tasks.test.ts` (15 tests) mencakup filter task, status 404, empty events tanpa run, dan ordered event payloads.

---

## 2. Fokus & Prioritas Kerja Aktif
- **Fase 4 telah selesai 100% dan terverifikasi.**
- Menunggu arahan pengguna untuk merge branch `fase/4-task-visibility` ke branch utama atau melanjutkan ke fase berikutnya sesuai peta rencana pengembangan.

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
