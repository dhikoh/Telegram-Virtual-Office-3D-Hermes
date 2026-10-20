# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `fase/4-task-visibility` (Dibuat per 2026-10-20 dari branch `fase/3-integrasi-profil`).
- **Fase Terakhir Diselesaikan:** **Fase 4b (Backend Task Materializer dari Tool Calls Chat Run)**.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**930 tests passed across 90 test files**).
- **Fitur Baru Fase 4b:**
  * Modul `ChatTaskMaterializer` di `apps/server/src/services/agent-chat/task-materializer.ts` yang menangani siklus hidup materialisasi task otomatis: `recordToolCall()`, `completeTask()`, dan `failTask()`.
  * Penambahan interface `RunChatStreamHandlers` dengan callback `onEvent` pada `HermesClient`, `RealHermesClient`, dan `MockHermesClient`.
  * Integrasi di endpoint `POST /api/agents/:id/chat`: saat event pemanggilan tool (`tool.started`, `tool_call`) terdeteksi, task baru otomatis tercipta di SQLite (`source: 'chat'`, `status: 'running'`, `run_id`, `tool_calls_count`), dan di-update ke `done` / `failed` saat run selesai dengan broadcast SSE real-time (`task_update`).
  * Percakapan biasa tanpa pemanggilan tool terbukti TIDAK mengotori tabel tasks (`casual chat leaves tasks table empty`).
  * Unit test suite baru `apps/server/src/services/agent-chat/task-materializer.test.ts` (5 tests) lulus 100%.

---

## 2. Fokus & Prioritas Kerja Aktif
- Melanjutkan ke **Sub-task 4.3 (Fase 4c: Endpoint & UI Tasks Enhancement)**:
  * Pembaruan endpoint `GET /api/tasks` untuk mendukung filter query `?source=all|chat|manual` dan mengembalikan metadata `source` serta `tool_calls_count`.
  * Pembaruan UI Tasks di frontend (`apps/web`): badge indikator sumber (`Chat Auto-Task` vs `Direct Task`), counter tool call, dan tombol/viewer timeline `run_events` saat task diklik.

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
