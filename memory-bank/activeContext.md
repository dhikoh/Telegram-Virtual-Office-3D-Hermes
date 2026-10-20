# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `fase/4-task-visibility` (Dibuat per 2026-10-20 dari branch `fase/3-integrasi-profil`).
- **Fase Terakhir Diselesaikan:** **Fase 4a (Migrasi 012_tasks_visibility.sql, Skema Shared, & Repositori Task)**.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**925 tests passed across 89 test files**).
- **Fitur Baru Fase 4a:**
  * Migrasi `012_tasks_visibility.sql` menambahkan kolom `source` (`'manual' | 'chat' | 'cron'`), `tool_calls_count` (penghitung pemanggilan tool), dan indeks `idx_tasks_run_id` serta `idx_tasks_source`.
  * Definisi `TASK_SOURCES` dan `TaskSourceSchema` di shared package, `SCHEMA_SPEC` C3b diperbarui secara type-safe dan backward-compatible.
  * `TaskRepository` diperbarui dengan dukungan penyimpanan `source` dan `tool_calls_count`, method pencarian `getByRunId()`, `getBySource()`, dan mutasi `incrementToolCalls()`.
  * Unit test suite baru `apps/server/src/db/repositories/tasks.test.ts` memverifikasi struktur kolom, indeks, default values, dan query per run_id.

---

## 2. Fokus & Prioritas Kerja Aktif
- Melanjutkan ke **Sub-task 4.2 (Fase 4b: Backend Task Materializer)**:
  * Menghubungkan streaming run events / dispatcher: saat turn chat menghasilkan $\ge 1$ tool call, secara otomatis membuat entitas `Task` dengan `source: 'chat'`, `status: 'running'`, dan mengupdate status akhir menjadi `done` / `failed` saat run selesai.
  * Memastikan turn chat santai tanpa tool call TIDAK mengotori daftar tasks.

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
